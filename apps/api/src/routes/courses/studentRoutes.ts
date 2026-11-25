import { AssignmentSubmitSchema, RubricSchema, parseGithubUrl, submissionsLeft, weightedTotal, type Rubric } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { resolveRepo } from '../../engine/analyze.js';
import { requireUser } from '../../lib/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { IdParams, parse } from '../../lib/http.js';
import { db, maybeOne, must, mustRows } from '../../lib/supabase.js';
import { getAssignment, getCourse, gradeFor, groupsOf, names, publicAssignment, rosterRole, rpc, students } from './shared.js';
import { SUBMISSION_COLUMNS, type AssignmentRow, type CourseRow, type GroupView, type ScoreRow, type SubmissionRow } from './types.js';

interface InviteRow {
  group_id: string;
  invited_by: string | null;
  created_at: string;
  assignment_groups: {
    name: string;
    assignment_id: string;
    locked_at: string | null;
    course_assignments: {
      title: string;
      course_id: string;
      status: string;
      due_at: string;
      group_lock_at: string | null;
      courses: { name: string; archived_at: string | null } | null;
    } | null;
  } | null;
}

/** The student's own submission per assignment (their group's in group assignments). */
async function mySubmissions(userId: string, assignments: AssignmentRow[]) {
  const map = new Map<string, { status: string; versions_used: number; locked_at: string | null }>();
  if (!assignments.length) return map;
  const ids = assignments.map((a) => a.id);
  const own = mustRows<{ assignment_id: string; status: string; versions_used: number; locked_at: string | null }>(
    await db().from('assignment_submissions').select('assignment_id, status, versions_used, locked_at').eq('student_id', userId).in('assignment_id', ids),
  );
  const memberships = mustRows<{ group_id: string }>(
    await db().from('assignment_group_members').select('group_id').eq('user_id', userId).eq('status', 'accepted').in('assignment_id', ids),
  );
  const viaGroup = memberships.length
    ? mustRows<{ assignment_id: string; status: string; versions_used: number; locked_at: string | null }>(
        await db().from('assignment_submissions').select('assignment_id, status, versions_used, locked_at').in('group_id', memberships.map((m) => m.group_id)),
      )
    : [];
  for (const s of [...own, ...viaGroup]) map.set(s.assignment_id, { status: s.status, versions_used: s.versions_used, locked_at: s.locked_at });
  return map;
}

/**
 * Group invitations waiting for the student's answer, newest first. `open`: it can still be answered, by the same
 * rule as the database (groups_closed): the group has not submitted yet, the assignment is open and groups have not
 * closed. Invitations from archived courses are left out.
 */
async function myInvites(userId: string) {
  const rows = mustRows<InviteRow>(
    await db()
      .from('assignment_group_members')
      .select(
        'group_id, invited_by, created_at, assignment_groups(name, assignment_id, locked_at, course_assignments(title, course_id, status, due_at, group_lock_at, courses(name, archived_at)))',
      )
      .eq('user_id', userId)
      .eq('status', 'invited')
      .order('created_at', { ascending: false }),
  );
  const people = await names(rows.map((r) => r.invited_by));
  const now = Date.now();
  return rows
    .filter((r) => r.assignment_groups?.course_assignments && !r.assignment_groups.course_assignments.courses?.archived_at)
    .map((r) => {
      const g = r.assignment_groups!;
      const a = g.course_assignments!;
      const closesAt = a.group_lock_at ?? a.due_at;
      return {
        group_id: r.group_id,
        group_name: g.name,
        assignment_id: g.assignment_id,
        assignment_title: a.title,
        course_id: a.course_id,
        course_name: a.courses?.name ?? null,
        closes_at: closesAt,
        invited_at: r.created_at,
        invited_by: people.get(r.invited_by ?? '')?.display_name ?? null,
        open: !g.locked_at && a.status === 'open' && Date.parse(closesAt) > now,
      };
    });
}

export async function studentRoutes(app: FastifyInstance): Promise<void> {
  /** The student's courses, each assignment with what they should do next, and pending group invitations. */
  app.get('/api/me/courses', async (req) => {
    const user = await requireUser(req);
    const enrolled = mustRows<{ role: 'student' | 'ta' | 'instructor'; section: string; courses: CourseRow & { organizations: { name: string } | null } }>(
      await db()
        .from('course_members')
        .select('role, section, courses!inner(id, name, code, term, description, archived_at, organizations(name))')
        .eq('user_id', user.id)
        .is('courses.archived_at', null),
    );
    const courseIds = enrolled.map((e) => e.courses.id);
    const assignments = courseIds.length
      ? mustRows<AssignmentRow>(await db().from('course_assignments').select('*').in('course_id', courseIds).neq('status', 'draft').order('due_at'))
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
    const assignments = mustRows<AssignmentRow>(await db().from('course_assignments').select('*').eq('course_id', course.id).neq('status', 'draft').order('due_at'));
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

    let group: GroupView | null = null;
    let invites: GroupView[] = [];
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
    const sub =
      a.mode === 'group'
        ? group
          ? maybeOne<SubmissionRow>(await subQuery.eq('group_id', group.id).maybeSingle())
          : null
        : maybeOne<SubmissionRow>(await subQuery.eq('student_id', user.id).maybeSingle());
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
      const scores = mustRows<ScoreRow>(await db().from('assignment_scores').select('*').eq('submission_id', sub.id));
      const feedback = must(await db().from('assignment_feedback').select('strengths_json, improvements_json, next_steps_json').eq('submission_id', sub.id).maybeSingle());
      const adjustment = maybeOne<{ adjusted_total: number; note: string }>(
        await db().from('assignment_grade_adjustments').select('adjusted_total, note').eq('assignment_id', a.id).eq('user_id', user.id).maybeSingle(),
      );
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

  /**
   * The signed-in person's notifications (the bell in the side menu). Only what needs an answer and still can get
   * one: today, group invitations that are still open. One kind per item, so new kinds can be added later.
   */
  app.get('/api/me/notifications', async (req) => {
    const user = await requireUser(req);
    const invites = (await myInvites(user.id)).filter((i) => i.open);
    return {
      notifications: invites.map(({ open: _open, ...i }) => ({ kind: 'group_invite' as const, id: `group_invite:${i.group_id}`, ...i })),
    };
  });
}
