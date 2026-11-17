import {
  AllowlistSchema, CreateEventSchema, JoinEventSchema, OverrideScoreSchema, RubricSchema, SubmitSchema,
  parseGithubUrl, submissionsLeft, weightedTotal, type ActivityEntry, type Rubric,
} from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveRepo } from '../engine/analyze.js';
import { AttemptLimiter, hashAccessCode, verifyAccessCode } from '../lib/accessCode.js';
import { memberOf, requirePermission, requireUser, type AuthUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound, tooMany } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { uniqueSlug } from '../lib/slug.js';
import { db, must } from '../lib/supabase.js';
import { closeEvent } from '../services/judge.js';
import { dispatchJudging } from '../services/judgeQueue.js';

interface EventRow {
  id: string;
  organization_id: string;
  kind: string;
  name: string;
  slug: string;
  description: string;
  starts_at: string;
  submission_deadline: string;
  visibility: 'public' | 'code' | 'invite';
  access_code_hash: string | null;
  interviews_enabled: boolean;
  max_submissions: number | null;
  rubric_json: unknown;
  status: 'draft' | 'open' | 'judging' | 'review' | 'published';
  closed_at: string | null;
  published_at: string | null;
  organizations?: { name: string; slug: string };
}

const codeAttempts = new AttemptLimiter(8, 10 * 60_000);

/** Never send the access code hash to a client. */
function publicEvent(e: EventRow) {
  const { access_code_hash: _hash, organizations, ...rest } = e;
  return { ...rest, organization: organizations ?? null };
}

async function getEvent(id: string): Promise<EventRow> {
  const e = must(await db().from('events').select('*, organizations(name, slug)').eq('id', id).maybeSingle()) as EventRow | null;
  if (!e) throw notFound('Event not found');
  return e;
}

async function isParticipant(eventId: string, userId: string): Promise<boolean> {
  const row = must(await db().from('event_participants').select('user_id').eq('event_id', eventId).eq('user_id', userId).maybeSingle());
  return !!row;
}

async function managedEvent(id: string, user: AuthUser, perm = 'event.manage'): Promise<EventRow> {
  const e = await getEvent(id);
  requirePermission(user, perm, e.organization_id);
  return e;
}

interface ScoreRow {
  id: string;
  submission_id: string;
  criterion_key: string;
  ai_score: number | null;
  justification: string;
  evidence_json: string[];
  override_score: number | null;
}

/** Submissions of an event with their scores and totals, best first. */
async function leaderboard(event: EventRow) {
  const rubric = RubricSchema.parse(event.rubric_json) as Rubric;
  const subs = must(
    await db()
      .from('submissions')
      .select(
        'id, team_name, submitted_by, status, error, versions_used, locked_commit_sha, locked_at, activity_json, models_used, judge_attempts, next_attempt_at, ' +
          'current_version:submission_versions!submissions_current_version_fk(description, video_url, slides_url, repos(owner, name, url, is_fork, fork_parent))',
      )
      .eq('event_id', event.id),
  ) as unknown as {
    id: string; team_name: string; submitted_by: string; status: string; error: string | null; versions_used: number;
    locked_commit_sha: string | null; locked_at: string | null;
    activity_json: ActivityEntry[]; models_used: string[]; judge_attempts: number; next_attempt_at: string | null;
    current_version: { description: string; video_url: string | null; slides_url: string | null; repos: Record<string, unknown> } | null;
  }[];
  const ids = subs.map((s) => s.id);
  const scores = ids.length ? (must(await db().from('scores').select('*').in('submission_id', ids)) as ScoreRow[]) : [];
  const interviews = ids.length
    ? (must(
        await db().from('interviews').select('submission_id, status, interview_reports(ownership_score, confidence)').in('submission_id', ids),
      ) as unknown as { submission_id: string; status: string; interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null }[])
    : [];
  const rows = subs.map((s) => {
    const mine = scores.filter((x) => x.submission_id === s.id);
    const interview = interviews.find((i) => i.submission_id === s.id && i.status === 'completed');
    const report = Array.isArray(interview?.interview_reports) ? interview?.interview_reports[0] : interview?.interview_reports;
    return {
      ...s,
      scores: mine,
      total: weightedTotal(rubric, mine),
      ownership: report ? { score: report.ownership_score, confidence: report.confidence } : null,
    };
  });
  rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.team_name.localeCompare(b.team_name));
  return { rubric, rows };
}

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  // ---- organizer ----

  app.post('/api/orgs/:id/events', async (req) => {
    const user = await requireUser(req);
    const { id: orgId } = parse(IdParams, req.params);
    requirePermission(user, 'event.create', orgId);
    const input = parse(CreateEventSchema, req.body);
    const row = must(
      await db()
        .from('events')
        .insert({
          organization_id: orgId,
          kind: input.kind,
          name: input.name,
          slug: uniqueSlug(input.name),
          description: input.description,
          starts_at: input.starts_at,
          submission_deadline: input.submission_deadline,
          visibility: input.visibility,
          access_code_hash: input.visibility === 'code' ? hashAccessCode(input.access_code!) : null,
          interviews_enabled: input.interviews_enabled,
          max_submissions: input.max_submissions,
          rubric_json: input.rubric,
          status: input.publish ? 'open' : 'draft',
          created_by: user.id,
        })
        .select('*, organizations(name, slug)')
        .single(),
    ) as EventRow;
    return { event: publicEvent(row) };
  });

  app.get('/api/orgs/:id/events', async (req) => {
    const user = await requireUser(req);
    const { id: orgId } = parse(IdParams, req.params);
    if (!memberOf(user, orgId)) throw forbidden();
    const rows = must(
      await db().from('events').select('*, organizations(name, slug), submissions(count), event_participants(count)').eq('organization_id', orgId).order('created_at', { ascending: false }),
    ) as unknown as (EventRow & { submissions: { count: number }[]; event_participants: { count: number }[] })[];
    return {
      events: rows.map(({ submissions, event_participants, ...e }) => ({
        ...publicEvent(e),
        submission_count: submissions[0]?.count ?? 0,
        participant_count: event_participants[0]?.count ?? 0,
      })),
    };
  });

  app.post('/api/events/:id/open', async (req) => {
    const user = await requireUser(req);
    const event = await managedEvent(parse(IdParams, req.params).id, user);
    if (event.status !== 'draft') throw conflict('not_a_draft', 'Only a draft can be opened.');
    must(await db().from('events').update({ status: 'open' }).eq('id', event.id).eq('status', 'draft'));
    return { ok: true };
  });

  app.post('/api/events/:id/allowlist', async (req) => {
    const user = await requireUser(req);
    const event = await managedEvent(parse(IdParams, req.params).id, user);
    const { emails } = parse(AllowlistSchema, req.body);
    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    must(
      await db().from('event_allowlist').upsert(
        unique.map((email) => ({ event_id: event.id, organization_id: event.organization_id, email, added_by: user.id })),
        { onConflict: 'event_id,email', ignoreDuplicates: true },
      ),
    );
    return { added: unique.length };
  });

  app.get('/api/events/:id/allowlist', async (req) => {
    const user = await requireUser(req);
    const event = await managedEvent(parse(IdParams, req.params).id, user);
    const rows = must(await db().from('event_allowlist').select('email, claimed_by, created_at').eq('event_id', event.id).order('email'));
    return { allowlist: rows };
  });

  app.post('/api/events/:id/close', async (req) => {
    const user = await requireUser(req);
    const event = await managedEvent(parse(IdParams, req.params).id, user);
    if (event.status !== 'open') throw conflict('not_open', 'Only an open event can be closed.');
    const result = await closeEvent(event.id);
    if (!result.closed) throw conflict('already_closed', 'This event was already closed.');
    return result;
  });

  app.post('/api/events/:id/publish', async (req) => {
    const user = await requireUser(req);
    const event = await managedEvent(parse(IdParams, req.params).id, user, 'results.publish');
    if (event.status !== 'review') throw conflict('not_ready', 'Results can be published once judging has finished.');
    must(await db().from('events').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', event.id).eq('status', 'review'));
    return { ok: true };
  });

  app.get('/api/events/:id/console', async (req) => {
    const user = await requireUser(req);
    const event = await getEvent(parse(IdParams, req.params).id);
    if (!memberOf(user, event.organization_id)) throw forbidden();
    const board = await leaderboard(event);
    const submitters = [...new Set(board.rows.map((r) => r.submitted_by))];
    const profiles = submitters.length
      ? (must(await db().from('profiles').select('id, display_name').in('id', submitters)) as { id: string; display_name: string }[])
      : [];
    const { count } = await db().from('event_participants').select('user_id', { count: 'exact', head: true }).eq('event_id', event.id);
    const flags = must(await db().from('similarity_flags').select('*').eq('event_id', event.id));
    return {
      event: publicEvent(event),
      rubric: board.rubric,
      participant_count: count ?? 0,
      submissions: board.rows.map(({ activity_json, ...r }) => ({
        ...r,
        // The steps without the model's reasoning, which stays on the submission page. Only the latest 40 are sent.
        activity: activity_json.filter((a) => a.kind !== 'thought').slice(-40),
        step_count: activity_json.filter((a) => a.kind !== 'thought').length,
        submitted_by_name: profiles.find((p) => p.id === r.submitted_by)?.display_name ?? '',
      })),
      similarity_flags: flags,
    };
  });

  app.get('/api/submissions/:id', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const sub = must(
      await db()
        .from('submissions')
        .select('*, events(id, name, slug, rubric_json, status), repo_analyses(commit_sha, model, map_json, commit_profile_json, file_count), submission_versions!submission_versions_submission_id_fkey(id, version_no, description, video_url, slides_url, created_at, repos(owner, name, url))')
        .eq('id', id)
        .maybeSingle(),
    ) as (Record<string, unknown> & { organization_id: string }) | null;
    if (!sub) throw notFound('Submission not found');
    if (!memberOf(user, sub.organization_id)) throw forbidden();
    const scores = must(await db().from('scores').select('*').eq('submission_id', id));
    const feedback = must(await db().from('feedback').select('strengths_json, improvements_json').eq('submission_id', id).maybeSingle());
    const interview = must(
      await db().from('interviews').select('id, status').eq('submission_id', id).neq('status', 'error').maybeSingle(),
    );
    return { submission: sub, scores, feedback, interview };
  });

  app.patch('/api/scores/:id', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { override_score } = parse(OverrideScoreSchema, req.body);
    const score = must(await db().from('scores').select('id, organization_id').eq('id', id).maybeSingle()) as { id: string; organization_id: string } | null;
    if (!score) throw notFound('Score not found');
    requirePermission(user, 'score.override', score.organization_id);
    const updated = must(
      await db()
        .from('scores')
        .update({ override_score, overridden_by: override_score == null ? null : user.id, overridden_at: override_score == null ? null : new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single(),
    );
    return { score: updated };
  });

  app.post('/api/submissions/:id/rejudge', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const sub = must(await db().from('submissions').select('id, event_id, organization_id, status, locked_commit_sha').eq('id', id).maybeSingle()) as
      | { id: string; event_id: string; organization_id: string; status: string; locked_commit_sha: string | null }
      | null;
    if (!sub) throw notFound('Submission not found');
    requirePermission(user, 'event.manage', sub.organization_id);
    if (sub.status !== 'error' || !sub.locked_commit_sha) throw conflict('not_retryable', 'Only a failed submission with frozen code can be judged again.');
    must(await db().from('events').update({ status: 'judging' }).eq('id', sub.event_id).eq('status', 'review'));
    // Back to the queue with a fresh count of automatic attempts. It starts now if there is a free slot.
    must(
      await db()
        .from('submissions')
        .update({ status: 'queued', error: null, judge_attempts: 0, next_attempt_at: null })
        .eq('id', sub.id)
        .eq('status', 'error'),
    );
    await dispatchJudging();
    return { ok: true };
  });

  // ---- student ----

  app.get('/api/events', async (req) => {
    await requireUser(req);
    const rows = must(
      await db()
        .from('events')
        .select('*, organizations(name, slug)')
        .eq('status', 'open')
        .eq('visibility', 'public')
        .gt('submission_deadline', new Date().toISOString())
        .order('submission_deadline')
        .limit(100),
    ) as EventRow[];
    return { events: rows.map(publicEvent) };
  });

  app.get('/api/me/events', async (req) => {
    const user = await requireUser(req);
    const rows = must(
      await db().from('event_participants').select('joined_at, events(*, organizations(name, slug))').eq('user_id', user.id).order('joined_at', { ascending: false }),
    ) as unknown as { events: EventRow }[];
    return { events: rows.map((r) => publicEvent(r.events)) };
  });

  app.get('/api/events/by-slug/:slug', async (req) => {
    const user = await requireUser(req);
    const { slug } = parse(z.object({ slug: z.string().max(100) }), req.params);
    const event = must(await db().from('events').select('*, organizations(name, slug)').eq('slug', slug).maybeSingle()) as EventRow | null;
    if (!event) throw notFound('Event not found');
    const manager = memberOf(user, event.organization_id);
    if (event.status === 'draft' && !manager) throw notFound('Event not found');
    const participant = await isParticipant(event.id, user.id);
    // Someone holding the link to a private event sees enough to join, and nothing else.
    const full = manager || participant || event.visibility === 'public';
    const view = publicEvent(event);
    return {
      event: full ? view : { ...view, description: '', rubric_json: [] },
      is_participant: participant,
      is_manager: manager,
    };
  });

  app.post('/api/events/:id/join', async (req) => {
    const user = await requireUser(req);
    requirePermission(user, 'event.join');
    const event = await getEvent(parse(IdParams, req.params).id);
    const { access_code } = parse(JoinEventSchema, req.body);
    if (event.status !== 'open' || Date.parse(event.submission_deadline) <= Date.now())
      throw conflict('event_closed', 'This event is not accepting participants.');
    if (await isParticipant(event.id, user.id)) return { joined: true };

    if (event.visibility === 'code') {
      if (!codeAttempts.allow(`${user.id}:${event.id}`)) throw tooMany('Too many attempts. Wait a few minutes and try again.');
      if (!access_code || !verifyAccessCode(access_code, event.access_code_hash))
        throw forbidden('That access code is not correct.');
    }
    if (event.visibility === 'invite') {
      if (!user.email || !user.emailConfirmed) throw forbidden('Confirm your email address to join an invite-only event.');
      const claimed = must(
        await db().from('event_allowlist').update({ claimed_by: user.id }).eq('event_id', event.id).eq('email', user.email).select('email'),
      ) as { email: string }[];
      if (claimed.length === 0) throw forbidden('This event is invite-only and your email is not on the list.');
    }
    must(
      await db().from('event_participants').upsert(
        { event_id: event.id, organization_id: event.organization_id, user_id: user.id, joined_via: event.visibility },
        { onConflict: 'event_id,user_id', ignoreDuplicates: true },
      ),
    );
    return { joined: true };
  });

  app.get('/api/events/:id/my-submission', async (req) => {
    const user = await requireUser(req);
    const event = await getEvent(parse(IdParams, req.params).id);
    if (!(await isParticipant(event.id, user.id))) throw forbidden('Join the event first.');
    const sub = must(
      await db()
        .from('submissions')
        .select('id, team_name, status, error, versions_used, current_version_id, locked_commit_sha, locked_at, submission_versions!submission_versions_submission_id_fkey(id, version_no, description, video_url, slides_url, created_at, repos(owner, name, url))')
        .eq('event_id', event.id)
        .eq('submitted_by', user.id)
        .maybeSingle(),
    ) as { versions_used: number } | null;
    return {
      submission: sub,
      max_submissions: event.max_submissions,
      submissions_left: submissionsLeft(event.max_submissions, sub?.versions_used ?? 0),
      accepting: event.status === 'open' && Date.parse(event.submission_deadline) > Date.now(),
    };
  });

  app.post('/api/events/:id/submissions', async (req) => {
    const user = await requireUser(req);
    requirePermission(user, 'submission.create');
    const { id: eventId } = parse(IdParams, req.params);
    const input = parse(SubmitSchema, req.body);
    const ref = parseGithubUrl(input.repo_url);
    if (!ref) throw badRequest('invalid_repo', 'Use a public GitHub repository URL.');
    // Checks with GitHub that the repository exists and is public before spending one of the allowed submissions.
    const { repo } = await resolveRepo(ref.owner, ref.name);

    const res = await db().rpc('submit_version', {
      p_event: eventId,
      p_user: user.id,
      p_team_name: input.team_name,
      p_repo: repo.id,
      p_description: input.description,
      p_video_url: input.video_url ?? null,
      p_slides_url: input.slides_url ?? null,
    });
    if (res.error) {
      const m = res.error.message;
      if (m.includes('event_not_found')) throw notFound('Event not found');
      if (m.includes('event_closed')) throw conflict('event_closed', 'Submissions are closed for this event.');
      if (m.includes('event_not_started')) throw conflict('event_not_started', 'This event has not started yet.');
      if (m.includes('not_a_participant')) throw forbidden('Join the event first.');
      if (m.includes('submission_limit_reached')) throw conflict('submission_limit_reached', 'You have used all your submissions for this event.');
      throw new Error(`Database error: ${m}`);
    }
    const row = (res.data as { submission_id: string; version_no: number; versions_used: number }[])[0]!;
    const event = await getEvent(eventId);
    return { ...row, submissions_left: submissionsLeft(event.max_submissions, row.versions_used) };
  });

  app.get('/api/events/:id/results', async (req) => {
    const user = await requireUser(req);
    const event = await getEvent(parse(IdParams, req.params).id);
    if (!(await isParticipant(event.id, user.id))) throw forbidden();
    if (event.status !== 'published') return { published: false, status: event.status, event: publicEvent(event) };
    const board = await leaderboard(event);
    const mine = board.rows.find((r) => r.submitted_by === user.id) ?? null;
    const feedback = mine
      ? must(await db().from('feedback').select('strengths_json, improvements_json').eq('submission_id', mine.id).maybeSingle())
      : null;
    const interview = mine
      ? must(await db().from('interviews').select('id, status').eq('submission_id', mine.id).eq('user_id', user.id).neq('status', 'error').maybeSingle())
      : null;
    return {
      published: true,
      status: event.status,
      event: publicEvent(event),
      rubric: board.rubric,
      // Other teams appear with name and total only.
      leaderboard: board.rows.filter((r) => r.total != null).map((r, i) => ({ rank: i + 1, team_name: r.team_name, total: r.total, mine: r.id === mine?.id })),
      mine: mine ? { id: mine.id, team_name: mine.team_name, total: mine.total, scores: mine.scores, status: mine.status, note: mine.error, ownership: mine.ownership } : null,
      feedback,
      interview,
    };
  });
}
