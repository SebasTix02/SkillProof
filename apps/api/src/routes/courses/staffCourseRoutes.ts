import { CourseMembersSchema, CreateCourseSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { memberOf, requirePermission, requireUser } from '../../lib/auth.js';
import { forbidden } from '../../lib/errors.js';
import { IdParams, parse } from '../../lib/http.js';
import { db, must, mustOne, mustRows } from '../../lib/supabase.js';
import { assignmentBoard, courseViewer, getCourse, gradeFor, publicAssignment, students } from './shared.js';
import type { AssignmentRow, CourseRow } from './types.js';

export async function staffCourseRoutes(app: FastifyInstance): Promise<void> {
  /** Every assignment of the organization's active courses, newest first (the integrity review picks from them). */
  app.get('/api/orgs/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    if (!memberOf(user, id)) throw forbidden();
    const rows = mustRows<AssignmentRow & { courses: { name: string; code: string }; assignment_submissions: { count: number }[] }>(
      await db()
        .from('course_assignments')
        .select('*, courses!inner(name, code, archived_at), assignment_submissions(count)')
        .eq('organization_id', id)
        .is('courses.archived_at', null)
        .order('due_at', { ascending: false }),
    );
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
    const courses = mustRows<CourseRow & { course_members: { count: number }[]; course_assignments: { count: number }[] }>(
      await db()
        .from('courses')
        .select('*, course_members(count), course_assignments(count)')
        .eq('organization_id', id)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
    );
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
    const course = mustOne<CourseRow>(await db().from('courses').insert({ ...input, organization_id: id, created_by: user.id }).select('*').single());
    await audit({ organizationId: id, actorId: user.id, action: 'course.created', subjectType: 'course', subjectId: course.id, detail: { name: input.name } });
    return { course };
  });

  /** The course for staff: assignments with counts and the roster. */
  app.get('/api/courses/:id', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    const access = await courseViewer(course, user);
    if (access === 'student') throw forbidden('Open the course from My courses.');
    const rows = mustRows<AssignmentRow & { assignment_submissions: { count: number }[] }>(
      await db().from('course_assignments').select('*, assignment_submissions(count)').eq('course_id', course.id).order('due_at'),
    );
    const roster = mustRows<{ role: string }>(
      await db()
        .from('course_members')
        .select('user_id, role, section, created_at, profiles!course_members_user_id_fkey(display_name, github_login, avatar_url)')
        .eq('course_id', course.id)
        .order('role'),
    );
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
    const found = mustRows<{ email: string; user_id: string }>(await db().rpc('user_ids_by_email', { emails }));
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
    await audit({
      organizationId: course.organization_id,
      actorId: user.id,
      action: 'course.members_added',
      subjectType: 'course',
      subjectId: course.id,
      detail: { added: found.length, role: input.role },
    });
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
    const assignments = mustRows<AssignmentRow>(await db().from('course_assignments').select('*').eq('course_id', course.id).order('due_at'));
    const adjustments = assignments.length
      ? mustRows<{ assignment_id: string; user_id: string; adjusted_total: number; note: string }>(
          await db().from('assignment_grade_adjustments').select('assignment_id, user_id, adjusted_total, note').in('assignment_id', assignments.map((a) => a.id)),
        )
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
}
