import { env } from '../env.js';
import { db, must, mustRows } from '../lib/supabase.js';
import { STORES } from './contest.js';
import { enqueue } from './queue.js';

/** A submission marked "analyzing" longer than this is considered stopped, and no longer takes a slot. */
export const ACTIVE_WINDOW_MIN = 10;
/** Automatic attempts after Gemini was overloaded, before the organizer has to use "Judge again". */
export const MAX_AUTO_ATTEMPTS = 3;
/** Minutes to wait before automatic attempt 2 and 3. */
export const RETRY_DELAYS_MIN = [2, 6];

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** Submissions being judged right now (events and course assignments share the slots), across every instance. */
export async function activeJudgings(): Promise<number> {
  let total = 0;
  for (const store of STORES) {
    const { count, error } = await db()
      .from(store.submissions)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'analyzing')
      .gt('updated_at', minutesAgo(ACTIVE_WINDOW_MIN));
    if (error) throw new Error(`Database error: ${error.message}`);
    total += count ?? 0;
  }
  return total;
}

/**
 * True when this submission, already claimed, went past the limit: two jobs can both see a free slot and claim at
 * the same moment. The ones claimed first (updated_at is set only by the claim, then the id breaks ties) keep the
 * slots, so exactly one of the racing jobs runs and the other goes back to the queue.
 */
export async function overLimit(submissionId: string): Promise<boolean> {
  const rows: { id: string; updated_at: string }[] = [];
  for (const store of STORES) {
    rows.push(
      ...(must(
        await db().from(store.submissions).select('id, updated_at').eq('status', 'analyzing').gt('updated_at', minutesAgo(ACTIVE_WINDOW_MIN)),
      ) as { id: string; updated_at: string }[]),
    );
  }
  return keepsSlot(rows, submissionId, env().JUDGE_CONCURRENCY) === false;
}

/** Whether this submission is among the first `limit` claimed. Pure, for tests. */
export function keepsSlot(rows: { id: string; updated_at: string }[], submissionId: string, limit: number): boolean {
  const order = [...rows].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.id.localeCompare(b.id));
  const index = order.findIndex((r) => r.id === submissionId);
  return index === -1 || index < limit;
}

/** How many more submissions may start now: JUDGE_CONCURRENCY minus the ones running. */
export async function freeSlots(): Promise<number> {
  return Math.max(0, env().JUDGE_CONCURRENCY - (await activeJudgings()));
}

/**
 * Starts queued submissions while there is room, oldest first, skipping the ones waiting for an automatic retry.
 * Called when an event closes, when a submission finishes, and by the scheduler tick. Safe to call at any time:
 * a submission started twice is claimed only once.
 */
export async function dispatchJudging(): Promise<number> {
  let free = await freeSlots();
  if (free === 0) return 0;
  const now = new Date().toISOString();
  let started = 0;
  // Events first, then course assignments, with the slots that are left.
  for (const store of STORES) {
    if (free <= 0) break;
    const ready = mustRows<{ id: string }>(
      await db()
        .from(store.submissions)
        .select(`id, ${store.contests}!inner(judging_paused_at)`)
        .eq('status', 'queued')
        .is(`${store.contests}.judging_paused_at`, null)
        .not('locked_commit_sha', 'is', null)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
        .order('next_attempt_at', { ascending: true, nullsFirst: true })
        .order('locked_at', { ascending: true })
        .limit(free),
    );
    for (const s of ready) await enqueue(store.job, s.id);
    free -= ready.length;
    started += ready.length;
  }
  return started;
}

/** When the next automatic attempt may start, with up to 20% jitter so retries do not all land at once. */
export function nextAttemptAt(attemptsSoFar: number, now = Date.now(), random: () => number = Math.random): Date {
  const minutes = RETRY_DELAYS_MIN[Math.min(attemptsSoFar - 1, RETRY_DELAYS_MIN.length - 1)] ?? RETRY_DELAYS_MIN.at(-1)!;
  return new Date(now + minutes * 60_000 * (1 + random() * 0.2));
}
