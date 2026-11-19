import { CourseMembersSchema, CreateAssignmentSchema, CreateCourseSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { memberOf, requirePermission, requireUser } from '../lib/auth.js';
import { forbidden, notFound } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { uniqueSlug } from '../lib/slug.js';
import { db, must } from '../lib/supabase.js';
import { getEvent, leaderboard } from './events.js';

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

interface AssignmentRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  starts_at: string;
  submission_deadline: string;
  interviews_enabled: boolean;
  max_submissions: number | null;
}

const ASSIGNMENT_COLUMNS = 'id, name, slug, description, status, starts_at, submission_deadline, interviews_enabled, max_submissions';

async function getCourse(id: string): Promise<CourseRow> {
  const c = must(await db().from('courses').select('*').eq('id', id).maybeSingle()) as CourseRow | null;
  if (!c) throw notFound('Course not found');
  return c;
}

/** An assignment in its own words. The judging engine stores it in events (see migration 20261119000001). */
export function asAssignment(e: AssignmentRow, counts: { submissions?: number; students?: number } = {}) {
  return {
    id: e.id,
    title: e.name,
    slug: e.slug,
    instructions: e.description,
    status: e.status,
    opens_at: e.starts_at,
    due_at: e.submission_deadline,
    interviews_enabled: e.interviews_enabled,
    max_submissions: e.max_submissions,
    submission_count: counts.submissions ?? 0,
    student_count: counts.students ?? 0,
  };
}

/** Who is looking at a course: staff of its organization, or someone on its roster. Anyone else gets a 404. */
async function courseAccess(course: CourseRow, userId: string, staff: boolean): Promise<'staff' | 'student' | 'ta'> {
  if (staff) return 'staff';
  const enrolled = must(
    await db().from('course_members').select('role').eq('course_id', course.id).eq('user_id', userId).maybeSingle(),
  ) as { role: string } | null;
  if (!enrolled) throw notFound('Course not found');
  return enrolled.role === 'student' ? 'student' : 'ta';
}

/**
 * Courses: roster, assignments and gradebook. A course assignment belongs to its course and is open only to the
 * students on the roster (the database keeps its participants in sync with the roster). It is never created or listed
 * as an event: no visibility, access code, allowlist or join.
 */
export async function courseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/orgs/:id/courses', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    if (!memberOf(user, id)) throw forbidden();
    const courses = must(
      await db()
        .from('courses')
        .select('*, course_members(count), events(count)')
        .eq('organization_id', id)
        .is('archived_at', null)
        .order('created_at', { ascending: false }),
    ) as unknown as (CourseRow & { course_members: { count: number }[]; events: { count: number }[] })[];
    return {
      courses: courses.map(({ course_members, events, ...c }) => ({
        ...c,
        member_count: course_members[0]?.count ?? 0,
        assignment_count: events[0]?.count ?? 0,
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

  /** The course: its assignments, and for staff the roster. Students see published assignments only. */
  app.get('/api/courses/:id', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    const staff = memberOf(user, course.organization_id);
    const access = await courseAccess(course, user.id, staff);
    let query = db().from('events').select(`${ASSIGNMENT_COLUMNS}, submissions(count), event_participants(count)`).eq('course_id', course.id);
    if (access === 'student') query = query.neq('status', 'draft');
    const rows = must(await query.order('submission_deadline')) as unknown as (AssignmentRow & {
      submissions: { count: number }[];
      event_participants: { count: number }[];
    })[];
    const assignments = rows.map((r) => asAssignment(r, { submissions: r.submissions[0]?.count, students: r.event_participants[0]?.count }));
    const members = staff
      ? must(
          await db()
            .from('course_members')
            .select('user_id, role, section, created_at, profiles!course_members_user_id_fkey(display_name, github_login, avatar_url)')
            .eq('course_id', course.id)
            .order('role'),
        )
      : [];
    return { course, assignments, members, access };
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

  /** A new assignment for the course roster. Its access is the roster; there is nothing to configure about who joins. */
  app.post('/api/courses/:id/assignments', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    requirePermission(user, 'course.manage', course.organization_id);
    if (course.archived_at) throw forbidden('This course is archived.');
    const input = parse(CreateAssignmentSchema, req.body);
    const row = must(
      await db()
        .from('events')
        .insert({
          organization_id: course.organization_id,
          kind: 'assignment',
          course_id: course.id,
          visibility: 'course',
          name: input.title,
          slug: uniqueSlug(input.title),
          description: input.instructions,
          starts_at: input.opens_at,
          submission_deadline: input.due_at,
          interviews_enabled: input.interviews_enabled,
          max_submissions: input.max_submissions,
          rubric_json: input.rubric,
          status: input.publish ? 'open' : 'draft',
          created_by: user.id,
        })
        .select(ASSIGNMENT_COLUMNS)
        .single(),
    ) as AssignmentRow;
    await audit({
      organizationId: course.organization_id,
      actorId: user.id,
      action: 'course.assignment_created',
      subjectType: 'event',
      subjectId: row.id,
      detail: { course: course.name, title: input.title },
    });
    return { assignment: asAssignment(row) };
  });

  /** Students × assignments: total score and state of each student's submission. */
  app.get('/api/courses/:id/gradebook', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    if (!memberOf(user, course.organization_id)) throw forbidden();
    const students = must(
      await db()
        .from('course_members')
        .select('user_id, section, profiles!course_members_user_id_fkey(display_name, github_login)')
        .eq('course_id', course.id)
        .eq('role', 'student')
        .order('section'),
    ) as unknown as { user_id: string; section: string; profiles: { display_name: string; github_login: string | null } | null }[];
    const rows = must(await db().from('events').select(ASSIGNMENT_COLUMNS).eq('course_id', course.id).order('submission_deadline')) as AssignmentRow[];
    const cells: Record<string, Record<string, { submission_id: string; status: string; total: number | null }>> = {};
    for (const a of rows) {
      const board = await leaderboard(await getEvent(a.id));
      for (const r of board.rows) (cells[r.submitted_by] ??= {})[a.id] = { submission_id: r.id, status: r.status, total: r.total };
    }
    return {
      course,
      assignments: rows.map((r) => asAssignment(r)),
      students: students.map((s) => ({
        user_id: s.user_id,
        display_name: s.profiles?.display_name ?? 'Student',
        github_login: s.profiles?.github_login ?? null,
        section: s.section,
        grades: cells[s.user_id] ?? {},
      })),
    };
  });

  /** For students: the courses they are enrolled in, each assignment, and the state of their own submission. */
  app.get('/api/me/courses', async (req) => {
    const user = await requireUser(req);
    const enrolled = must(
      await db()
        .from('course_members')
        .select('role, section, courses!inner(id, name, code, term, archived_at, organizations(name))')
        .eq('user_id', user.id)
        .is('courses.archived_at', null),
    ) as unknown as { role: string; section: string; courses: CourseRow & { organizations: { name: string } | null } }[];
    const courseIds = enrolled.map((e) => e.courses.id);
    const events = courseIds.length
      ? (must(
          await db().from('events').select(`${ASSIGNMENT_COLUMNS}, course_id`).in('course_id', courseIds).neq('status', 'draft').order('submission_deadline'),
        ) as (AssignmentRow & { course_id: string })[])
      : [];
    const mine = events.length
      ? (must(
          await db().from('submissions').select('event_id, status, versions_used').eq('submitted_by', user.id).in('event_id', events.map((e) => e.id)),
        ) as { event_id: string; status: string; versions_used: number }[])
      : [];
    return {
      courses: enrolled.map((e) => ({
        id: e.courses.id,
        name: e.courses.name,
        code: e.courses.code,
        term: e.courses.term,
        organization: e.courses.organizations?.name ?? null,
        role: e.role,
        section: e.section,
        assignments: events
          .filter((a) => a.course_id === e.courses.id)
          .map((a) => {
            const sub = mine.find((m) => m.event_id === a.id);
            return { ...asAssignment(a), my_submission: sub ? { status: sub.status, versions_used: sub.versions_used } : null };
          }),
      })),
    };
  });
}
