import { db, must } from '../lib/supabase.js';
import { closeDueEvents, settleEvent } from './judge.js';
import { background, enqueue } from './queue.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** A job whose function was stopped (timeout, redeploy) leaves its row behind. This puts it back on track. */
async function recoverStuckJobs(): Promise<{ requeued: number; timedOut: number }> {
  let requeued = 0;
  let timedOut = 0;

  // Frozen and queued, but no job picked it up.
  const queued = must(
    await db().from('submissions').select('id').eq('status', 'queued').lt('locked_at', minutesAgo(3)).limit(50),
  ) as { id: string }[];
  for (const s of queued) {
    await enqueue('judge', s.id);
    requeued++;
  }

  // Started judging long ago and never finished.
  const stuck = must(
    await db()
      .from('submissions')
      .update({ status: 'error', error: 'Judging took too long and was stopped. Use "Judge again" to retry.' })
      .eq('status', 'analyzing')
      .lt('updated_at', minutesAgo(10))
      .select('id, event_id'),
  ) as { id: string; event_id: string }[];
  timedOut += stuck.length;
  for (const eventId of new Set(stuck.map((s) => s.event_id))) await settleEvent(eventId);

  const preparing = must(
    await db()
      .from('interviews')
      .update({ status: 'error', error: 'Preparing the interview took too long. Start a new one.' })
      .eq('status', 'preparing')
      .lt('created_at', minutesAgo(10))
      .select('id'),
  ) as { id: string }[];
  timedOut += preparing.length;

  // The report is written from a transcript that is already saved, so it is safe to try again.
  const evaluating = must(
    await db().from('interviews').select('id').eq('status', 'evaluating').lt('started_at', minutesAgo(20)).limit(20),
  ) as { id: string }[];
  for (const i of evaluating) {
    await enqueue('interview-evaluate', i.id);
    requeued++;
  }
  return { requeued, timedOut };
}

/** One scheduler pass: closes events whose deadline passed and recovers stuck jobs. Safe to run at any time. */
export async function tick(): Promise<{ closed: number; requeued: number; timedOut: number }> {
  const closed = await closeDueEvents();
  const recovered = await recoverStuckJobs();
  return { closed, ...recovered };
}

let lastTick = 0;

/**
 * Runs a scheduler pass at most once a minute per instance, after the current response.
 * On Vercel Hobby cron jobs run only once a day, so normal traffic is what closes events on time.
 */
export function maybeTick(): void {
  if (Date.now() - lastTick < 60_000) return;
  lastTick = Date.now();
  background(tick(), 'scheduler tick');
}
