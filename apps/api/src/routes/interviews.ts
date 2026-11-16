import { CreateInterviewSchema, FinishInterviewSchema, INTERVIEW_SECONDS, parseGithubUrl, type QuestionPlan } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { resolveRepo, type HookSnippet } from '../engine/analyze.js';
import { memberOf, requirePermission, requireUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must } from '../lib/supabase.js';
import { createLiveToken, publicQuestions, type InterviewRow } from '../services/interviews.js';
import { enqueue } from '../services/queue.js';

const PERSONAL_PER_DAY = 5;
const TOKEN_RETRY_WINDOW_MS = 120_000;

type InterviewWithRepo = InterviewRow & { repos: { owner: string; name: string; url: string } };

async function getInterview(id: string): Promise<InterviewWithRepo> {
  const row = must(await db().from('interviews').select('*, repos(owner, name, url)').eq('id', id).maybeSingle()) as InterviewWithRepo | null;
  if (!row) throw notFound('Interview not found');
  return row;
}

async function planAndHooks(row: InterviewRow): Promise<{ plan: QuestionPlan; hooks: HookSnippet[] }> {
  const plan = must(await db().from('interview_plans').select('plan_json').eq('interview_id', row.id).single()) as { plan_json: QuestionPlan };
  const analysis = must(await db().from('repo_analyses').select('hooks_json').eq('id', row.analysis_id!).single()) as { hooks_json: HookSnippet[] };
  return { plan: plan.plan_json, hooks: analysis.hooks_json };
}

export async function interviewRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/interviews', async (req) => {
    const user = await requireUser(req);
    requirePermission(user, 'interview.take');
    const input = parse(CreateInterviewSchema, req.body);

    let repoId: string;
    let submissionId: string | null = null;
    let organizationId: string | null = null;

    if (input.submission_id) {
      const sub = must(
        await db()
          .from('submissions')
          .select('id, submitted_by, organization_id, locked_commit_sha, events(interviews_enabled, status), current_version:submission_versions!submissions_current_version_fk(repo_id)')
          .eq('id', input.submission_id)
          .maybeSingle(),
      ) as unknown as {
        id: string; submitted_by: string; organization_id: string; locked_commit_sha: string | null;
        events: { interviews_enabled: boolean; status: string }; current_version: { repo_id: string } | null;
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
      submissionId = sub.id;
      organizationId = sub.organization_id;
    } else {
      const ref = parseGithubUrl(input.repo_url!);
      if (!ref) throw badRequest('invalid_repo', 'Use a public GitHub repository URL.');
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await db()
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('submission_id', null)
        .gte('created_at', since);
      if ((count ?? 0) >= PERSONAL_PER_DAY) throw tooMany(`You can start ${PERSONAL_PER_DAY} personal interviews per day.`);
      repoId = (await resolveRepo(ref.owner, ref.name)).repo.id;
    }

    const row = must(
      await db()
        .from('interviews')
        .insert({ user_id: user.id, repo_id: repoId, submission_id: submissionId, organization_id: organizationId })
        .select('id, status')
        .single(),
    ) as { id: string; status: string };
    await enqueue('interview-prepare', row.id);
    return { interview: row };
  });

  app.get('/api/me/interviews', async (req) => {
    const user = await requireUser(req);
    const rows = must(
      await db()
        .from('interviews')
        .select('id, status, error, submission_id, created_at, duration_s, repos(owner, name, url), interview_reports(ownership_score, confidence)')
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
        ? must(await db().from('interview_reports').select('skills_json, ownership_score, confidence, summary, created_at').eq('interview_id', row.id).maybeSingle())
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
        started_at: row.started_at,
        duration_s: row.duration_s,
        created_at: row.created_at,
        repo: row.repos,
        commit_sha: analysis?.commit_sha ?? null,
        summary: analysis?.map_json.summary ?? null,
        stack: analysis?.map_json.stack ?? null,
        is_owner: owner,
      },
      seconds: INTERVIEW_SECONDS,
      // The answer key never leaves the server.
      questions: plan ? publicQuestions(plan, hooks) : [],
      transcript: row.status === 'completed' ? row.transcript_json : null,
      report,
    };
  });

  app.post('/api/interviews/:id/token', async (req) => {
    const user = await requireUser(req);
    const row = await getInterview(parse(IdParams, req.params).id);
    if (row.user_id !== user.id) throw notFound('Interview not found');
    const retry = row.status === 'in_progress' && !!row.started_at && Date.now() - Date.parse(row.started_at) < TOKEN_RETRY_WINDOW_MS;
    if (row.status !== 'ready' && !retry) throw conflict('not_ready', 'This interview cannot be started.');

    const { plan } = await planAndHooks(row);
    const live = await createLiveToken(plan, `${row.repos.owner}/${row.repos.name}`);
    if (row.status === 'ready') {
      const claimed = must(
        await db().from('interviews').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'ready').select('id'),
      ) as { id: string }[];
      if (claimed.length === 0) throw conflict('already_started', 'This interview was already started in another tab.');
    }
    return { ...live, seconds: INTERVIEW_SECONDS };
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
        .update({ status: 'evaluating', transcript_json: input.transcript, duration_s: Math.min(input.duration_s, elapsed) })
        .eq('id', row.id)
        .eq('status', 'in_progress')
        .select('id'),
    ) as { id: string }[];
    if (claimed.length === 0) throw conflict('not_in_progress', 'This interview is not in progress.');
    await enqueue('interview-evaluate', row.id);
    return { ok: true };
  });
}
