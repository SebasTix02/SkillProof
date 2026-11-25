import type { FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from './errors.js';
import { can, isOrgMember, type RoleGrant } from './permissions.js';
import { db, mustRows } from './supabase.js';

export interface AuthUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  grants: RoleGrant[];
}

interface RoleRow {
  organization_id: string | null;
  roles: {
    key: string;
    scope: 'global' | 'organization';
    role_permissions: { permissions: { key: string } | null }[];
  } | null;
}

export async function loadGrants(userId: string): Promise<RoleGrant[]> {
  const rows = mustRows<RoleRow>(
    await db()
      .from('user_roles')
      .select('organization_id, roles(key, scope, role_permissions(permissions(key)))')
      .eq('user_id', userId),
  );
  return rows
    .filter((r) => r.roles)
    .map((r) => ({
      organization_id: r.organization_id,
      role_key: r.roles!.key,
      scope: r.roles!.scope,
      permissions: r.roles!.role_permissions.flatMap((rp) => (rp.permissions ? [rp.permissions.key] : [])),
    }));
}

/** Verifies the Supabase access token and loads the user's roles. */
export async function requireUser(req: FastifyRequest): Promise<AuthUser> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const { data, error } = await db().auth.getUser(header.slice(7));
  if (error || !data.user) throw unauthorized();
  return {
    id: data.user.id,
    email: data.user.email?.toLowerCase() ?? null,
    emailConfirmed: !!data.user.email_confirmed_at,
    grants: await loadGrants(data.user.id),
  };
}

export function requirePermission(user: AuthUser, perm: string, orgId: string | null = null): void {
  if (!can(user.grants, perm, orgId)) throw forbidden();
}

export function memberOf(user: AuthUser, orgId: string): boolean {
  return isOrgMember(user.grants, orgId) || can(user.grants, 'event.manage', orgId);
}
