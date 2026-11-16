/** Mirrors public.has_permission() in the database, for checks made by the API. */
export interface RoleGrant {
  organization_id: string | null;
  role_key: string;
  scope: 'global' | 'organization';
  permissions: string[];
}

export function can(grants: RoleGrant[], perm: string, orgId: string | null = null): boolean {
  return grants.some((g) => {
    if (g.role_key === 'platform_admin' && g.organization_id === null) return true;
    if (!g.permissions.includes(perm)) return false;
    if (g.scope === 'global') return g.organization_id === null;
    return orgId !== null && g.organization_id === orgId;
  });
}

export function isOrgMember(grants: RoleGrant[], orgId: string): boolean {
  return grants.some((g) => g.organization_id === orgId);
}
