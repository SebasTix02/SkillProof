import { createHash, randomBytes } from 'node:crypto';
import { AcceptInvitationSchema, ChangeMemberRoleSchema, InviteMemberSchema, OrgSettingsSchema, type OrgRole } from '@skillproof/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { requirePermission, requireUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { IdParams, parse } from '../lib/http.js';
import { db, must, mustRows } from '../lib/supabase.js';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const MemberParams = z.object({ id: z.uuid(), userId: z.uuid() });
const InviteParams = z.object({ id: z.uuid(), inviteId: z.uuid() });

interface MemberRow {
  user_id: string;
  granted_at: string;
  roles: { key: string } | null;
  profiles: { display_name: string; avatar_url: string | null; github_login: string | null } | null;
}

async function roleId(key: OrgRole): Promise<string> {
  return (must(await db().from('roles').select('id').eq('key', key).single()) as { id: string }).id;
}

/** Members of an organization: one row per person, with all of their roles in it. */
async function listMembers(orgId: string) {
  const rows = mustRows<MemberRow>(
    await db()
      .from('user_roles')
      .select('user_id, granted_at, roles(key), profiles!user_roles_user_id_fkey(display_name, avatar_url, github_login)')
      .eq('organization_id', orgId),
  );
  const byUser = new Map<string, { user_id: string; display_name: string; avatar_url: string | null; github_login: string | null; roles: string[]; joined_at: string; email: string | null }>();
  for (const r of rows) {
    const m = byUser.get(r.user_id) ?? {
      user_id: r.user_id,
      display_name: r.profiles?.display_name ?? '',
      avatar_url: r.profiles?.avatar_url ?? null,
      github_login: r.profiles?.github_login ?? null,
      roles: [],
      joined_at: r.granted_at,
      email: null,
    };
    if (r.roles) m.roles.push(r.roles.key);
    if (r.granted_at < m.joined_at) m.joined_at = r.granted_at;
    byUser.set(r.user_id, m);
  }
  // Emails live in Supabase Auth, not in the public schema.
  await Promise.all(
    [...byUser.values()].map(async (m) => {
      const { data } = await db().auth.admin.getUserById(m.user_id);
      m.email = data.user?.email ?? null;
    }),
  );
  return [...byUser.values()].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  // ---- members ----

  app.get('/api/orgs/:id/members', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const org = must(await db().from('organizations').select('id, name, slug, plan, seat_limit, settings_json').eq('id', id).single());
    return { organization: org, members: await listMembers(id) };
  });

  app.patch('/api/orgs/:id/members/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(MemberParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const { role } = parse(ChangeMemberRoleSchema, req.body);
    const members = await listMembers(id);
    const target = members.find((m) => m.user_id === userId);
    if (!target) throw notFound('Member not found');
    const owners = members.filter((m) => m.roles.includes('org_owner'));
    if (target.roles.includes('org_owner') && role !== 'org_owner' && owners.length === 1)
      throw conflict('last_owner', 'An organization needs at least one owner.');
    // One organization role per person: replace whatever they had.
    must(await db().from('user_roles').delete().eq('user_id', userId).eq('organization_id', id));
    must(await db().from('user_roles').insert({ user_id: userId, role_id: await roleId(role), organization_id: id, granted_by: user.id }));
    await audit({ organizationId: id, actorId: user.id, action: 'member.role_changed', subjectType: 'profile', subjectId: userId, detail: { from: target.roles, to: role } });
    return { ok: true };
  });

  app.delete('/api/orgs/:id/members/:userId', async (req) => {
    const user = await requireUser(req);
    const { id, userId } = parse(MemberParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const members = await listMembers(id);
    const target = members.find((m) => m.user_id === userId);
    if (!target) throw notFound('Member not found');
    if (target.roles.includes('org_owner') && members.filter((m) => m.roles.includes('org_owner')).length === 1)
      throw conflict('last_owner', 'An organization needs at least one owner.');
    must(await db().from('user_roles').delete().eq('user_id', userId).eq('organization_id', id));
    must(await db().from('judge_assignments').delete().eq('judge_id', userId).eq('organization_id', id));
    await audit({ organizationId: id, actorId: user.id, action: 'member.removed', subjectType: 'profile', subjectId: userId, detail: { roles: target.roles } });
    return { ok: true };
  });

  // ---- invitations ----

  app.get('/api/orgs/:id/invitations', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const invitations = must(
      await db()
        .from('org_invitations')
        .select('id, email, role_key, invited_by, created_at, expires_at, profiles!org_invitations_invited_by_fkey(display_name)')
        .eq('organization_id', id)
        .is('accepted_at', null)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    );
    return { invitations };
  });

  /**
   * Creates an invitation and returns its link once. Sending the email is not built yet: the organizer copies the
   * link. Only the sha256 of the token is stored.
   */
  app.post('/api/orgs/:id/invitations', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const input = parse(InviteMemberSchema, req.body);
    const org = must(await db().from('organizations').select('seat_limit').eq('id', id).single()) as { seat_limit: number };
    const [members, open] = await Promise.all([
      listMembers(id),
      db().from('org_invitations').select('id', { count: 'exact', head: true }).eq('organization_id', id).is('accepted_at', null).is('revoked_at', null),
    ]);
    if (members.length + (open.count ?? 0) >= org.seat_limit) throw conflict('seats_full', `Your plan allows ${org.seat_limit} members.`);
    if (members.some((m) => m.email?.toLowerCase() === input.email)) throw conflict('already_member', 'That person is already a member.');
    const token = randomBytes(24).toString('base64url');
    const inserted = await db()
      .from('org_invitations')
      .insert({ organization_id: id, email: input.email, role_key: input.role, token_hash: hashToken(token), invited_by: user.id })
      .select('id, email, role_key, created_at, expires_at')
      .single();
    if (inserted.error) throw conflict('already_invited', 'There is already an open invitation for that email.');
    await audit({ organizationId: id, actorId: user.id, action: 'member.invited', subjectType: 'invitation', subjectId: inserted.data.id, detail: { email: input.email, role: input.role } });
    return { invitation: inserted.data, token };
  });

  app.delete('/api/orgs/:id/invitations/:inviteId', async (req) => {
    const user = await requireUser(req);
    const { id, inviteId } = parse(InviteParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    must(await db().from('org_invitations').update({ revoked_at: new Date().toISOString() }).eq('id', inviteId).eq('organization_id', id));
    await audit({ organizationId: id, actorId: user.id, action: 'invitation.revoked', subjectType: 'invitation', subjectId: inviteId });
    return { ok: true };
  });

  /** The invited person, signed in with the confirmed email the invitation was sent to, accepts it. */
  app.post('/api/invitations/accept', async (req) => {
    const user = await requireUser(req);
    const { token } = parse(AcceptInvitationSchema, req.body);
    const inv = must(
      await db().from('org_invitations').select('id, organization_id, email, role_key, expires_at, accepted_at, revoked_at').eq('token_hash', hashToken(token)).maybeSingle(),
    ) as { id: string; organization_id: string; email: string; role_key: OrgRole; expires_at: string; accepted_at: string | null; revoked_at: string | null } | null;
    if (!inv || inv.revoked_at || inv.accepted_at || Date.parse(inv.expires_at) < Date.now()) throw badRequest('invitation_invalid', 'This invitation is no longer valid.');
    if (!user.emailConfirmed || user.email !== inv.email) throw forbidden('Sign in with the email address the invitation was sent to.');
    must(await db().from('user_roles').delete().eq('user_id', user.id).eq('organization_id', inv.organization_id));
    must(await db().from('user_roles').insert({ user_id: user.id, role_id: await roleId(inv.role_key), organization_id: inv.organization_id, granted_by: null }));
    must(await db().from('org_invitations').update({ accepted_at: new Date().toISOString(), accepted_by: user.id }).eq('id', inv.id));
    await audit({ organizationId: inv.organization_id, actorId: user.id, action: 'member.joined', subjectType: 'invitation', subjectId: inv.id, detail: { role: inv.role_key } });
    return { organization_id: inv.organization_id, role: inv.role_key };
  });

  // ---- settings, usage and audit ----

  app.patch('/api/orgs/:id/settings', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'org.manage_members', id);
    const input = parse(OrgSettingsSchema, req.body);
    const current = must(await db().from('organizations').select('settings_json').eq('id', id).single()) as { settings_json: Record<string, unknown> };
    const update: Record<string, unknown> = {};
    if (input.name) update.name = input.name;
    if (input.settings) update.settings_json = { ...current.settings_json, ...input.settings };
    if (Object.keys(update).length) must(await db().from('organizations').update(update).eq('id', id));
    await audit({ organizationId: id, actorId: user.id, action: 'org.settings_changed', subjectType: 'organization', subjectId: id, detail: input });
    return { ok: true };
  });

  /** AI usage of the last 30 days, by kind and model, plus seats in use. */
  app.get('/api/orgs/:id/usage', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'org.view_usage', id);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = must(
      await db().from('usage_log').select('kind, model, input_tokens, output_tokens, cost_usd, created_at').eq('organization_id', id).gte('created_at', since).limit(10_000),
    ) as { kind: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number }[];
    const groups = new Map<string, { kind: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>();
    for (const r of rows) {
      const k = `${r.kind}|${r.model}`;
      const g = groups.get(k) ?? { kind: r.kind, model: r.model, calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
      g.calls++;
      g.input_tokens += r.input_tokens;
      g.output_tokens += r.output_tokens;
      g.cost_usd += Number(r.cost_usd);
      groups.set(k, g);
    }
    const org = must(await db().from('organizations').select('plan, seat_limit').eq('id', id).single()) as { plan: string; seat_limit: number };
    const { count: seats } = await db().from('user_roles').select('user_id', { count: 'exact', head: true }).eq('organization_id', id);
    return { since, plan: org.plan, seat_limit: org.seat_limit, seats_used: seats ?? 0, usage: [...groups.values()] };
  });

  app.get('/api/orgs/:id/audit', async (req) => {
    const user = await requireUser(req);
    const { id } = parse(IdParams, req.params);
    requirePermission(user, 'audit.read', id);
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(1000).default(200) }), req.query);
    const entries = must(
      await db()
        .from('audit_log')
        .select('id, action, subject_type, subject_id, detail_json, created_at, actor_id, profiles!audit_log_actor_id_fkey(display_name)')
        .eq('organization_id', id)
        .order('created_at', { ascending: false })
        .limit(limit),
    );
    return { entries };
  });
}
