import {
  AssignmentSubmitSchema, COURSE_ERRORS, CourseMembersSchema, CreateAssignmentSchema, CreateCourseSchema, CreateGroupSchema,
  GradeAdjustmentSchema, GroupInviteSchema, GroupRespondSchema, OverrideScoreSchema, PlaceInGroupSchema, RubricSchema, StaffGroupSchema,
  UpdateAssignmentSchema,
  parseGithubUrl, submissionsLeft, weightedTotal, type ActivityEntry, type Rubric,
} from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { resolveRepo } from '../engine/analyze.js';
import { audit } from '../lib/audit.js';
import { memberOf, requirePermission, requireUser, type AuthUser } from '../lib/auth.js';
import { HttpError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { primaryModels } from '../lib/models.js';
import { db, must } from '../lib/supabase.js';
import { closeAssignment } from '../services/judge.js';
import { dispatchJudging } from '../services/judgeQueue.js';

/**
 * Courses and their assignments (20261120000001), apart from events.
 *   Staff (organization members; writes need course.manage): courses, roster, assignments, groups, console, grading.
 *   Students (on the roster): their courses and assignments, their group and invitations, their submission and results.
 * Every group and submission rule is enforced by the database functions; this file maps their errors to messages.
 */

interface CourseRow {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  created_at: string;
  archived_at: string | null;
}

export interface AssignmentRow {
  id: string;
  organization_id: string;
  course_id: string;
  title: string;
  instructions: string;
  learning_goals: string;
  opens_at: string;
  due_at: string;
  status: 'draft' | 'open' | 'judging' | 'review' | 'published';
  mode: 'individual' | 'group';
  group_min: number | null;
  group_max: number | null;
  group_lock_at: string | null;
  max_submissions: number | null;
  interviews_enabled: boolean;
  rubric_json: unknown;
  judging_paused_at: string | null;
  closed_at: string | null;
  published_at: string | null;
  created_at: string;
}

interface SubmissionRow {
  id: string;
  assignment_id: string;
  organization_id: string;
  student_id: string | null;
  group_id: string | null;
  submitted_by: string | null;
  status: string;
  error: string | null;
  versions_used: number;
  locked_commit_sha: string | null;
  locked_at: string | null;
  activity_json: ActivityEntry[];
  models_used: string[];
  judge_attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
  current_version: { description: string; video_url: string | null; created_at: string; repos: { owner: string; name: string; url: string } | null } | null;
}

const SUBMISSION_COLUMNS =
  'id, assignment_id, organization_id, student_id, group_id, submitted_by, status, error, versions_used, locked_commit_sha, locked_at, ' +
  'activity_json, models_used, judge_attempts, next_attempt_at, updated_at, ' +
  'current_version:assignment_submission_versions!assignment_submissions_current_version_fk(description, video_url, created_at, repos(owner, name, url))';

async function getCourse(id: string): Promise<CourseRow> {
  const c = must(await db().from('courses').select('*').eq('id', id).maybeSingle()) as CourseRow | null;
  if (!c) throw notFound('Course not found');
  return c;
}

export async function getAssignment(id: string): Promise<AssignmentRow> {
  const a = must(await db().from('course_assignments').select('*').eq('id', id).maybeSingle()) as AssignmentRow | null;
  if (!a) throw notFound('Assignment not found');
  return a;
}

/** A role on a course roster, or null. */
async function rosterRole(courseId: string, userId: string): Promise<'instructor' | 'ta' | 'student' | null> {
  const r = must(await db().from('course_members').select('role').eq('course_id', courseId).eq('user_id', userId).maybeSingle()) as { role: 'instructor' | 'ta' | 'student' } | null;
  return r?.role ?? null;
}

/** Staff see a course; students on its roster see their part; anyone else gets a 404. */
async function courseViewer(course: { id: string; organization_id: string }, user: AuthUser): Promise<'staff' | 'student' | 'ta'> {
  if (memberOf(user, course.organization_id)) return 'staff';
  const role = await rosterRole(course.id, user.id);
  if (!role) throw notFound('Course not found');
  return role === 'student' ? 'student' : 'ta';
}

/** A database function refused: its error code becomes a readable message. */
export function rpcFailed(message: string): HttpError {
  const code = Object.keys(COURSE_ERRORS).find((k) => message.includes(k));
  if (!code) return new HttpError(500, 'internal', `Database error: ${message}`);
  const status = code === 'assignment_not_found' || code === 'group_not_found' ? 404 : code === 'not_on_roster' || code === 'not_in_group' ? 403 : 409;
  return new HttpError(status, code, COURSE_ERRORS[code]!);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await db().rpc(fn, args);
  if (res.error) throw rpcFailed(res.error.message);
  return res.data as T;
}

/** An assignment as the client sees it: what was asked, the dates, the group rules. */
export function publicAssignment(a: AssignmentRow, counts: { submissions?: number; students?: number } = {}) {
  return {
    id: a.id,
    course_id: a.course_id,
    title: a.title,
    instructions: a.instructions,
    learning_goals: a.learning_goals,
    opens_at: a.opens_at,
    due_at: a.due_at,
    status: a.status,
    mode: a.mode,
    group_min: a.group_min,
    group_max: a.group_max,
    group_lock_at: a.group_lock_at,
    groups_close_at: a.mode === 'group' ? (a.group_lock_at ?? a.due_at) : null,
    max_submissions: a.max_submissions,
    interviews_enabled: a.interviews_enabled,
    rubric_json: a.rubric_json,
    judging_paused_at: a.judging_paused_at,
    submission_count: counts.submissions ?? 0,
    student_count: counts.students ?? 0,
  };
}

/** Names of profiles, by id. */
async function names(ids: (string | null | undefined)[]): Promise<Map<string, { display_name: string; github_login: string | null }>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = must(await db().from('profiles').select('id, display_name, github_login').in('id', unique)) as { id: string; display_name: string; github_login: string | null }[];
  return new Map(rows.map((r) => [r.id, { display_name: r.display_name, github_login: r.github_login }]));
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

interface InterviewSummary {
  id: string;
  user_id: string;
  status: string;
  assignment_submission_id: string;
  interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null;
}

const reportOf = (i: InterviewSummary) => (Array.isArray(i.interview_reports) ? i.interview_reports[0] : i.interview_reports) ?? null;

/** The ownership signal of a submission: the lowest among its completed interviews (one weak member shows). */
export function lowestOwnership(interviews: InterviewSummary[]): { score: number; confidence: string } | null {
  const reports = interviews.map(reportOf).filter((r): r is { ownership_score: number; confidence: string } => !!r);
  if (!reports.length) return null;
  const low = reports.reduce((a, b) => (b.ownership_score < a.ownership_score ? b : a));
  return { score: low.ownership_score, confidence: low.confidence };
}

/** Every submission of an assignment with its scores, total and who it belongs to. */
export async function assignmentBoard(a: AssignmentRow) {
  const rubric = RubricSchema.parse(a.rubric_json) as Rubric;
  const subs = must(await db().from('assignment_submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', a.id)) as unknown as SubmissionRow[];
  const ids = subs.map((s) => s.id);
  const scores = ids.length ? (must(await db().from('assignment_scores').select('*').in('submission_id', ids)) as ScoreRow[]) : [];
  const groups = a.mode === 'group' ? await groupsOf(a.id) : [];
  const people = await names(subs.map((s) => s.student_id).concat(subs.map((s) => s.submitted_by)));
  // Voice interviews about each submission (one per student, or per group member) with their ownership scores.
  const interviews = ids.length
    ? (must(
        await db().from('interviews').select('id, user_id, status, assignment_submission_id, interview_reports(ownership_score, confidence)').in('assignment_submission_id', ids).neq('status', 'error'),
      ) as unknown as InterviewSummary[])
    : [];
  const rows = subs.map((s) => {
    const mine = scores.filter((x) => x.submission_id === s.id);
    const theirs = interviews.filter((i) => i.assignment_submission_id === s.id);
    const group = groups.find((g) => g.id === s.group_id);
    return {
      ...s,
      activity_json: undefined,
      activity: (s.activity_json ?? []).filter((x) => x.kind !== 'thought').slice(-40),
      label: group ? group.name : (people.get(s.student_id ?? '')?.display_name ?? 'Student'),
      members: group ? group.members.filter((m) => m.status === 'accepted') : null,
      submitted_by_name: people.get(s.submitted_by ?? '')?.display_name ?? '',
      scores: mine,
      total: weightedTotal(rubric, mine),
      interviews: theirs.map((i) => ({ id: i.id, user_id: i.user_id, status: i.status, ownership: reportOf(i)?.ownership_score ?? null })),
      ownership: lowestOwnership(theirs),
    };
  });
  rows.sort((x, y) => x.label.localeCompare(y.label));
  return { rubric, rows };
}

/** Groups of an assignment with their members and each member's state. */
async function groupsOf(assignmentId: string) {
  const groups = must(await db().from('assignment_groups').select('id, name, locked_at, created_by, created_at').eq('assignment_id', assignmentId).order('created_at')) as {
    id: string; name: string; locked_at: string | null; created_by: string | null; created_at: string;
  }[];
  const members = groups.length
    ? (must(await db().from('assignment_group_members').select('group_id, user_id, status, invited_by, responded_at').in('group_id', groups.map((g) => g.id))) as {
        group_id: string; user_id: string; status: 'invited' | 'accepted' | 'declined'; invited_by: string | null; responded_at: string | null;
      }[])
    : [];
  const people = await names(members.map((m) => m.user_id));
  return groups.map((g) => ({
    ...g,
    members: members
      .filter((m) => m.group_id === g.id && m.status !== 'declined')
      .map((m) => ({ user_id: m.user_id, status: m.status, display_name: people.get(m.user_id)?.display_name ?? 'Student', github_login: people.get(m.user_id)?.github_login ?? null })),
  }));
}

/** Students of the course roster. */
async function students(courseId: string) {
  const rows = must(
    await db().from('course_members').select('user_id, section, profiles!course_members_user_id_fkey(display_name, github_login)').eq('course_id', courseId).eq('role', 'student'),
  ) as unknown as { user_id: string; section: string; profiles: { display_name: string; github_login: string | null } | null }[];
  return rows.map((r) => ({ user_id: r.user_id, section: r.section, display_name: r.profiles?.display_name ?? 'Student', github_login: r.profiles?.github_login ?? null }));
}

/** The grade one student gets on one assignment: the submission total, or the staff adjustment for them. */
export function gradeFor(total: number | null, adjustment: { adjusted_total: number } | undefined): number | null {
  if (adjustment) return Number(adjustment.adjusted_total);
  return total;
}

export async function courseRoutes(app: FastifyInstance): Promise<void> {
  // ===================================================================================================================
  // Courses and roster
  // ===================================================================================================================

  /** Every assignment of the organization's active courses, newest first (the integrity review picks from them). */
  app.get('/api/orgs/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    if (!memberOf(user, id)) throw forbidden();
    const rows = must(
      await db()
        .from('course_assignments')
        .select('*, courses!inner(name, code, archived_at), assignment_submissions(count)')
        .eq('organization_id', id)
        .is('courses.archived_at', null)
        .order('due_at', { ascending: false }),
    ) as unknown as (AssignmentRow & { courses: { name: string; code: string }; assignment_submissions: { count: number }[] })[];
    return {
      assignments: rows.map(({ courses, assignment_submissions, ...a }) => ({
        ...publicAssignment(a, { submissions: assignment_submissions[0]?.count }),
        course_name: courses.name,
        course_code: courses.code,
      })),
    };
  });

  app.get('/api/orgs/:id/courses', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    if (!memberOf(user, id)) throw forbidden();
    const courses = must(
      await db()
        .from('courses')
        .select('*, course_members(count), course_assignments(count)')
        .eq('organization_id', id)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
    ) as unknown as (CourseRow & { course_members: { count: number }[]; course_assignments: { count: number }[] })[];
    return {
      courses: courses.map(({ course_members, course_assignments, ...c }) => ({
        ...c,
        member_count: course_members[0]?.count ?? 0,
        assignment_count: course_assignments[0]?.count ?? 0,
      })),
    };
  });

  app.post('/api/orgs/:id/courses', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'course.manage', id);
    const input = parse(CreateCourseSchema, req.body);
    const course = must(await db().from('courses').insert({ ...input, organization_id: id, created_by: user.id }).select('*').single()) as CourseRow;
    await audit({ organizationId: id, actorId: user.id, action: 'course.created', subjectType: 'course', subjectId: course.id, detail: { name: input.name } });
    return { course };
  });

  /** The course for staff: assignments with counts and the roster. */
  app.get('/api/courses/:id', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    const access = await courseViewer(course, user);
    if (access === 'student') throw forbidden('Open the course from My courses.');
    const rows = must(
      await db().from('course_assignments').select('*, assignment_submissions(count)').eq('course_id', course.id).order('due_at'),
    ) as unknown as (AssignmentRow & { assignment_submissions: { count: number }[] })[];
    const roster = must(
      await db()
        .from('course_members')
        .select('user_id, role, section, created_at, profiles!course_members_user_id_fkey(display_name, github_login, avatar_url)')
        .eq('course_id', course.id)
        .order('role'),
    ) as unknown as { role: string }[];
    const studentCount = roster.filter((m) => m.role === 'student').length;
    return {
      course,
      access,
      members: roster,
      assignments: rows.map((r) => publicAssignment(r, { submissions: r.assignment_submissions[0]?.count, students: studentCount })),
    };
  });

  /** Adds people by email. Emails without an account are returned, so the teacher can ask them to sign up. */
  app.post('/api/courses/:id/members', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    requirePermission(user, 'course.manage', course.organization_id);
    const input = parse(CourseMembersSchema, req.body);
    const emails = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))];
    const found = must(await db().rpc('user_ids_by_email', { emails })) as { email: string; user_id: string }[];
    if (found.length)
      must(
        await db()
          .from('course_members')
          .upsert(
            found.map((f) => ({ course_id: course.id, user_id: f.user_id, organization_id: course.organization_id, role: input.role, section: input.section })),
            { onConflict: 'course_id,user_id' },
          ),
      );
    const known = new Set(found.map((f) => f.email));
    await audit({ organizationId: course.organization_id, actorId: user.id, action: 'course.members_added', subjectType: 'course', subjectId: course.id, detail: { added: found.length, role: input.role } });
    return { added: found.length, without_account: emails.filter((e) => !known.has(e)) };
  });

  app.delete('/api/courses/:id/members/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const course = await getCourse(id);
    requirePermission(user, 'course.manage', course.organization_id);
    must(await db().from('course_members').delete().eq('course_id', course.id).eq('user_id', userId));
    return { ok: true };
  });

  app.post('/api/courses/:id/archive', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    requirePermission(user, 'course.manage', course.organization_id);
    must(await db().from('courses').update({ archived_at: new Date().toISOString() }).eq('id', course.id));
    return { ok: true };
  });

  /** Students × assignments. In a group assignment each member gets the group's total, or their own adjustment. */
  app.get('/api/courses/:id/gradebook', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    if (!memberOf(user, course.organization_id)) throw forbidden();
    const roster = await students(course.id);
    const assignments = must(await db().from('course_assignments').select('*').eq('course_id', course.id).order('due_at')) as AssignmentRow[];
    const adjustments = assignments.length
      ? (must(await db().from('assignment_grade_adjustments').select('assignment_id, user_id, adjusted_total, note').in('assignment_id', assignments.map((a) => a.id))) as {
          assignment_id: string; user_id: string; adjusted_total: number; note: string;
        }[])
      : [];
    const cells: Record<string, Record<string, { submission_id: string; status: string; total: number | null; grade: number | null; adjusted: boolean; group: string | null }>> = {};
    for (const a of assignments) {
      const board = await assignmentBoard(a);
      for (const r of board.rows) {
        const who = r.members ? r.members.map((m) => m.user_id) : [r.student_id!];
        for (const uid of who) {
          const adj = adjustments.find((x) => x.assignment_id === a.id && x.user_id === uid);
          (cells[uid] ??= {})[a.id] = { submission_id: r.id, status: r.status, total: r.total, grade: gradeFor(r.total, adj), adjusted: !!adj, group: r.members ? r.label : null };
        }
      }
    }
    return {
      course,
      assignments: assignments.map((a) => publicAssignment(a)),
      students: roster.map((s) => ({ ...s, grades: cells[s.user_id] ?? {} })),
    };
  });

  // ===================================================================================================================
  // Assignments (staff)
  // ===================================================================================================================

  app.post('/api/courses/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    requirePermission(user, 'course.manage', course.organization_id);
    if (course.archived_at) throw forbidden('This course is archived.');
    const { publish, rubric, ...input } = parse(CreateAssignmentSchema, req.body);
    const row = must(
      await db()
        .from('course_assignments')
        .insert({ ...input, rubric_json: rubric, organization_id: course.organization_id, course_id: course.id, status: publish ? 'open' : 'draft', created_by: user.id })
        .select('*')
        .single(),
    ) as AssignmentRow;
    await audit({ organizationId: course.organization_id, actorId: user.id, action: 'course.assignment_created', subjectType: 'assignment', subjectId: row.id, detail: { course: course.name, title: row.title, mode: row.mode } });
    return { assignment: publicAssignment(row) };
  });

  async function staffAssignment(id: string, user: AuthUser, write = false): Promise<AssignmentRow> {
    const a = await getAssignment(id);
    if (write) requirePermission(user, 'course.manage', a.organization_id);
    else if (!memberOf(user, a.organization_id)) throw forbidden();
    return a;
  }

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
    const row = must(
      await db()
        .from('course_assignments')
        .update({ ...input, ...(rubric ? { rubric_json: rubric } : {}), updated_at: new Date().toISOString() })
        .eq('id', a.id)
        .select('*')
        .single(),
    ) as AssignmentRow;
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'course.assignment_updated', subjectType: 'assignment', subjectId: a.id, detail: { fields: Object.keys(input) } });
    return { assignment: publicAssignment(row) };
  });

  app.post('/api/assignments/:id/open', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    const done = must(await db().from('course_assignments').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', a.id).eq('status', 'draft').select('id')) as unknown[];
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
    const sub = must(
      await db()
        .from('assignment_submissions')
        .select('*, course_assignments(id, course_id, title, rubric_json, status, mode, due_at, interviews_enabled, courses(name, code)), repo_analyses(commit_sha, model, map_json, commit_profile_json, file_count), assignment_submission_versions!assignment_submission_versions_submission_id_fkey(id, version_no, description, video_url, created_at, submitted_by, repos(owner, name, url))')
        .eq('id', id)
        .maybeSingle(),
    ) as (Record<string, unknown> & { organization_id: string; group_id: string | null; student_id: string | null; assignment_id: string }) | null;
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
    const score = must(await db().from('assignment_scores').select('id, organization_id').eq('id', id).maybeSingle()) as { id: string; organization_id: string } | null;
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
    const sub = must(await db().from('assignment_submissions').select('id, assignment_id, organization_id, status, locked_commit_sha').eq('id', id).maybeSingle()) as
      | { id: string; assignment_id: string; organization_id: string; status: string; locked_commit_sha: string | null }
      | null;
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

  // ---- groups (staff) ----

  app.post('/api/assignments/:id/groups', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    if (a.mode !== 'group') throw conflict('not_a_group_assignment', COURSE_ERRORS.not_a_group_assignment!);
    const input = parse(StaffGroupSchema, req.body);
    const group = must(await db().from('assignment_groups').insert({ assignment_id: a.id, organization_id: a.organization_id, name: input.name, created_by: user.id }).select('id').single()) as { id: string };
    for (const uid of input.member_ids) await rpc('staff_place_in_group', { p_group: group.id, p_user: uid, p_by: user.id });
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'group.created', subjectType: 'assignment_group', subjectId: group.id, detail: { members: input.member_ids.length } });
    return { group_id: group.id };
  });

  async function staffGroup(id: string, user: AuthUser) {
    const g = must(await db().from('assignment_groups').select('id, assignment_id, organization_id').eq('id', id).maybeSingle()) as { id: string; assignment_id: string; organization_id: string } | null;
    if (!g) throw notFound('Group not found');
    requirePermission(user, 'course.manage', g.organization_id);
    return g;
  }

  /** Puts a student in this group (moving them out of another one), even after groups closed. */
  app.post('/api/assignment-groups/:id/place', async (req) => {
    const user = await requireUser(req);
    const g = await staffGroup(parse(IdParams, req.params).id, user);
    const { user_id } = parse(PlaceInGroupSchema, req.body);
    await rpc('staff_place_in_group', { p_group: g.id, p_user: user_id, p_by: user.id });
    await audit({ organizationId: g.organization_id, actorId: user.id, action: 'group.member_placed', subjectType: 'assignment_group', subjectId: g.id, detail: { user_id } });
    return { ok: true };
  });

  app.delete('/api/assignment-groups/:id/members/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const g = await staffGroup(id, user);
    must(await db().from('assignment_group_members').delete().eq('group_id', g.id).eq('user_id', userId));
    await audit({ organizationId: g.organization_id, actorId: user.id, action: 'group.member_removed', subjectType: 'assignment_group', subjectId: g.id, detail: { user_id: userId } });
    return { ok: true };
  });

  // ---- individual grade adjustments (group assignments) ----

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

  // ===================================================================================================================
  // Students
  // ===================================================================================================================

  /** The student's courses, each assignment with what they should do next, and pending group invitations. */
  app.get('/api/me/courses', async (req) => {
    const user = await requireUser(req);
    const enrolled = must(
      await db()
        .from('course_members')
        .select('role, section, courses!inner(id, name, code, term, description, archived_at, organizations(name))')
        .eq('user_id', user.id)
        .is('courses.archived_at', null),
    ) as unknown as { role: 'student' | 'ta' | 'instructor'; section: string; courses: CourseRow & { organizations: { name: string } | null } }[];
    const courseIds = enrolled.map((e) => e.courses.id);
    const assignments = courseIds.length
      ? (must(await db().from('course_assignments').select('*').in('course_id', courseIds).neq('status', 'draft').order('due_at')) as AssignmentRow[])
      : [];
    const mine = await mySubmissions(user.id, assignments);
    const invites = await myInvites(user.id);
    return {
      courses: enrolled.map((e) => ({
        id: e.courses.id,
        name: e.courses.name,
        code: e.courses.code,
        term: e.courses.term,
        description: e.courses.description,
        organization: e.courses.organizations?.name ?? null,
        role: e.role,
        section: e.section,
        assignments: assignments.filter((a) => a.course_id === e.courses.id).map((a) => ({ ...publicAssignment(a), my_submission: mine.get(a.id) ?? null })),
      })),
      invites,
    };
  });

  /** One course for a student on its roster. */
  app.get('/api/me/courses/:id', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    const role = await rosterRole(course.id, user.id);
    if (!role) throw notFound('Course not found');
    const assignments = must(await db().from('course_assignments').select('*').eq('course_id', course.id).neq('status', 'draft').order('due_at')) as AssignmentRow[];
    const mine = await mySubmissions(user.id, assignments);
    return { course, role, assignments: assignments.map((a) => ({ ...publicAssignment(a), my_submission: mine.get(a.id) ?? null })) };
  });

  /** One assignment for a student: what was asked, their group, their submission and (once published) results. */
  app.get('/api/me/assignments/:id', async (req) => {
    const user = await requireUser(req);
    const a = await getAssignment(parse(IdParams, req.params).id);
    const role = await rosterRole(a.course_id, user.id);
    if (!role || a.status === 'draft') throw notFound('Assignment not found');
    const course = await getCourse(a.course_id);

    let group: Awaited<ReturnType<typeof groupsOf>>[number] | null = null;
    let invites: Awaited<ReturnType<typeof groupsOf>> = [];
    let classmates: { user_id: string; display_name: string; github_login: string | null }[] = [];
    if (a.mode === 'group') {
      const groups = await groupsOf(a.id);
      group = groups.find((g) => g.members.some((m) => m.user_id === user.id && m.status === 'accepted')) ?? null;
      invites = groups.filter((g) => g.members.some((m) => m.user_id === user.id && m.status === 'invited'));
      // Who can be invited: students on the roster without an accepted group.
      const grouped = new Set(groups.flatMap((g) => g.members.filter((m) => m.status === 'accepted').map((m) => m.user_id)));
      classmates = (await students(a.course_id)).filter((s) => !grouped.has(s.user_id) && s.user_id !== user.id).map(({ section: _s, ...s }) => s);
    }

    const subQuery = db().from('assignment_submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', a.id);
    const sub = (a.mode === 'group'
      ? group
        ? must(await subQuery.eq('group_id', group.id).maybeSingle())
        : null
      : must(await subQuery.eq('student_id', user.id).maybeSingle())) as unknown as SubmissionRow | null;
    const versions = sub
      ? must(
          await db()
            .from('assignment_submission_versions')
            .select('id, version_no, description, video_url, created_at, submitted_by, repos(owner, name, url)')
            .eq('submission_id', sub.id)
            .order('version_no', { ascending: false }),
        )
      : [];

    let results: Record<string, unknown> | null = null;
    if (sub && a.status === 'published') {
      const rubric = RubricSchema.parse(a.rubric_json) as Rubric;
      const scores = must(await db().from('assignment_scores').select('*').eq('submission_id', sub.id)) as ScoreRow[];
      const feedback = must(await db().from('assignment_feedback').select('strengths_json, improvements_json, next_steps_json').eq('submission_id', sub.id).maybeSingle());
      const adjustment = must(await db().from('assignment_grade_adjustments').select('adjusted_total, note').eq('assignment_id', a.id).eq('user_id', user.id).maybeSingle()) as { adjusted_total: number; note: string } | null;
      const total = weightedTotal(rubric, scores);
      results = { scores, feedback, total, grade: gradeFor(total, adjustment ?? undefined), adjustment, status: sub.status, note: sub.error };
    }
    const interview = sub
      ? must(await db().from('interviews').select('id, status').eq('assignment_submission_id', sub.id).eq('user_id', user.id).neq('status', 'error').maybeSingle())
      : null;
    const accepting = a.status === 'open' && Date.parse(a.due_at) > Date.now() && Date.parse(a.opens_at) <= Date.now();
    return {
      course: { id: course.id, name: course.name, code: course.code },
      role,
      assignment: publicAssignment(a),
      group,
      invites,
      classmates,
      submission: sub ? { ...sub, activity_json: undefined } : null,
      versions,
      submissions_left: submissionsLeft(a.max_submissions, sub?.versions_used ?? 0),
      accepting,
      groups_open: a.mode === 'group' && a.status === 'open' && Date.now() < Date.parse(a.group_lock_at ?? a.due_at) && !group?.locked_at,
      results,
      interview,
      interview_open: a.interviews_enabled && !!sub?.locked_commit_sha && ['review', 'published'].includes(a.status),
    };
  });

  app.post('/api/me/assignments/:id/submissions', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const input = parse(AssignmentSubmitSchema, req.body);
    const ref = parseGithubUrl(input.repo_url);
    if (!ref) throw badRequest('invalid_repo', 'Use a public GitHub repository URL.');
    // Checks with GitHub that the repository exists and is public before spending one of the allowed versions.
    const { repo } = await resolveRepo(ref.owner, ref.name);
    const rows = await rpc<{ submission_id: string; version_no: number; versions_used: number }[]>('submit_assignment_version', {
      p_assignment: id,
      p_user: user.id,
      p_repo: repo.id,
      p_description: input.description,
      p_video_url: input.video_url ?? null,
    });
    const row = rows[0]!;
    const a = await getAssignment(id);
    return { ...row, submissions_left: submissionsLeft(a.max_submissions, row.versions_used) };
  });

  app.post('/api/me/assignments/:id/groups', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { name } = parse(CreateGroupSchema, req.body);
    const groupId = await rpc<string>('create_assignment_group', { p_assignment: id, p_user: user.id, p_name: name });
    return { group_id: groupId };
  });

  app.post('/api/me/groups/:id/invites', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { user_id } = parse(GroupInviteSchema, req.body);
    await rpc('invite_to_group', { p_group: id, p_by: user.id, p_user: user_id });
    return { ok: true };
  });

  app.post('/api/me/groups/:id/respond', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    const { accept } = parse(GroupRespondSchema, req.body);
    await rpc('respond_to_group_invite', { p_group: id, p_user: user.id, p_accept: accept });
    return { ok: true };
  });

  app.post('/api/me/groups/:id/leave', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    await rpc('leave_group', { p_group: id, p_user: user.id });
    return { ok: true };
  });
}

/** The student's own submission per assignment (their group's in group assignments). */
async function mySubmissions(userId: string, assignments: AssignmentRow[]) {
  const map = new Map<string, { status: string; versions_used: number; locked_at: string | null }>();
  if (!assignments.length) return map;
  const ids = assignments.map((a) => a.id);
  const own = must(await db().from('assignment_submissions').select('assignment_id, status, versions_used, locked_at').eq('student_id', userId).in('assignment_id', ids)) as {
    assignment_id: string; status: string; versions_used: number; locked_at: string | null;
  }[];
  const memberships = must(await db().from('assignment_group_members').select('group_id').eq('user_id', userId).eq('status', 'accepted').in('assignment_id', ids)) as { group_id: string }[];
  const viaGroup = memberships.length
    ? (must(await db().from('assignment_submissions').select('assignment_id, status, versions_used, locked_at').in('group_id', memberships.map((m) => m.group_id))) as typeof own)
    : [];
  for (const s of [...own, ...viaGroup]) map.set(s.assignment_id, { status: s.status, versions_used: s.versions_used, locked_at: s.locked_at });
  return map;
}

/** Group invitations waiting for the student's answer. */
async function myInvites(userId: string) {
  const rows = must(
    await db()
      .from('assignment_group_members')
      .select('group_id, invited_by, assignment_groups(name, assignment_id, course_assignments(title, course_id, due_at, group_lock_at))')
      .eq('user_id', userId)
      .eq('status', 'invited'),
  ) as unknown as {
    group_id: string;
    invited_by: string | null;
    assignment_groups: { name: string; assignment_id: string; course_assignments: { title: string; course_id: string; due_at: string; group_lock_at: string | null } | null } | null;
  }[];
  const people = await names(rows.map((r) => r.invited_by));
  return rows
    .filter((r) => r.assignment_groups?.course_assignments)
    .map((r) => ({
      group_id: r.group_id,
      group_name: r.assignment_groups!.name,
      assignment_id: r.assignment_groups!.assignment_id,
      assignment_title: r.assignment_groups!.course_assignments!.title,
      course_id: r.assignment_groups!.course_assignments!.course_id,
      closes_at: r.assignment_groups!.course_assignments!.group_lock_at ?? r.assignment_groups!.course_assignments!.due_at,
      invited_by: people.get(r.invited_by ?? '')?.display_name ?? null,
    }));
}
