import { RubricSchema } from '@skillproof/shared';
import { analyzeRepo, type RepoRow } from '../engine/analyze.js';
import { getHeadSha, getRepoMeta } from '../lib/github.js';
import { db, must } from '../lib/supabase.js';
import { enqueue } from './queue.js';
import { scoreSubmission } from './scoring.js';

interface SubmissionRow {
  id: string;
  event_id: string;
  organization_id: string;
  team_name: string;
  status: string;
  locked_commit_sha: string | null;
  current_version: { repo_id: string; description: string; video_url: string | null; repos: RepoRow } | null;
}

const SUBMISSION_SELECT =
  'id, event_id, organization_id, team_name, status, locked_commit_sha, ' +
  'current_version:submission_versions!submissions_current_version_fk(repo_id, description, video_url, repos(*))';

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

const short = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

/**
 * Freezes the code of one submission: asks GitHub which commit the default branch points at right now and
 * stores it. Judging later downloads exactly this commit, so anything pushed afterwards is never seen.
 */
async function lockCommit(sub: SubmissionRow): Promise<boolean> {
  const repo = sub.current_version?.repos;
  try {
    if (!repo) throw new Error('The submission has no repository.');
    const meta = await getRepoMeta(repo.owner, repo.name);
    const sha = await getHeadSha(meta.owner, meta.name, meta.defaultBranch);
    must(
      await db()
        .from('submissions')
        .update({ locked_commit_sha: sha, locked_at: new Date().toISOString(), status: 'queued', error: null })
        .eq('id', sub.id),
    );
    return true;
  } catch (err) {
    must(await db().from('submissions').update({ status: 'error', error: `Could not freeze the code: ${short(err)}` }).eq('id', sub.id));
    return false;
  }
}

/** Cheap similarity signals that need no model call: the same repository, or forks of the same project. */
async function flagObviousSimilarity(eventId: string, organizationId: string, subs: SubmissionRow[]): Promise<void> {
  const flags: Record<string, unknown>[] = [];
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      const a = subs[i]!;
      const b = subs[j]!;
      const ra = a.current_version?.repos;
      const rb = b.current_version?.repos;
      if (!ra || !rb) continue;
      const [first, second] = a.id < b.id ? [a, b] : [b, a];
      const base = { event_id: eventId, organization_id: organizationId, submission_a: first.id, submission_b: second.id, score: 1 };
      if (ra.id === rb.id) {
        flags.push({ ...base, signal: 'same_repo', explanation: `Both teams submitted ${ra.owner}/${ra.name}.` });
        continue;
      }
      const rootA = ra.fork_parent ?? `${ra.owner}/${ra.name}`;
      const rootB = rb.fork_parent ?? `${rb.owner}/${rb.name}`;
      if ((ra.is_fork || rb.is_fork) && rootA.toLowerCase() === rootB.toLowerCase())
        flags.push({ ...base, signal: 'same_fork_parent', explanation: `Both repositories come from ${rootA}.` });
    }
  }
  if (flags.length)
    must(await db().from('similarity_flags').upsert(flags, { onConflict: 'event_id,submission_a,submission_b,signal' }));
}

/** Moves the event to review once no submission is waiting or running. */
export async function settleEvent(eventId: string): Promise<void> {
  const { count, error } = await db()
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('status', ['queued', 'analyzing']);
  if (error) throw new Error(`Database error: ${error.message}`);
  if ((count ?? 0) === 0) must(await db().from('events').update({ status: 'review' }).eq('id', eventId).eq('status', 'judging'));
}

/**
 * Closes an event: no more submissions, freeze every repository, then queue one judging job per submission.
 * Safe to call twice: only the call that flips the status from open does the work.
 */
export async function closeEvent(eventId: string): Promise<{ closed: boolean; queued: number }> {
  const flipped = must(
    await db()
      .from('events')
      .update({ status: 'judging', closed_at: new Date().toISOString() })
      .eq('id', eventId)
      .eq('status', 'open')
      .select('id, organization_id'),
  ) as { id: string; organization_id: string }[];
  const event = flipped[0];
  if (!event) return { closed: false, queued: 0 };

  const subs = must(
    await db().from('submissions').select(SUBMISSION_SELECT).eq('event_id', eventId).not('current_version_id', 'is', null),
  ) as unknown as SubmissionRow[];

  // Freeze first, for everyone, before any slow work starts.
  const locked: SubmissionRow[] = [];
  await mapLimit(subs, 5, async (sub) => {
    if (await lockCommit(sub)) locked.push(sub);
  });

  await flagObviousSimilarity(eventId, event.organization_id, subs).catch((err) => console.warn('Similarity flags failed:', err));
  for (const sub of locked) await enqueue('judge', sub.id);
  if (locked.length === 0) await settleEvent(eventId);
  return { closed: true, queued: locked.length };
}

/** Closes every open event whose deadline has passed. Called once a minute by the scheduler. */
export async function closeDueEvents(): Promise<number> {
  const due = must(
    await db().from('events').select('id').eq('status', 'open').lte('submission_deadline', new Date().toISOString()).limit(20),
  ) as { id: string }[];
  let closed = 0;
  for (const e of due) {
    try {
      if ((await closeEvent(e.id)).closed) closed++;
    } catch (err) {
      console.error(`Closing event ${e.id} failed:`, err);
    }
  }
  return closed;
}

/** Analyses the frozen commit of one submission and scores it. Runs as a background job. */
export async function judgeSubmission(submissionId: string): Promise<void> {
  const sub = must(await db().from('submissions').select(SUBMISSION_SELECT).eq('id', submissionId).maybeSingle()) as unknown as SubmissionRow | null;
  if (!sub || sub.status === 'scored') return;
  const version = sub.current_version;
  if (!version || !sub.locked_commit_sha) return;

  // Claim the job, so a retried task does not run next to the first attempt.
  const claimed = must(
    await db().from('submissions').update({ status: 'analyzing', error: null }).eq('id', sub.id).in('status', ['queued', 'error']).select('id'),
  ) as { id: string }[];
  if (claimed.length === 0) return;

  try {
    const event = must(await db().from('events').select('rubric_json, starts_at').eq('id', sub.event_id).single()) as {
      rubric_json: unknown;
      starts_at: string;
    };
    const usage = { kind: 'judge', organizationId: sub.organization_id };
    const { analysis } = await analyzeRepo(version.repos.owner, version.repos.name, {
      sha: sub.locked_commit_sha,
      eventStart: event.starts_at,
      usage,
    });
    const { note } = await scoreSubmission({
      submissionId: sub.id,
      organizationId: sub.organization_id,
      rubric: RubricSchema.parse(event.rubric_json),
      analysis,
      teamName: sub.team_name,
      description: version.description,
      videoUrl: version.video_url,
      usage,
    });
    must(await db().from('submissions').update({ status: 'scored', analysis_id: analysis.id, error: note }).eq('id', sub.id));
  } catch (err) {
    console.error(`Judging ${sub.id} failed:`, err);
    must(await db().from('submissions').update({ status: 'error', error: short(err) }).eq('id', sub.id));
  } finally {
    await settleEvent(sub.event_id).catch((err) => console.warn('settleEvent failed:', err));
  }
}
