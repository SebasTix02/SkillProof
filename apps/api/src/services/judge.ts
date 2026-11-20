import { RubricSchema, type ActivityEntry } from '@skillproof/shared';
import { analyzeRepo, type RepoRow } from '../engine/analyze.js';
import { Activity, withActivity } from '../lib/activity.js';
import { AiUnavailableError, clockUtc, isTransientAiError } from '../lib/gemini.js';
import { getHeadSha, getRepoMeta } from '../lib/github.js';
import { JobStopped, submissionCheckpoint } from '../lib/control.js';
import { friendlyJobError, technicalDetail } from '../lib/jobErrors.js';
import { db, must } from '../lib/supabase.js';
import { ASSIGNMENT_STORE, EVENT_STORE, scoringSpecFor, type ContestStore } from './contest.js';
import { MAX_AUTO_ATTEMPTS, dispatchJudging, freeSlots, nextAttemptAt } from './judgeQueue.js';
import { scoreSubmission } from './scoring.js';
import type { CourseContext } from './scoringSpecs.js';

/**
 * The judging engine, for events and course assignments alike (see contest.ts). The exported names without a store
 * argument (closeEvent, judgeSubmission, …) are the event versions the rest of the code already used.
 */

interface SubmissionRow {
  id: string;
  organization_id: string;
  status: string;
  locked_commit_sha: string | null;
  judge_attempts: number;
  activity_json: ActivityEntry[];
  models_used: string[];
  current_version: { repo_id: string; description: string; video_url: string | null; repos: RepoRow } | null;
  // events
  event_id?: string;
  team_name?: string;
  // assignments
  assignment_id?: string;
  student_id?: string | null;
  group_id?: string | null;
}

const submissionSelect = (store: ContestStore) =>
  store.kind === 'event'
    ? `id, event_id, organization_id, team_name, status, locked_commit_sha, judge_attempts, activity_json, models_used, ${store.currentVersion}`
    : `id, assignment_id, organization_id, student_id, group_id, status, locked_commit_sha, judge_attempts, activity_json, models_used, ${store.currentVersion}`;

const contestIdOf = (store: ContestStore, sub: SubmissionRow): string => (store.kind === 'event' ? sub.event_id! : sub.assignment_id!);

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
async function lockCommit(store: ContestStore, sub: SubmissionRow): Promise<boolean> {
  const repo = sub.current_version?.repos;
  try {
    if (!repo) throw new Error('The submission has no repository.');
    const meta = await getRepoMeta(repo.owner, repo.name);
    const sha = await getHeadSha(meta.owner, meta.name, meta.defaultBranch);
    must(
      await db()
        .from(store.submissions)
        .update({ locked_commit_sha: sha, locked_at: new Date().toISOString(), status: 'queued', error: null, judge_attempts: 0, next_attempt_at: null, activity_json: [], models_used: [] })
        .eq('id', sub.id),
    );
    return true;
  } catch (err) {
    console.warn(`Freezing ${sub.id} failed:`, err);
    must(await db().from(store.submissions).update({ status: 'error', error: `Could not freeze the code. ${friendlyJobError(err, 'judge')}` }).eq('id', sub.id));
    return false;
  }
}

/** Cheap similarity signals that need no model call: the same repository, or forks of the same project. */
async function flagObviousSimilarity(store: ContestStore, contestId: string, organizationId: string, subs: SubmissionRow[]): Promise<void> {
  const who = store.kind === 'event' ? 'teams' : 'submissions';
  const flags: Record<string, unknown>[] = [];
  for (let i = 0; i < subs.length; i++) {
    for (let j = i + 1; j < subs.length; j++) {
      const a = subs[i]!;
      const b = subs[j]!;
      const ra = a.current_version?.repos;
      const rb = b.current_version?.repos;
      if (!ra || !rb) continue;
      const [first, second] = a.id < b.id ? [a, b] : [b, a];
      const base = { [store.contestFk]: contestId, organization_id: organizationId, submission_a: first.id, submission_b: second.id, score: 1 };
      if (ra.id === rb.id) {
        flags.push({ ...base, signal: 'same_repo', explanation: `Both ${who} submitted ${ra.owner}/${ra.name}.` });
        continue;
      }
      const rootA = ra.fork_parent ?? `${ra.owner}/${ra.name}`;
      const rootB = rb.fork_parent ?? `${rb.owner}/${rb.name}`;
      if ((ra.is_fork || rb.is_fork) && rootA.toLowerCase() === rootB.toLowerCase())
        flags.push({ ...base, signal: 'same_fork_parent', explanation: `Both repositories come from ${rootA}.` });
    }
  }
  if (flags.length)
    must(await db().from(store.flags).upsert(flags, { onConflict: `${store.contestFk},submission_a,submission_b,signal` }));
}

/** Moves the contest to review once no submission is waiting or running. */
export async function settleContest(store: ContestStore, contestId: string): Promise<void> {
  const { count, error } = await db()
    .from(store.submissions)
    .select('id', { count: 'exact', head: true })
    .eq(store.contestFk, contestId)
    .in('status', ['queued', 'analyzing', 'paused']);
  if (error) throw new Error(`Database error: ${error.message}`);
  // Paused submissions keep it in judging; canceled ones do not.
  if ((count ?? 0) === 0)
    must(await db().from(store.contests).update({ status: 'review', judging_paused_at: null }).eq('id', contestId).eq('status', 'judging'));
}

/**
 * Closes a contest: no more submissions, freeze every repository, then queue one judging job per submission.
 * Safe to call twice: only the call that flips the status from open does the work.
 */
export async function closeContest(store: ContestStore, contestId: string): Promise<{ closed: boolean; queued: number }> {
  const flipped = must(
    await db()
      .from(store.contests)
      .update({ status: 'judging', closed_at: new Date().toISOString() })
      .eq('id', contestId)
      .eq('status', 'open')
      .select('id, organization_id'),
  ) as { id: string; organization_id: string }[];
  const contest = flipped[0];
  if (!contest) return { closed: false, queued: 0 };

  const subs = must(
    await db().from(store.submissions).select(submissionSelect(store)).eq(store.contestFk, contestId).not('current_version_id', 'is', null),
  ) as unknown as SubmissionRow[];

  // Freeze first, for everyone, before any slow work starts.
  const locked: SubmissionRow[] = [];
  await mapLimit(subs, 5, async (sub) => {
    if (await lockCommit(store, sub)) locked.push(sub);
  });

  await flagObviousSimilarity(store, contestId, contest.organization_id, subs).catch((err) => console.warn('Similarity flags failed:', err));
  // Only JUDGE_CONCURRENCY start now. Each one that finishes starts the next, so Gemini never gets them all at once.
  await dispatchJudging();
  if (locked.length === 0) await settleContest(store, contestId);
  return { closed: true, queued: locked.length };
}

/** Closes every open contest of this kind whose deadline has passed. Called once a minute by the scheduler. */
export async function closeDueContests(store: ContestStore): Promise<number> {
  const due = must(
    await db().from(store.contests).select('id').eq('status', 'open').lte(store.deadline, new Date().toISOString()).limit(20),
  ) as { id: string }[];
  let closed = 0;
  for (const c of due) {
    try {
      if ((await closeContest(store, c.id)).closed) closed++;
    } catch (err) {
      console.error(`Closing ${store.kind} ${c.id} failed:`, err);
    }
  }
  return closed;
}

/** What the grader is told about an assignment and who submitted it. */
async function courseSubject(sub: SubmissionRow): Promise<{ label: string; spec: 'course_individual' | 'course_group'; course: CourseContext; rubricJson: unknown; start: string }> {
  const a = must(
    await db().from('course_assignments').select('title, instructions, learning_goals, mode, rubric_json, opens_at').eq('id', sub.assignment_id!).single(),
  ) as { title: string; instructions: string; learning_goals: string; mode: 'individual' | 'group'; rubric_json: unknown; opens_at: string };
  const course: CourseContext = { title: a.title, instructions: a.instructions, learningGoals: a.learning_goals };
  if (sub.group_id) {
    const group = must(await db().from('assignment_groups').select('name').eq('id', sub.group_id).single()) as { name: string };
    const members = must(
      await db()
        .from('assignment_group_members')
        .select('profiles!assignment_group_members_user_id_fkey(display_name, github_login)')
        .eq('group_id', sub.group_id)
        .eq('status', 'accepted'),
    ) as unknown as { profiles: { display_name: string; github_login: string | null } | null }[];
    course.members = members.map((m) => ({ name: m.profiles?.display_name ?? 'Student', login: m.profiles?.github_login ?? null, commits: null }));
    return { label: group.name, spec: scoringSpecFor('assignment', a.mode) as 'course_group', course, rubricJson: a.rubric_json, start: a.opens_at };
  }
  const student = must(await db().from('profiles').select('display_name').eq('id', sub.student_id!).single()) as { display_name: string };
  return { label: student.display_name || 'Student', spec: 'course_individual', course, rubricJson: a.rubric_json, start: a.opens_at };
}

/** Analyses the frozen commit of one submission and scores it. Runs as a background job. */
export async function judgeContestSubmission(store: ContestStore, submissionId: string): Promise<void> {
  const sub = must(await db().from(store.submissions).select(submissionSelect(store)).eq('id', submissionId).maybeSingle()) as unknown as SubmissionRow | null;
  if (!sub || sub.status === 'scored') return;
  const version = sub.current_version;
  if (!version || !sub.locked_commit_sha) return;

  // Too many judgings running: stay queued. The next one to finish, or the scheduler, starts this one.
  if (sub.status === 'queued' && (await freeSlots()) === 0) return;

  // The log is cleared by whoever starts judging afresh (closing, "Judge again"). Automatic retries and a resumed
  // pause keep it, so the history shows every attempt.
  const attempt = sub.judge_attempts + 1;
  const claimed = must(
    await db()
      .from(store.submissions)
      .update({ status: 'analyzing', error: null, updated_at: new Date().toISOString(), next_attempt_at: null })
      .eq('id', sub.id)
      .in('status', ['queued', 'error'])
      .select('id'),
  ) as { id: string }[];
  if (claimed.length === 0) return;

  const activity = new Activity(store.submissions, sub.id, true, sub.activity_json ?? [], sub.models_used ?? []);
  activity.checkpoint = submissionCheckpoint(sub.id, store);
  const contestId = contestIdOf(store, sub);
  try {
    await withActivity(activity, async () => {
      await activity.step(
        attempt > 1
          ? `Attempt ${attempt} of ${MAX_AUTO_ATTEMPTS} started on the code frozen at commit ${sub.locked_commit_sha!.slice(0, 7)}.`
          : `${store.kind === 'event' ? 'Judging' : 'Grading'} started on the code frozen at commit ${sub.locked_commit_sha!.slice(0, 7)}.`,
      );
      const usage = { kind: store.kind === 'event' ? 'judge' : 'grade', organizationId: sub.organization_id };
      let rubricJson: unknown;
      let start: string;
      let subject: Awaited<ReturnType<typeof courseSubject>> | null = null;
      if (store.kind === 'event') {
        const event = must(await db().from('events').select('rubric_json, starts_at').eq('id', contestId).single()) as { rubric_json: unknown; starts_at: string };
        rubricJson = event.rubric_json;
        start = event.starts_at;
      } else {
        subject = await courseSubject(sub);
        rubricJson = subject.rubricJson;
        start = subject.start;
      }
      const { analysis } = await analyzeRepo(version.repos.owner, version.repos.name, { sha: sub.locked_commit_sha!, eventStart: start, usage });
      if (subject?.course.members) {
        const perAuthor = analysis.commit_profile_json?.author_commits ?? {};
        subject.course.members = subject.course.members.map((m) => ({ ...m, commits: m.login ? (perAuthor[m.login] ?? 0) : null }));
      }
      const rubric = RubricSchema.parse(rubricJson);
      const { note } = await scoreSubmission({
        submissionId: sub.id,
        organizationId: sub.organization_id,
        rubric,
        analysis,
        teamName: subject ? subject.label : sub.team_name!,
        description: version.description,
        videoUrl: version.video_url,
        usage,
        spec: subject?.spec ?? 'hackathon',
        course: subject?.course,
        store: { scores: store.scores, feedback: store.feedback },
      });
      await activity.checkpoint?.();
      // Only if nobody paused or canceled it meanwhile.
      must(await db().from(store.submissions).update({ status: 'scored', analysis_id: analysis.id, error: note, judge_attempts: 0 }).eq('id', sub.id).eq('status', 'analyzing'));
      await activity.add('done', `Done. ${rubric.length} criteria scored, each with its reason and evidence.`);
    });
  } catch (err) {
    if (err instanceof JobStopped) {
      // Paused or canceled. What is done stays cached (the analysis per commit, the summaries).
      await activity.add(
        err.reason === 'paused' ? 'retry' : 'error',
        err.reason === 'paused'
          ? 'Stopped at a checkpoint because judging is paused. Work done so far is cached and reused on resume.'
          : 'Stopped at a checkpoint because judging was canceled.',
      );
      // A contest-wide pause stops a submission that was still marked analyzing: record it as paused.
      if (err.reason === 'paused')
        must(await db().from(store.submissions).update({ status: 'paused' }).eq('id', sub.id).in('status', ['analyzing', 'paused']));
      return;
    }
    console.error(`Judging ${sub.id} failed (attempt ${attempt}):`, err);
    await activity.add('error', technicalDetail(err));
    await failOrRetryIn(store, sub.id, attempt, err, activity);
  } finally {
    await settleContest(store, contestId).catch((err) => console.warn('settle failed:', err));
    // A slot is free again: start the next submission in the queue.
    await dispatchJudging().catch((err) => console.warn('Starting the next judging failed:', err));
  }
}

/**
 * When Gemini was only busy, the submission goes back to the queue with a later start time, up to
 * MAX_AUTO_ATTEMPTS. Any other failure, or the last attempt, stops with a message and "Judge again".
 */
export async function failOrRetryIn(store: ContestStore, submissionId: string, attempt: number, err: unknown, activity?: Activity): Promise<void> {
  const transient = err instanceof AiUnavailableError || isTransientAiError(err);
  if (transient && attempt < MAX_AUTO_ATTEMPTS) {
    const at = nextAttemptAt(attempt);
    const message = `Gemini is overloaded right now. SkillProof will try again automatically at ${clockUtc(at.getTime())} (attempt ${attempt + 1} of ${MAX_AUTO_ATTEMPTS}).`;
    await activity?.add('retry', message);
    must(
      await db()
        .from(store.submissions)
        .update({ status: 'queued', error: message, judge_attempts: attempt, next_attempt_at: at.toISOString() })
        .eq('id', submissionId),
    );
    return;
  }
  const message =
    transient && attempt >= MAX_AUTO_ATTEMPTS
      ? `Gemini stayed overloaded through ${MAX_AUTO_ATTEMPTS} attempts. Use "Judge again" later.`
      : friendlyJobError(err, 'judge');
  must(await db().from(store.submissions).update({ status: 'error', error: message, judge_attempts: attempt }).eq('id', submissionId));
}

// ---- event names used by the rest of the code ----
export const settleEvent = (eventId: string) => settleContest(EVENT_STORE, eventId);
export const closeEvent = (eventId: string) => closeContest(EVENT_STORE, eventId);
export const closeDueEvents = () => closeDueContests(EVENT_STORE);
export const judgeSubmission = (submissionId: string) => judgeContestSubmission(EVENT_STORE, submissionId);
export const failOrRetry = (submissionId: string, attempt: number, err: unknown, activity?: Activity) =>
  failOrRetryIn(EVENT_STORE, submissionId, attempt, err, activity);

// ---- course assignments ----
export const settleAssignment = (assignmentId: string) => settleContest(ASSIGNMENT_STORE, assignmentId);
export const closeAssignment = (assignmentId: string) => closeContest(ASSIGNMENT_STORE, assignmentId);
export const closeDueAssignments = () => closeDueContests(ASSIGNMENT_STORE);
export const judgeAssignmentSubmission = (submissionId: string) => judgeContestSubmission(ASSIGNMENT_STORE, submissionId);
