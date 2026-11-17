import { CourseMembersSchema, CreateCourseSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { memberOf, requirePermission, requireUser } from '../lib/auth.js';
import { forbidden, notFound } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must } from '../lib/supabase.js';

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

async function getCourse(id: string): Promise<CourseRow> {
  const c = must(await db().from('courses').select('*').eq('id', id).maybeSingle()) as CourseRow | null;
  if (!c) throw notFound('Course not found');
  return c;
}

/** Teacher and course mode. An assignment is an event with kind "assignment" and a course_id. */
export async function courseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/orgs/:id/courses', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    if (!memberOf(user, id)) throw forbidden();
    const courses = must(
      await db().from('courses').select('*, course_members(count), events(count)').eq('organization_id', id).is('archived_at', null).order('created_at', { ascending: false }),
    ) as unknown as (CourseRow & { course_members: { count: number }[]; events: { count: number }[] })[];
    return {
      courses: courses.map(({ course_members, events, ...c }) => ({ ...c, member_count: course_members[0]?.count ?? 0, assignment_count: events[0]?.count ?? 0 })),
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

  /** The course page: roster and assignments. Students enrolled in the course see it too, without the roster. */
  app.get('/api/courses/:id', async (req) => {
    const user = await requireUser(req);
    const course = await getCourse(parse(IdParams, req.params).id);
    const staff = memberOf(user, course.organization_id);
    if (!staff) {
      const enrolled = must(await db().from('course_members').select('role').eq('course_id', course.id).eq('user_id', user.id).maybeSingle());
      if (!enrolled) throw notFound('Course not found');
    }
    const assignments = must(
      await db().from('events').select('id, name, slug, status, starts_at, submission_deadline, interviews_enabled').eq('course_id', course.id).order('submission_deadline'),
    );
    const members = staff
      ? must(
          await db()
            .from('course_members')
            .select('user_id, role, section, created_at, profiles!course_members_user_id_fkey(display_name, github_login, avatar_url)')
            .eq('course_id', course.id)
            .order('role'),
        )
      : [];
    return { course, assignments, members };
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
}
