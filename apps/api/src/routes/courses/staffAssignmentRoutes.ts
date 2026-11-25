import { COURSE_ERRORS, CreateAssignmentSchema, GradeAdjustmentSchema, OverrideScoreSchema, UpdateAssignmentSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { memberOf, requirePermission, requireUser } from '../../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { IdParams, parse } from '../../lib/http.js';
import { primaryModels } from '../../lib/models.js';
import { db, maybeOne, must, mustOne, mustRows } from '../../lib/supabase.js';
import { closeAssignment } from '../../services/judge.js';
import { dispatchJudging } from '../../services/judgeQueue.js';
import { assignmentBoard, getCourse, groupsOf, names, publicAssignment, staffAssignment, students } from './shared.js';
import type { AssignmentRow } from './types.js';

export async function staffAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/courses/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    requirePermission(user, 'course.manage', course.organization_id);
    if (course.archived_at) throw forbidden('This course is archived.');
    const { publish, rubric, ...input } = parse(CreateAssignmentSchema, req.body);
    const row = mustOne<AssignmentRow>(
      await db()
        .from('course_assignments')
        .insert({ ...input, rubric_json: rubric, organization_id: course.organization_id, course_id: course.id, status: publish ? 'open' : 'draft', created_by: user.id })
        .select('*')
        .single(),
    );
    await audit({
      organizationId: course.organization_id,
      actorId: user.id,
      action: 'course.assignment_created',
      subjectType: 'assignment',
      subjectId: row.id,
      detail: { course: course.name, title: row.title, mode: row.mode },
    });
    return { assignment: publicAssignment(row) };
  });

  /** Edits an assignment before grading starts. The rubric can change only while it is a draft. */
  app.patch('/api/assignments/:id', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    if (!['draft', 'open'].includes(a.status)) throw conflict('assignment_closed', 'This assignment can no longer be edited.');
    const { rubric, ...input } = parse(UpdateAssignmentSchema, req.body);
    if (rubric && a.status !== 'draft') throw conflict('rubric_locked', 'The rubric can only change while the assignment is a draft.');
    if (input.group_lock_at !== undefined && a.mode !== 'group') throw badRequest('not_a_group_assignment', COURSE_ERRORS.not_a_group_assignment!);
    const dueAt = input.due_at ?? a.due_at;
    if (Date.parse(dueAt) <= Date.parse(input.opens_at ?? a.opens_at)) throw badRequest('invalid_dates', 'The due date must be after it opens.');
    const lockAt = input.group_lock_at === undefined ? a.group_lock_at : input.group_lock_at;
    if (lockAt && Date.parse(lockAt) > Date.parse(dueAt)) throw badRequest('invalid_dates', 'Groups must close before the due date.');
    const row = mustOne<AssignmentRow>(
      await db()
        .from('course_assignments')
        .update({ ...input, ...(rubric ? { rubric_json: rubric } : {}), updated_at: new Date().toISOString() })
        .eq('id', a.id)
        .select('*')
        .single(),
    );
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'course.assignment_updated', subjectType: 'assignment', subjectId: a.id, detail: { fields: Object.keys(input) } });
    return { assignment: publicAssignment(row) };
  });

  app.post('/api/assignments/:id/open', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    const done = mustRows<{ id: string }>(
      await db().from('course_assignments').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'draft').select('id'),
    );
    if (!done.length) throw conflict('not_a_draft', 'Only a draft can be opened.');
    return { ok: true };
  });

  /** Closes submissions now (before the due date): freezes every repository and starts grading. */
  app.post('/api/assignments/:id/close', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    if (a.status !== 'open') throw conflict('not_open', 'Only an open assignment can be closed.');
    const result = await closeAssignment(a.id);
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'assignment.closed', subjectType: 'assignment', subjectId: a.id, detail: { queued: result.queued } });
    return result;
  });

  /** Students see their scores and feedback from now on. */
  app.post('/api/assignments/:id/publish', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    if (a.status !== 'review') throw conflict('not_in_review', 'Results can be published once grading is done.');
    must(await db().from('course_assignments').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'review'));
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'assignment.published', subjectType: 'assignment', subjectId: a.id });
    return { ok: true };
  });

  /** The assignment console: submissions with scores, groups and who has no group yet. */
  app.get('/api/assignments/:id/console', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user);
    const course = await getCourse(a.course_id);
    const roster = await students(a.course_id);
    const board = await assignmentBoard(a);
    const groups = a.mode === 'group' ? await groupsOf(a.id) : [];
    const grouped = new Set(groups.flatMap((g) => g.members.filter((m) => m.status === 'accepted').map((m) => m.user_id)));
    const submittedStudents = new Set(board.rows.flatMap((r) => (r.members ? r.members.map((m) => m.user_id) : [r.student_id!])));
    const flags = must(await db().from('assignment_similarity_flags').select('*').eq('assignment_id', a.id));
    return {
      assignment: publicAssignment(a, { submissions: board.rows.length, students: roster.length }),
      course: { id: course.id, name: course.name, code: course.code },
      rubric: board.rubric,
      submissions: board.rows,
      groups,
      ungrouped: a.mode === 'group' ? roster.filter((s) => !grouped.has(s.user_id)) : [],
      missing: roster.filter((s) => !submittedStudents.has(s.user_id)),
      similarity_flags: flags,
      primary_models: primaryModels(),
    };
  });

  app.get('/api/assignment-submissions/:id', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const sub = maybeOne<Record<string, unknown> & { organization_id: string; group_id: string | null; student_id: string | null; assignment_id: string }>(
      await db()
        .from('assignment_submissions')
        .select('*, course_assignments(id, course_id, title, rubric_json, status, mode, due_at, interviews_enabled, courses(name, code)), repo_analyses(commit_sha, model, map_json, commit_profile_json, file_count), assignment_submission_versions!assignment_submission_versions_submission_id_fkey(id, version_no, description, video_url, created_at, submitted_by, repos(owner, name, url))')
        .eq('id', id)
        .maybeSingle(),
    );
    if (!sub) throw notFound('Submission not found');
    if (!memberOf(user, sub.organization_id)) throw forbidden();
    const [scores, feedback, interviews, decisions] = await Promise.all([
      db().from('assignment_scores').select('*').eq('submission_id', id),
      db().from('assignment_feedback').select('strengths_json, improvements_json, next_steps_json').eq('submission_id', id).maybeSingle(),
      db().from('interviews').select('id, status, user_id, interview_reports(ownership_score, confidence)').eq('assignment_submission_id', id).neq('status', 'error'),
      db().from('integrity_decisions').select('*, profiles!integrity_decisions_decided_by_fkey(display_name)').eq('assignment_submission_id', id).order('created_at', { ascending: false }),
    ]);
    const group = sub.group_id ? (await groupsOf(sub.assignment_id)).find((g) => g.id === sub.group_id) ?? null : null;
    const student = sub.student_id ? (await names([sub.student_id])).get(sub.student_id) ?? null : null;
    const adjustments = group
      ? must(
          await db().from('assignment_grade_adjustments').select('user_id, adjusted_total, note, adjusted_at').eq('assignment_id', sub.assignment_id).in('user_id', group.members.map((m) => m.user_id)),
        )
      : [];
    return {
      submission: sub,
      group,
      student,
      scores: must(scores),
      feedback: must(feedback),
      interviews: must(interviews),
      decisions: must(decisions),
      adjustments,
      primary_models: primaryModels(),
    };
  });

  app.patch('/api/assignment-scores/:id', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { override_score } = parse(OverrideScoreSchema, req.body);
    const score = maybeOne<{ id: string; organization_id: string }>(await db().from('assignment_scores').select('id, organization_id').eq('id', id).maybeSingle());
    if (!score) throw notFound('Score not found');
    requirePermission(user, 'course.manage', score.organization_id);
    const updated = must(
      await db()
        .from('assignment_scores')
        .update({ override_score, overridden_by: override_score == null ? null : user.id, overridden_at: override_score == null ? null : new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single(),
    );
    await audit({ organizationId: score.organization_id, actorId: user.id, action: 'score.override', subjectType: 'assignment_score', subjectId: id, detail: { override_score } });
    return { score: updated };
  });

  app.post('/api/assignment-submissions/:id/rejudge', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const sub = maybeOne<{ id: string; assignment_id: string; organization_id: string; status: string; locked_commit_sha: string | null }>(
      await db().from('assignment_submissions').select('id, assignment_id, organization_id, status, locked_commit_sha').eq('id', id).maybeSingle(),
    );
    if (!sub) throw notFound('Submission not found');
    requirePermission(user, 'course.manage', sub.organization_id);
    if (!['error', 'canceled'].includes(sub.status) || !sub.locked_commit_sha) throw conflict('not_retryable', 'Only a failed or canceled submission with frozen code can be graded again.');
    must(await db().from('course_assignments').update({ status: 'judging' }).eq('id', sub.assignment_id).eq('status', 'review'));
    must(
      await db()
        .from('assignment_submissions')
        .update({ status: 'queued', error: null, judge_attempts: 0, next_attempt_at: null, activity_json: [], models_used: [], updated_at: new Date().toISOString() })
        .eq('id', sub.id),
    );
    await dispatchJudging();
    await audit({ organizationId: sub.organization_id, actorId: user.id, action: 'submission.rejudged', subjectType: 'assignment_submission', subjectId: sub.id });
    return { ok: true };
  });

  app.put('/api/assignments/:id/adjustments/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const a = await staffAssignment(id, user, true);
    const input = parse(GradeAdjustmentSchema, req.body);
    must(
      await db()
        .from('assignment_grade_adjustments')
        .upsert({ assignment_id: a.id, user_id: userId, organization_id: a.organization_id, ...input, adjusted_by: user.id, adjusted_at: new Date().toISOString() }, { onConflict: 'assignment_id,user_id' }),
    );
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'grade.adjusted', subjectType: 'assignment', subjectId: a.id, detail: { user_id: userId, adjusted_total: input.adjusted_total } });
    return { ok: true };
  });

  app.delete('/api/assignments/:id/adjustments/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const a = await staffAssignment(id, user, true);
    must(await db().from('assignment_grade_adjustments').delete().eq('assignment_id', a.id).eq('user_id', userId));
    return { ok: true };
  });
}
