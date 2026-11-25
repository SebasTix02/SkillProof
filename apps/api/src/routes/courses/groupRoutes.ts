import { COURSE_ERRORS, CreateGroupSchema, GroupInviteSchema, GroupRespondSchema, PlaceInGroupSchema, StaffGroupSchema } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { requirePermission, requireUser, type AuthUser } from '../../lib/auth.js';
import { conflict, notFound } from '../../lib/errors.js';
import { IdParams, parse } from '../../lib/http.js';
import { db, maybeOne, must, mustOne } from '../../lib/supabase.js';
import { rpc, staffAssignment } from './shared.js';

async function staffGroup(id: string, user: AuthUser) {
  const g = maybeOne<{ id: string; assignment_id: string; organization_id: string }>(
    await db().from('assignment_groups').select('id, assignment_id, organization_id').eq('id', id).maybeSingle(),
  );
  if (!g) throw notFound('Group not found');
  requirePermission(user, 'course.manage', g.organization_id);
  return g;
}

export async function groupRoutes(app: FastifyInstance): Promise<void> {
  // ---- groups (staff) ----

  app.post('/api/assignments/:id/groups', async (req) => {
    const user = await requireUser(req);
    const a = await staffAssignment(parse(IdParams, req.params).id, user, true);
    if (a.mode !== 'group') throw conflict('not_a_group_assignment', COURSE_ERRORS.not_a_group_assignment!);
    const input = parse(StaffGroupSchema, req.body);
    const group = mustOne<{ id: string }>(
      await db().from('assignment_groups').insert({ assignment_id: a.id, organization_id: a.organization_id, name: input.name, created_by: user.id }).select('id').single(),
    );
    for (const uid of input.member_ids) await rpc('staff_place_in_group', { p_group: group.id, p_user: uid, p_by: user.id });
    await audit({ organizationId: a.organization_id, actorId: user.id, action: 'group.created', subjectType: 'assignment_group', subjectId: group.id, detail: { members: input.member_ids.length } });
    return { group_id: group.id };
  });

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

  // ---- groups (students) ----

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
