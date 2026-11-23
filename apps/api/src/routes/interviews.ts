import { interviewLocale } from '../services/language.js';
import { CreateInterviewSchema, FinishInterviewSchema, describeFocusEvents, MAX_INTERVIEW_PAUSE_MS, parseGithubUrl, type QuestionPlan } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { resolveRepo, type HookSnippet } from '../engine/analyze.js';
import { memberOf, requirePermission, requireUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { getHeadSha } from '../lib/github.js';
import { db, must } from '../lib/supabase.js';
import { INTERVIEW_SPECS, type InterviewSpecKey } from '../services/interviewSpecs.js';
import {
  answerKey, createLiveToken, interviewSpecFor, oneInterviewPerCommit, publicQuestions, type ExistingInterview, type InterviewRow,
} from '../services/interviews.js';
import { primaryModels } from '../lib/models.js';
import { enqueue } from '../services/queue.js';

// A dropped connection can be reopened for as long as the interview could still be running, pauses included.
const tokenRetryWindowMs = (seconds: number) => seconds * 1000 + MAX_INTERVIEW_PAUSE_MS;

function hasUnlimitedPersonalInterviews(email: string | null, grants: { scope: string; role_key: string }[]): boolean {
  if (grants.some((g) => g.scope === 'global' && g.role_key === 'platform_admin')) return true;
  if (!email) return false;
  const allowlist = (env().PERSONAL_INTERVIEW_UNLIMITED_EMAILS ?? '')
    .split(/[,\n;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

type InterviewWithRepo = InterviewRow & {
  repos: { owner: string; name: string; url: string };
  assignment_submissions: { group_id: string | null; assignment_id: string; course_assignments: { course_id: string; title: string } | null } | null;
};

async function getInterview(id: string): Promise<InterviewWithRepo> {
  const row = must(
    await db().from('interviews').select('*, repos(owner, name, url), assignment_submissions(group_id, assignment_id, course_assignments(course_id, title))').eq('id', id).maybeSingle(),
  ) as InterviewWithRepo | null;
  if (!row) throw notFound('Interview not found');
  return row;
}

/** Hackathon length for personal and event interviews; course specs for an assignment submission. */
function specOf(row: InterviewWithRepo): InterviewSpecKey {
  if (!row.assignment_submission_id) return 'hackathon';
  return interviewSpecFor(row.assignment_submissions?.group_id ? 'group' : 'individual');
}

async function planAndHooks(row: InterviewRow): Promise<{ plan: QuestionPlan; hooks: HookSnippet[] }> {
  const plan = must(await db().from('interview_plans').select('plan_json').eq('interview_id', row.id).single()) as { plan_json: QuestionPlan };
  const analysis = must(await db().from('repo_analyses').select('hooks_json').eq('id', row.analysis_id!).single()) as { hooks_json: HookSnippet[] };
  return { plan: plan.plan_json, hooks: analysis.hooks_json };
}

async function interviewsOnCommit(userId: string, repoId: string, commitSha: string): Promise<ExistingInterview[]> {
  return must(
    await db().from('interviews').select('id, status, started_at').eq('user_id', userId).eq('repo_id', repoId).eq('commit_sha', commitSha),
  ) as ExistingInterview[];
}

/** The candidate tried to choose the language of an interview whose organizer already set it. */
const languageFixed = (): never => {
  throw badRequest('language_fixed', 'The organizer set the language of this interview, so it cannot be changed.');
};

const interviewExists = (id: string | null, commitSha: string) =>
  conflict(
    'interview_exists_for_commit',
    `You already took an interview on commit ${commitSha.slice(0, 7)}. Push new commits to take another one.`,
    id ? { interview_id: id } : undefined,
  );

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/interviews', async (req) => {
    const user = await requireUser(req);
    requirePermission(user, 'interview.take');
    const input = parse(CreateInterviewSchema, req.body);

    let repoId: string;
    let commitSha: string;
    let submissionId: string | null = null;
    let assignmentSubmissionId: string | null = null;
    let organizationId: string | null = null;
    // Event and assignment interviews speak the language the organizer chose; personal ones, the candidate's.
    let locale: 'en' | 'es' = 'en';

    if (input.submission_id) {
      const sub = must(
        await db()
          .from('submissions')
          .select('id, submitted_by, organization_id, locked_commit_sha, events(interviews_enabled, status, language), current_version:submission_versions!submissions_current_version_fk(repo_id)')
          .eq('id', input.submission_id)
          .maybeSingle(),
      ) as unknown as {
        id: string; submitted_by: string; organization_id: string; locked_commit_sha: string | null;
        events: { interviews_enabled: boolean; status: string; language: 'en' | 'es' }; current_version: { repo_id: string } | null;
      } | null;
      if (!sub || sub.submitted_by !== user.id) throw notFound('Submission not found');
      if (!sub.events.interviews_enabled) throw forbidden('Interviews are not enabled for this event.');
      if (!sub.locked_commit_sha || !sub.current_version || !['review', 'published'].includes(sub.events.status))
        throw conflict('not_ready', 'The interview opens once the event has been judged.');
      // One interview per submission. An attempt that failed for technical reasons can be retried.
      const existing = must(
        await db().from('interviews').select('id, status').eq('submission_id', sub.id).neq('status', 'error').maybeSingle(),
      ) as { id: string; status: string } | null;
      if (existing) return { interview: existing };
      repoId = sub.current_version.repo_id;
      commitSha = sub.locked_commit_sha;
      submissionId = sub.id;
      organizationId = sub.organization_id;
      // An event decides the language of its interviews.
      locale = interviewLocale('event', input.locale, sub.events.language) ?? languageFixed();
    } else if (input.assignment_submission_id) {
      // A course assignment: the student, or each member of the group, takes their own interview.
      const sub = must(
        await db()
          .from('assignment_submissions')
          .select(
            'id, student_id, group_id, organization_id, locked_commit_sha, course_assignments(interviews_enabled, status, language), ' +
              'current_version:assignment_submission_versions!assignment_submissions_current_version_fk(repo_id)',
          )
          .eq('id', input.assignment_submission_id)
          .maybeSingle(),
      ) as unknown as {
        id: string; student_id: string | null; group_id: string | null; organization_id: string; locked_commit_sha: string | null;
        course_assignments: { interviews_enabled: boolean; status: string; language: 'en' | 'es' }; current_version: { repo_id: string } | null;
      } | null;
      if (!sub) throw notFound('Submission not found');
      const mine = sub.student_id
        ? sub.student_id === user.id
        : !!must(
            await db().from('assignment_group_members').select('user_id').eq('group_id', sub.group_id!).eq('user_id', user.id).eq('status', 'accepted').maybeSingle(),
          );
      if (!mine) throw notFound('Submission not found');
      if (!sub.course_assignments.interviews_enabled) throw forbidden('Interviews are not enabled for this assignment.');
      if (!sub.locked_commit_sha || !sub.current_version || !['review', 'published'].includes(sub.course_assignments.status))
        throw conflict('not_ready', 'The interview opens once the assignment has been graded.');
      const existing = must(
        await db().from('interviews').select('id, status').eq('assignment_submission_id', sub.id).eq('user_id', user.id).neq('status', 'error').maybeSingle(),
      ) as { id: string; status: string } | null;
      if (existing) return { interview: existing };
      repoId = sub.current_version.repo_id;
      commitSha = sub.locked_commit_sha;
      assignmentSubmissionId = sub.id;
      organizationId = sub.organization_id;
      // A group assignment keeps the language its teacher set; in an individual one the student may choose.
      locale = interviewLocale(sub.group_id ? 'group_assignment' : 'individual_assignment', input.locale, sub.course_assignments.language) ?? languageFixed();
    } else {
      const ref = parseGithubUrl(input.repo_url!);
      if (!ref) throw badRequest('invalid_repo', 'Use a public GitHub repository URL.');
      if (!hasUnlimitedPersonalInterviews(user.email, user.grants)) {
        const limit = env().PERSONAL_INTERVIEWS_PER_DAY;
        const since = new Date(Date.now() - 24 * 3600_000).toISOString();
        const { count } = await db()
          .from('interviews')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('submission_id', null)
          .is('assignment_submission_id', null)
          .neq('status', 'error')
          .neq('status', 'canceled')
          .gte('created_at', since);
        if ((count ?? 0) >= limit) throw tooMany(`You can start ${limit} personal interviews per day.`);
      }
      const { repo, meta } = await resolveRepo(ref.owner, ref.name);
      repoId = repo.id;
      // A personal interview is about the code as it is now: the head of the default branch.
      commitSha = await getHeadSha(meta.owner, meta.name, meta.defaultBranch);
      const me = must(await db().from('profiles').select('locale').eq('id', user.id).single()) as { locale: 'en' | 'es' };
      locale = interviewLocale('personal', input.locale, me.locale)!;
    }

    // One interview per repository and commit: after seeing the answer key, a second one would be answered from it.
    const decision = oneInterviewPerCommit(await interviewsOnCommit(user.id, repoId, commitSha));
    if (decision.reuse) return { interview: decision.reuse };
    if (decision.blocked) throw interviewExists(decision.blocked.id, commitSha);

    const inserted = await db()
      .from('interviews')
      .insert({
        user_id: user.id,
        repo_id: repoId,
        commit_sha: commitSha,
        submission_id: submissionId,
        assignment_submission_id: assignmentSubmissionId,
        organization_id: organizationId,
        locale,
      })
      .select('id, status')
      .single();
    if (inserted.error) {
      // Two requests at the same moment: the database index lets only one through.
      if (inserted.error.code === '23505') {
        const again = oneInterviewPerCommit(await interviewsOnCommit(user.id, repoId, commitSha));
        if (again.reuse) return { interview: again.reuse };
        throw interviewExists(again.blocked?.id ?? null, commitSha);
      }
      throw new Error(`Database error: ${inserted.error.message}`);
    }
    const row = inserted.data as { id: string; status: string };
    await enqueue('interview-prepare', row.id);
    return { interview: row };
  });

  app.get('/api/me/interviews', async (req) => {
    const user = await requireUser(req);
    const rows = must(
      await db()
        .from('interviews')
        .select('id, status, error, submission_id, assignment_submission_id, created_at, duration_s, repos(owner, name, url), interview_reports(ownership_score, confidence)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
    );
    return { interviews: rows };
  });

  app.get('/api/interviews/:id', async (req) => {
    const user = await requireUser(req);
    const row = await getInterview(parse(IdParams, req.params).id);
    const owner = row.user_id === user.id;
    const organizer = !!row.organization_id && memberOf(user, row.organization_id);
    if (!owner && !organizer) throw notFound('Interview not found');

    const ready = ['ready', 'in_progress', 'evaluating', 'completed'].includes(row.status) && row.analysis_id;
    const { plan, hooks } = ready ? await planAndHooks(row) : { plan: null, hooks: [] };
    const report =
      row.status === 'completed'
        ? must(await db().from('interview_reports').select('skills_json, ownership_score, confidence, summary, created_at, answers_json').eq('interview_id', row.id).maybeSingle())
        : null;
    const analysis = row.analysis_id
      ? (must(await db().from('repo_analyses').select('commit_sha, map_json').eq('id', row.analysis_id).single()) as { commit_sha: string; map_json: { summary: string; stack: unknown } })
      : null;
    return {
      interview: {
        id: row.id,
        status: row.status,
        error: row.error,
        submission_id: row.submission_id,
        assignment_submission_id: row.assignment_submission_id ?? null,
        spec: specOf(row),
        locale: row.locale ?? 'en',
        // Where the candidate came from: their course assignment (for the way back).
        assignment: row.assignment_submissions?.course_assignments
          ? { id: row.assignment_submissions.assignment_id, course_id: row.assignment_submissions.course_assignments.course_id, title: row.assignment_submissions.course_assignments.title }
          : null,
        started_at: row.started_at,
        duration_s: row.duration_s,
        created_at: row.created_at,
        repo: row.repos,
        commit_sha: analysis?.commit_sha ?? null,
        summary: analysis?.map_json.summary ?? null,
        stack: analysis?.map_json.stack ?? null,
        is_owner: owner,
        models_used: row.models_used ?? [],
        primary_models: primaryModels(),
      },
      // Steps only: interview jobs never record the model's reasoning, which would reveal the answer key.
      activity: (row.activity_json ?? []).filter((a) => a.kind !== 'thought'),
      seconds: INTERVIEW_SPECS[specOf(row)].seconds,
      // The answer key never leaves the server.
      questions: plan ? publicQuestions(plan, hooks) : [],
      transcript: row.status === 'completed' ? row.transcript_json : null,
      report,
      // What a strong answer covered: only after the interview is completed, for the candidate and the organizers.
      answer_key: answerKey(row.status, plan),
      focus_events: row.status === 'completed' ? (row.focus_events_json ?? []) : [],
      focus_summary: row.status === 'completed' ? describeFocusEvents(row.focus_events_json ?? []) : null,
    };
  });

  app.post('/api/interviews/:id/token', async (req) => {
    const user = await requireUser(req);
    const row = await getInterview(parse(IdParams, req.params).id);
    if (row.user_id !== user.id) throw notFound('Interview not found');
    const spec = specOf(row);
    const seconds = INTERVIEW_SPECS[spec].seconds;
    const retry = row.status === 'in_progress' && !!row.started_at && Date.now() - Date.parse(row.started_at) < tokenRetryWindowMs(seconds);
    if (row.status !== 'ready' && !retry) throw conflict('not_ready', 'This interview cannot be started.');

    const { plan } = await planAndHooks(row);
    const live = await createLiveToken(plan, `${row.repos.owner}/${row.repos.name}`, spec, row.locale ?? 'en');
    if (row.status === 'ready') {
      const claimed = must(
        await db().from('interviews').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'ready').select('id'),
      ) as { id: string }[];
      if (claimed.length === 0) throw conflict('already_started', 'This interview was already started in another tab.');
    }
    return { ...live, seconds, api_version: env().LIVE_TOKEN_API_VERSION };
  });

  app.post('/api/interviews/:id/finish', async (req) => {
    const user = await requireUser(req);
    const row = await getInterview(parse(IdParams, req.params).id);
    if (row.user_id !== user.id) throw notFound('Interview not found');
    if (row.status !== 'in_progress' || !row.started_at) throw conflict('not_in_progress', 'This interview is not in progress.');
    const input = parse(FinishInterviewSchema, req.body);
    // The server clock decides how long the interview lasted.
    const elapsed = Math.round((Date.now() - Date.parse(row.started_at)) / 1000);
    const claimed = must(
      await db()
        .from('interviews')
        .update({ status: 'evaluating', transcript_json: input.transcript, duration_s: Math.min(input.duration_s, elapsed), focus_events_json: input.focus_events })
        .eq('id', row.id)
        .eq('status', 'in_progress')
        .select('id'),
    ) as { id: string }[];
    if (claimed.length === 0) throw conflict('not_in_progress', 'This interview is not in progress.');
    await enqueue('interview-evaluate', row.id);
    return { ok: true };
  });
}
