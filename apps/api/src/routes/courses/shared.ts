import { COURSE_ERRORS, RubricSchema, weightedTotal, type Rubric } from '@skillproof/shared';
import { memberOf, requirePermission, type AuthUser } from '../../lib/auth.js';
import { HttpError, forbidden, notFound } from '../../lib/errors.js';
import { db, maybeOne, mustRows } from '../../lib/supabase.js';
import {
  SUBMISSION_COLUMNS,
  type AssignmentRow,
  type CourseRow,
  type GroupView,
  type InterviewSummary,
  type ScoreRow,
  type SubmissionRow,
} from './types.js';

export async function getCourse(id: string): Promise<CourseRow> {
  const c = maybeOne<CourseRow>(await db().from('courses').select('*').eq('id', id).maybeSingle());
  if (!c) throw notFound('Course not found');
  return c;
}

export async function getAssignment(id: string): Promise<AssignmentRow> {
  const a = maybeOne<AssignmentRow>(await db().from('course_assignments').select('*').eq('id', id).maybeSingle());
  if (!a) throw notFound('Assignment not found');
  return a;
}

export async function staffAssignment(id: string, user: AuthUser, write = false): Promise<AssignmentRow> {
  const a = await getAssignment(id);
  if (write) requirePermission(user, 'course.manage', a.organization_id);
  else if (!memberOf(user, a.organization_id)) throw forbidden();
  return a;
}

/** A role on a course roster, or null. */
export async function rosterRole(courseId: string, userId: string): Promise<'instructor' | 'ta' | 'student' | null> {
  const r = maybeOne<{ role: 'instructor' | 'ta' | 'student' }>(
    await db().from('course_members').select('role').eq('course_id', courseId).eq('user_id', userId).maybeSingle(),
  );
  return r?.role ?? null;
}

/** Staff see a course; students on its roster see their part; anyone else gets a 404. */
export async function courseViewer(course: { id: string; organization_id: string }, user: AuthUser): Promise<'staff' | 'student' | 'ta'> {
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

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
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
    language: a.language,
    starter_repo_url: a.starter_repo_url,
    rubric_json: a.rubric_json,
    judging_paused_at: a.judging_paused_at,
    submission_count: counts.submissions ?? 0,
    student_count: counts.students ?? 0,
  };
}

/** Names of profiles, by id. */
export async function names(ids: (string | null | undefined)[]): Promise<Map<string, { display_name: string; github_login: string | null }>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = mustRows<{ id: string; display_name: string; github_login: string | null }>(
    await db().from('profiles').select('id, display_name, github_login').in('id', unique),
  );
  return new Map(rows.map((r) => [r.id, { display_name: r.display_name, github_login: r.github_login }]));
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
  const subs = mustRows<SubmissionRow>(await db().from('assignment_submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', a.id));
  const ids = subs.map((s) => s.id);
  const scores = ids.length ? mustRows<ScoreRow>(await db().from('assignment_scores').select('*').in('submission_id', ids)) : [];
  const groups = a.mode === 'group' ? await groupsOf(a.id) : [];
  const people = await names(subs.map((s) => s.student_id).concat(subs.map((s) => s.submitted_by)));
  // Voice interviews about each submission (one per student, or per group member) with their ownership scores.
  const interviews = ids.length
    ? mustRows<InterviewSummary>(
        await db()
          .from('interviews')
          .select('id, user_id, status, assignment_submission_id, interview_reports(ownership_score, confidence)')
          .in('assignment_submission_id', ids)
          .neq('status', 'error'),
      )
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
export async function groupsOf(assignmentId: string): Promise<GroupView[]> {
  const groups = mustRows<{ id: string; name: string; locked_at: string | null; created_by: string | null; created_at: string }>(
    await db().from('assignment_groups').select('id, name, locked_at, created_by, created_at').eq('assignment_id', assignmentId).order('created_at'),
  );
  const members = groups.length
    ? mustRows<{ group_id: string; user_id: string; status: 'invited' | 'accepted' | 'declined'; invited_by: string | null; responded_at: string | null }>(
        await db().from('assignment_group_members').select('group_id, user_id, status, invited_by, responded_at').in('group_id', groups.map((g) => g.id)),
      )
    : [];
  const people = await names(members.map((m) => m.user_id));
  return groups.map((g) => ({
    ...g,
    members: members
      .filter((m) => m.group_id === g.id && m.status !== 'declined')
      .map((m) => ({
        user_id: m.user_id,
        status: m.status,
        display_name: people.get(m.user_id)?.display_name ?? 'Student',
        github_login: people.get(m.user_id)?.github_login ?? null,
      })),
  }));
}

/** Students of the course roster. */
export async function students(courseId: string) {
  const rows = mustRows<{ user_id: string; section: string; profiles: { display_name: string; github_login: string | null } | null }>(
    await db()
      .from('course_members')
      .select('user_id, section, profiles!course_members_user_id_fkey(display_name, github_login)')
      .eq('course_id', courseId)
      .eq('role', 'student'),
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    section: r.section,
    display_name: r.profiles?.display_name ?? 'Student',
    github_login: r.profiles?.github_login ?? null,
  }));
}

/** The grade one student gets on one assignment: the submission total, or the staff adjustment for them. */
export function gradeFor(total: number | null, adjustment: { adjusted_total: number } | undefined): number | null {
  if (adjustment) return Number(adjustment.adjusted_total);
  return total;
}
