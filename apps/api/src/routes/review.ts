import { ASSIGNMENT_STORE, EVENT_STORE } from '../services/contest.js';
import { enqueue } from '../services/queue.js';
import { getFileText } from '../lib/github.js';
import { AssignJudgeSchema, IntegrityDecisionSchema, JudgeReviewSchema, RubricSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { requirePermission, requireUser, type AuthUser } from '../lib/auth.js';
import { can as canDo } from '../lib/permissions.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must, mustOne, mustRows } from '../lib/supabase.js';

interface SubmissionRef {
  id: string;
  event_id: string;
  organization_id: string;
}

async function submissionRef(id: string): Promise<SubmissionRef> {
  const s = must(await db().from('submissions').select('id, event_id, organization_id').eq('id', id).maybeSingle()) as SubmissionRef | null;
  if (!s) throw notFound('Submission not found');
  return s;
}

async function eventOrg(eventId: string): Promise<string> {
  const e = must(await db().from('events').select('organization_id').eq('id', eventId).maybeSingle()) as { organization_id: string } | null;
  if (!e) throw notFound('Event not found');
  return e.organization_id;
}

/** A judge may review a submission they were assigned to. Organizers may review any of their organization's. */
async function mayReview(user: AuthUser, sub: SubmissionRef): Promise<boolean> {
  if (!canDo(user.grants, 'submission.review', sub.organization_id)) return false;
  if (canDo(user.grants, 'event.manage', sub.organization_id)) return true;
  const row = must(await db().from('judge_assignments').select('judge_id').eq('submission_id', sub.id).eq('judge_id', user.id).maybeSingle());
  return !!row;
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  // ---- judge assignments ----

  app.get('/api/events/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'event.manage', await eventOrg(id));
    const assignments = must(
      await db().from('judge_assignments').select('submission_id, judge_id, created_at, profiles!judge_assignments_judge_id_fkey(display_name)').eq('event_id', id),
    );
    return { assignments };
  });

  /** People of the organization who can review submissions, to pick judges from. */
  app.get('/api/events/:id/judges', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const orgId = await eventOrg(id);
    requirePermission(user, 'event.manage', orgId);
    const rows = mustRows<{ user_id: string; roles: { key: string; role_permissions: { permissions: { key: string } | null }[] } | null; profiles: { display_name: string } | null }>(
      await db()
        .from('user_roles')
        .select('user_id, roles(key, role_permissions(permissions(key))), profiles!user_roles_user_id_fkey(display_name)')
        .eq('organization_id', orgId),
    );
    const judges = new Map<string, { user_id: string; display_name: string; roles: string[] }>();
    for (const r of rows) {
      if (!r.roles?.role_permissions.some((rp) => rp.permissions?.key === 'submission.review')) continue;
      const j = judges.get(r.user_id) ?? { user_id: r.user_id, display_name: r.profiles?.display_name ?? '', roles: [] };
      j.roles.push(r.roles.key);
      judges.set(r.user_id, j);
    }
    return { judges: [...judges.values()].sort((a, b) => a.display_name.localeCompare(b.display_name)) };
  });

  app.post('/api/events/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const orgId = await eventOrg(id);
    requirePermission(user, 'event.manage', orgId);
    const input = parse(AssignJudgeSchema, req.body);
    // The judge must hold submission.review in this organization.
    const grants = mustRows<{ roles: { role_permissions: { permissions: { key: string } | null }[] } | null }>(
      await db().from('user_roles').select('roles(role_permissions(permissions(key)))').eq('user_id', input.judge_id).eq('organization_id', orgId),
    );
    const canReview = grants.some((g) => g.roles?.role_permissions.some((rp) => rp.permissions?.key === 'submission.review'));
    if (!canReview) throw badRequest('not_a_judge', 'That person cannot review submissions in this organization.');
    const subs = must(await db().from('submissions').select('id').eq('event_id', id).in('id', input.submission_ids)) as { id: string }[];
    if (subs.length !== input.submission_ids.length) throw badRequest('unknown_submission', 'Some submissions are not part of this event.');
    must(
      await db()
        .from('judge_assignments')
        .upsert(subs.map((s) => ({ submission_id: s.id, judge_id: input.judge_id, event_id: id, organization_id: orgId, assigned_by: user.id })), {
          onConflict: 'submission_id,judge_id',
          ignoreDuplicates: true,
        }),
    );
    await audit({ organizationId: orgId, actorId: user.id, action: 'judge.assigned', subjectType: 'event', subjectId: id, detail: { judge_id: input.judge_id, submissions: subs.length } });
    return { assigned: subs.length };
  });

  app.delete('/api/events/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const orgId = await eventOrg(id);
    requirePermission(user, 'event.manage', orgId);
    const input = parse(AssignJudgeSchema, req.body);
    must(await db().from('judge_assignments').delete().eq('event_id', id).eq('judge_id', input.judge_id).in('submission_id', input.submission_ids));
    return { ok: true };
  });

  /** The judge workspace queue: submissions assigned to me, with the state of my review. */
  app.get('/api/me/assignments', async (req) => {
    const user = await requireUser(req);
    const { event_id } = parse(z.object({ event_id: z.uuid().optional() }), req.query);
    let q = db()
      .from('judge_assignments')
      .select('submission_id, event_id, created_at, events(name, slug, status, rubric_json), submissions(team_name, status, locked_commit_sha)')
      .eq('judge_id', user.id);
    if (event_id) q = q.eq('event_id', event_id);
    const assignments = must(await q.order('created_at')) as { submission_id: string }[];
    const ids = assignments.map((a) => a.submission_id);
    const reviews = ids.length
      ? (must(await db().from('judge_reviews').select('submission_id, status, updated_at').eq('judge_id', user.id).in('submission_id', ids)) as { submission_id: string }[])
      : [];
    return { assignments: assignments.map((a) => ({ ...a, my_review: reviews.find((r) => r.submission_id === a.submission_id) ?? null })) };
  });

  // ---- judge reviews ----

  app.get('/api/submissions/:id/review', async (req) => {
    const user = await requireUser(req);
    const sub = await submissionRef(parse(IdParams, req.params).id);
    if (!(await mayReview(user, sub))) throw forbidden();
    const review = must(await db().from('judge_reviews').select('*').eq('submission_id', sub.id).eq('judge_id', user.id).maybeSingle());
    return { review };
  });

  app.put('/api/submissions/:id/review', async (req) => {
    const user = await requireUser(req);
    const sub = await submissionRef(parse(IdParams, req.params).id);
    if (!(await mayReview(user, sub))) throw forbidden();
    const input = parse(JudgeReviewSchema, req.body);
    const event = must(await db().from('events').select('rubric_json, status').eq('id', sub.event_id).single()) as { rubric_json: unknown; status: string };
    if (event.status === 'published') throw badRequest('published', 'Results are published, so reviews can no longer change.');
    const keys = new Set(RubricSchema.parse(event.rubric_json).map((c) => c.key));
    const unknown = input.scores.find((s) => !keys.has(s.criterion_key));
    if (unknown) throw badRequest('unknown_criterion', `"${unknown.criterion_key}" is not a criterion of this event.`);
    const review = must(
      await db()
        .from('judge_reviews')
        .upsert(
          { submission_id: sub.id, judge_id: user.id, organization_id: sub.organization_id, scores_json: input.scores, note: input.note, status: input.status, updated_at: new Date().toISOString() },
          { onConflict: 'submission_id,judge_id' },
        )
        .select('*')
        .single(),
    );
    if (input.status === 'submitted')
      await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'review.submitted', subjectType: 'submission', subjectId: sub.id });
    return { review };
  });

  /** Every judge's review of one submission, for the organizer. */
  app.get('/api/submissions/:id/reviews', async (req) => {
    const user = await requireUser(req);
    const sub = await submissionRef(parse(IdParams, req.params).id);
    requirePermission(user, 'event.manage', sub.organization_id);
    const reviews = must(
      await db().from('judge_reviews').select('*, profiles!judge_reviews_judge_id_fkey(display_name)').eq('submission_id', sub.id).order('updated_at', { ascending: false }),
    );
    return { reviews };
  });

  // ---- integrity: similarity forensics and course mode ----

  app.get('/api/events/:id/integrity', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const orgId = await eventOrg(id);
    if (!canDo(user.grants, 'integrity.decide', orgId) && !canDo(user.grants, 'event.manage', orgId)) throw forbidden();
    const flags = must(await db().from('similarity_flags').select('id').eq('event_id', id)) as { id: string }[];
    const [decisions, matches] = await Promise.all([
      db().from('integrity_decisions').select('*, profiles!integrity_decisions_decided_by_fkey(display_name)').eq('event_id', id).order('created_at', { ascending: false }),
      flags.length ? db().from('similarity_matches').select('*').in('flag_id', flags.map((f) => f.id)).order('score', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    return { decisions: must(decisions), matches: must(matches) };
  });

  /** Integrity review of a course assignment: its similarity flags and the decisions taken. */
  app.get('/api/assignments/:id/integrity', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const a = must(await db().from('course_assignments').select('organization_id').eq('id', id).maybeSingle()) as { organization_id: string } | null;
    if (!a) throw notFound('Assignment not found');
    if (!canDo(user.grants, 'integrity.decide', a.organization_id) && !canDo(user.grants, 'course.manage', a.organization_id)) throw forbidden();
    const [flags, decisions] = await Promise.all([
      db().from('assignment_similarity_flags').select('*').eq('assignment_id', id).order('score', { ascending: false }),
      db().from('integrity_decisions').select('*, profiles!integrity_decisions_decided_by_fkey(display_name)').eq('assignment_id', id).order('created_at', { ascending: false }),
    ]);
    const flagRows = must(flags) as { id: string }[];
    const matches = flagRows.length
      ? must(await db().from('assignment_similarity_matches').select('*').in('flag_id', flagRows.map((f) => f.id)).order('score', { ascending: false }))
      : [];
    return { flags: flagRows, decisions: must(decisions), matches };
  });

  // ---- content similarity: recompute, and the code of one matching fragment ----

  for (const scope of ['event', 'assignment'] as const) {
    const store = scope === 'event' ? EVENT_STORE : ASSIGNMENT_STORE;
    const path = scope === 'event' ? '/api/events/:id/similarity' : '/api/assignments/:id/similarity';
    /** Compares the code of every judged submission again (for example after setting the starter code). */
    app.post(path, async (req) => {
      const user = await requireUser(req);
      const { id } = parse(IdParams, req.params);
      const c = must(await db().from(store.contests).select('organization_id').eq('id', id).maybeSingle()) as { organization_id: string } | null;
      if (!c) throw notFound(scope === 'event' ? 'Event not found' : 'Assignment not found');
      if (!canDo(user.grants, 'integrity.decide', c.organization_id) && !canDo(user.grants, scope === 'event' ? 'event.manage' : 'course.manage', c.organization_id))
        throw forbidden();
      await enqueue(scope === 'event' ? 'similarity-event' : 'similarity-assignment', id);
      await audit({ organizationId: c.organization_id, actorId: user.id, action: 'similarity.recomputed', subjectType: scope, subjectId: id });
      return { queued: true };
    });
  }

  /** Both sides of one matching fragment, read from GitHub at the frozen commits. */
  app.get('/api/similarity-matches/:id/code', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { scope } = parse(z.object({ scope: z.enum(['event', 'assignment']).default('event') }), req.query);
    const store = scope === 'event' ? EVENT_STORE : ASSIGNMENT_STORE;
    const flagsTable = store.flags;
    const m = must(
      await db().from(scope === 'event' ? 'similarity_matches' : 'assignment_similarity_matches').select('*').eq('id', id).maybeSingle(),
    ) as { flag_id: string; organization_id: string; path_a: string; start_a: number; end_a: number; path_b: string; start_b: number; end_b: number } | null;
    if (!m) throw notFound('Match not found');
    if (!canDo(user.grants, 'integrity.decide', m.organization_id) && !canDo(user.grants, scope === 'event' ? 'event.manage' : 'course.manage', m.organization_id))
      throw forbidden();
    const flag = must(await db().from(flagsTable).select('submission_a, submission_b').eq('id', m.flag_id).single()) as { submission_a: string; submission_b: string };
    const side = async (submissionId: string, path: string, start: number, end: number) => {
      const sub = mustOne<{
        locked_commit_sha: string | null;
        current_version: { repos: { owner: string; name: string; url: string } | null } | null;
      }>(await db().from(store.submissions).select(`locked_commit_sha, ${store.currentVersion}`).eq('id', submissionId).single());
      const repo = sub.current_version?.repos;
      if (!repo || !sub.locked_commit_sha) return { path, start, end, lines: [] as { number: number; text: string }[], repo: null, sha: null };
      const text = await getFileText(repo.owner, repo.name, sub.locked_commit_sha, path).catch(() => '');
      const from = Math.max(1, start - 2);
      const to = end + 2;
      const lines = text
        .split('\n')
        .slice(from - 1, Math.min(to, from - 1 + 120))
        .map((t, i) => ({ number: from + i, text: t }));
      return { path, start, end, lines, repo: { owner: repo.owner, name: repo.name, url: repo.url }, sha: sub.locked_commit_sha };
    };
    const [a, b] = await Promise.all([side(flag.submission_a, m.path_a, m.start_a, m.end_a), side(flag.submission_b, m.path_b, m.start_b, m.end_b)]);
    return { a, b };
  });

  /** A verdict on an event pair or submission, or on a course assignment pair or submission. */
  app.post('/api/integrity-decisions', async (req) => {
    const user = await requireUser(req);
    const input = parse(IntegrityDecisionSchema, req.body);
    let scope: Record<string, string | null>;
    let organizationId: string;
    if ('flag_id' in input) {
      const flag = must(await db().from('similarity_flags').select('event_id, organization_id').eq('id', input.flag_id).maybeSingle()) as { event_id: string; organization_id: string } | null;
      if (!flag) throw notFound('Flag not found');
      organizationId = flag.organization_id;
      scope = { event_id: flag.event_id, flag_id: input.flag_id };
    } else if ('submission_id' in input) {
      const sub = await submissionRef(input.submission_id);
      organizationId = sub.organization_id;
      scope = { event_id: sub.event_id, submission_id: input.submission_id };
    } else if ('assignment_flag_id' in input) {
      const flag = must(await db().from('assignment_similarity_flags').select('assignment_id, organization_id').eq('id', input.assignment_flag_id).maybeSingle()) as
        | { assignment_id: string; organization_id: string }
        | null;
      if (!flag) throw notFound('Flag not found');
      organizationId = flag.organization_id;
      scope = { assignment_id: flag.assignment_id, assignment_flag_id: input.assignment_flag_id };
    } else {
      const sub = must(await db().from('assignment_submissions').select('assignment_id, organization_id').eq('id', input.assignment_submission_id).maybeSingle()) as
        | { assignment_id: string; organization_id: string }
        | null;
      if (!sub) throw notFound('Submission not found');
      organizationId = sub.organization_id;
      scope = { assignment_id: sub.assignment_id, assignment_submission_id: input.assignment_submission_id };
    }
    requirePermission(user, 'integrity.decide', organizationId);
    const decision = must(
      await db()
        .from('integrity_decisions')
        .insert({ organization_id: organizationId, ...scope, verdict: input.verdict, note: input.note, decided_by: user.id })
        .select('*')
        .single(),
    ) as { id: string };
    await audit({ organizationId, actorId: user.id, action: 'integrity.decided', subjectType: 'integrity_decision', subjectId: decision.id, detail: { verdict: input.verdict } });
    return { decision };
  });
}
