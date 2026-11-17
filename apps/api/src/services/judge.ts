import { RubricSchema, type ActivityEntry } from '@skillproof/shared';
import { analyzeRepo, type RepoRow } from '../engine/analyze.js';
import { Activity, withActivity } from '../lib/activity.js';
import { AiUnavailableError, clockUtc, isTransientAiError } from '../lib/gemini.js';
import { getHeadSha, getRepoMeta } from '../lib/github.js';
import { JobStopped, submissionCheckpoint } from '../lib/control.js';
import { friendlyJobError, technicalDetail } from '../lib/jobErrors.js';
import { db, must } from '../lib/supabase.js';
import { MAX_AUTO_ATTEMPTS, dispatchJudging, freeSlots, nextAttemptAt } from './judgeQueue.js';
import { scoreSubmission } from './scoring.js';

interface SubmissionRow {
  id: string;
  event_id: string;
  organization_id: string;
  team_name: string;
  status: string;
  locked_commit_sha: string | null;
  judge_attempts: number;
  activity_json: ActivityEntry[];
  models_used: string[];
  current_version: { repo_id: string; description: string; video_url: string | null; repos: RepoRow } | null;
}

const SUBMISSION_SELECT =
  'id, event_id, organization_id, team_name, status, locked_commit_sha, judge_attempts, activity_json, models_used, ' +
  'current_version:submission_versions!submissions_current_version_fk(repo_id, description, video_url, repos(*))';

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(workers);
}

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
        .update({ locked_commit_sha: sha, locked_at: new Date().toISOString(), status: 'queued', error: null, judge_attempts: 0, next_attempt_at: null, activity_json: [], models_used: [] })
        .eq('id', sub.id),
    );
    return true;
  } catch (err) {
    console.warn(`Freezing ${sub.id} failed:`, err);
    must(await db().from('submissions').update({ status: 'error', error: `Could not freeze the code. ${friendlyJobError(err, 'judge')}` }).eq('id', sub.id));
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
    .in('status', ['queued', 'analyzing', 'paused']);
  if (error) throw new Error(`Database error: ${error.message}`);
  // Paused submissions keep the event in judging; canceled ones do not.
  if ((count ?? 0) === 0) must(await db().from('events').update({ status: 'review', judging_paused_at: null }).eq('id', eventId).eq('status', 'judging'));
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
  // Only JUDGE_CONCURRENCY start now. Each one that finishes starts the next, so Gemini never gets them all at once.
  await dispatchJudging();
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

  // Too many judgings running: stay queued. The next one to finish, or the scheduler, starts this one.
  if (sub.status === 'queued' && (await freeSlots()) === 0) return;

  // The log is cleared by whoever starts judging afresh (closing the event, "Judge again"). Automatic retries and
  // a resumed pause keep it, so the history shows every attempt.
  const attempt = sub.judge_attempts + 1;
  const claimed = must(
    await db()
      .from('submissions')
      .update({
        status: 'analyzing',
        error: null,
        updated_at: new Date().toISOString(),
        next_attempt_at: null,
      })
      .eq('id', sub.id)
      .in('status', ['queued', 'error'])
      .select('id'),
  ) as { id: string }[];
  if (claimed.length === 0) return;

  const activity = new Activity('submissions', sub.id, true, sub.activity_json ?? [], sub.models_used ?? []);
  activity.checkpoint = submissionCheckpoint(sub.id);
  try {
    await withActivity(activity, async () => {
      await activity.step(
        attempt > 1
          ? `Attempt ${attempt} of ${MAX_AUTO_ATTEMPTS} started on the code frozen at commit ${sub.locked_commit_sha!.slice(0, 7)}.`
          : `Judging started on the code frozen at commit ${sub.locked_commit_sha!.slice(0, 7)}.`,
      );
      const event = must(await db().from('events').select('rubric_json, starts_at').eq('id', sub.event_id).single()) as {
        rubric_json: unknown;
        starts_at: string;
      };
      const usage = { kind: 'judge', organizationId: sub.organization_id };
      const { analysis } = await analyzeRepo(version.repos.owner, version.repos.name, {
        sha: sub.locked_commit_sha!,
        eventStart: event.starts_at,
        usage,
      });
      const rubric = RubricSchema.parse(event.rubric_json);
      const { note } = await scoreSubmission({
        submissionId: sub.id,
        organizationId: sub.organization_id,
        rubric,
        analysis,
        teamName: sub.team_name,
        description: version.description,
        videoUrl: version.video_url,
        usage,
      });
      await activity.checkpoint?.();
      // Only if nobody paused or canceled it meanwhile.
      must(await db().from('submissions').update({ status: 'scored', analysis_id: analysis.id, error: note, judge_attempts: 0 }).eq('id', sub.id).eq('status', 'analyzing'));
      await activity.add('done', `Done. ${rubric.length} criteria scored, each with its reason and evidence.`);
    });
  } catch (err) {
    if (err instanceof JobStopped) {
      // The organizer paused or canceled it. What is done stays cached (the analysis per commit, the summaries).
      await activity.add(
        err.reason === 'paused' ? 'retry' : 'error',
        err.reason === 'paused'
          ? 'Stopped at a checkpoint because judging is paused. Work done so far is cached and reused on resume.'
          : 'Stopped at a checkpoint because judging was canceled.',
      );
      // An event-wide pause stops a submission that was still marked analyzing: record it as paused.
      if (err.reason === 'paused')
        must(await db().from('submissions').update({ status: 'paused' }).eq('id', sub.id).in('status', ['analyzing', 'paused']));
      return;
    }
    console.error(`Judging ${sub.id} failed (attempt ${attempt}):`, err);
    await activity.add('error', technicalDetail(err));
    await failOrRetry(sub.id, attempt, err, activity);
  } finally {
    await settleEvent(sub.event_id).catch((err) => console.warn('settleEvent failed:', err));
    // A slot is free again: start the next submission in the queue.
    await dispatchJudging().catch((err) => console.warn('Starting the next judging failed:', err));
  }
}

/**
 * When Gemini was only busy, the submission goes back to the queue with a later start time, up to
 * MAX_AUTO_ATTEMPTS. Any other failure, or the last attempt, stops with a message and "Judge again".
 */
export async function failOrRetry(submissionId: string, attempt: number, err: unknown, activity?: Activity): Promise<void> {
  const transient = err instanceof AiUnavailableError || isTransientAiError(err);
  if (transient && attempt < MAX_AUTO_ATTEMPTS) {
    const at = nextAttemptAt(attempt);
    const message = `Gemini is overloaded right now. SkillProof will try again automatically at ${clockUtc(at.getTime())} (attempt ${attempt + 1} of ${MAX_AUTO_ATTEMPTS}).`;
    await activity?.add('retry', message);
    must(
      await db()
        .from('submissions')
        .update({ status: 'queued', error: message, judge_attempts: attempt, next_attempt_at: at.toISOString() })
        .eq('id', submissionId),
    );
    return;
  }
  const message =
    transient && attempt >= MAX_AUTO_ATTEMPTS
      ? `Gemini stayed overloaded through ${MAX_AUTO_ATTEMPTS} attempts. Use "Judge again" later.`
      : friendlyJobError(err, 'judge');
  must(await db().from('submissions').update({ status: 'error', error: message, judge_attempts: attempt }).eq('id', submissionId));
}
