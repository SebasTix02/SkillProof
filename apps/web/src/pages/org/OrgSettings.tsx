import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  CommandConsoleHeader,
  CopyLinkButton,
  DarkBanner,
  Input,
  LiveDot,
  NumberedSectionCard,
  ORG_ROLE_SPECS,
  Notice,
  PageState,
  RoleBadge,
  RoleCapabilityGrid,
  Select,
  SkeletonTable,
  SkeletonText,
  ToggleSwitch,
  TopAccentKpiCard,
  formatDate,
  linkButtonSecondary,
  normalizeOrgRole,
  type OrgRoleKey,
  useConfirm,
  permissionLabels,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/nav';
import { isDirty, useUnsavedChanges } from '../../lib/dirty';
import { useLoad } from '../../lib/useLoad';

/** Role keys as the API names them. The screen shows "owner" for org_owner. */
type ApiRole = 'org_owner' | 'organizer' | 'judge' | 'auditor';
const toApiRole = (r: OrgRoleKey): ApiRole => (r === 'owner' ? 'org_owner' : r);
const ROLE_OPTIONS: OrgRoleKey[] = ['judge', 'organizer', 'auditor', 'owner'];

interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  github_login: string | null;
  email: string | null;
  roles: string[];
  joined_at: string;
}

interface OrgSettingsJson {
  require_oral_defense?: boolean;
  allow_judge_overrides?: boolean;
  retention_days?: number;
}

interface MembersResponse {
  organization: { id: string; name: string; slug: string; plan: string; seat_limit: number; settings_json: OrgSettingsJson };
  members: Member[];
}

interface Invitation {
  id: string;
  email: string;
  role_key: ApiRole;
  created_at: string;
  expires_at: string;
  profiles?: { display_name: string } | null;
}

interface UsageResponse {
  since: string;
  plan: string;
  seat_limit: number;
  seats_used: number;
  usage: { kind: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }[];
}

interface AuditEntry {
  id: number;
  action: string;
  subject_type: string;
  subject_id: string | null;
  detail_json: Record<string, unknown>;
  created_at: string;
  profiles?: { display_name: string } | null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SP';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function expiresIn(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** The role shown for a member: their highest organization role. */
function primaryRole(roles: string[]): OrgRoleKey {
  for (const r of ['org_owner', 'organizer', 'auditor', 'judge']) if (roles.includes(r)) return normalizeOrgRole(r);
  return normalizeOrgRole(roles[0]);
}

export function OrgSettings() {
  const { org, me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const perms = org?.permissions ?? [];
  const canManage = perms.includes('org.manage_members');
  const canSeeUsage = perms.includes('org.view_usage');
  const canAudit = perms.includes('audit.read');

  const members = useLoad<MembersResponse>(org && canManage ? `/api/orgs/${org.id}/members` : null);
  const invites = useLoad<{ invitations: Invitation[] }>(org && canManage ? `/api/orgs/${org.id}/invitations` : null);
  const usage = useLoad<UsageResponse>(org && canSeeUsage ? `/api/orgs/${org.id}/usage` : null);
  const [auditLimit, setAuditLimit] = useState(50);
  const audit = useLoad<{ entries: AuditEntry[] }>(org && canAudit ? `/api/orgs/${org.id}/audit?limit=${auditLimit}` : null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRoleKey>('judge');
  const [memberSearch, setMemberSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | OrgRoleKey>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<{ email: string; url: string; expires_at: string } | null>(null);
  const [policyDraft, setPolicyDraft] = useState<OrgSettingsJson | null>(null);

  const memberList = members.data?.members ?? [];
  const invitations = invites.data?.invitations ?? [];
  const orgInfo = members.data?.organization;
  const seatLimit = usage.data?.seat_limit ?? orgInfo?.seat_limit ?? null;
  const policies: OrgSettingsJson = policyDraft ?? orgInfo?.settings_json ?? {};
  const policiesDirty = !!policyDraft && isDirty(orgInfo?.settings_json ?? {}, policyDraft);
  const askToLeave = useCallback(
    () => confirm({ title: 'Leave without saving?', body: 'Your changes to the policies will be lost.', confirmLabel: 'Leave', cancelLabel: 'Stay' }),
    [confirm],
  );
  useUnsavedChanges(policiesDirty, askToLeave);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return memberList.filter((m) => {
      if (roleFilter !== 'all' && primaryRole(m.roles) !== roleFilter) return false;
      if (!q) return true;
      return [m.display_name, m.email ?? '', ...m.roles].some((v) => v.toLowerCase().includes(q));
    });
  }, [memberList, memberSearch, roleFilter]);

  const usageTotals = useMemo(() => {
    const rows = usage.data?.usage ?? [];
    return {
      calls: rows.reduce((n, r) => n + r.calls, 0),
      tokens: rows.reduce((n, r) => n + r.input_tokens + r.output_tokens, 0),
      cost: rows.reduce((n, r) => n + r.cost_usd, 0),
    };
  }, [usage.data]);

  async function run<T>(key: string, fn: () => Promise<T>, success?: string, failure = 'Something went wrong'): Promise<T | undefined> {
    setBusy(key);
    try {
      const result = await fn();
      if (success) toast.success(success);
      return result;
    } catch (err) {
      toast.error(`${failure}. ${errorMessage(err)}`);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function handleSendInvite(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const res = await run(
      'invite',
      () => api<{ invitation: Invitation; token: string }>(`/api/orgs/${org.id}/invitations`, { body: { email, role: toApiRole(inviteRole) } }),
      undefined,
      'Could not create the invitation',
    );
    if (!res) return;
    setInviteEmail('');
    setNewLink({ email, url: `${window.location.origin}/invite/${res.token}`, expires_at: res.invitation.expires_at });
    toast.success(`Invitation for ${email} is ready. Copy the link: it is shown only once.`);
    await invites.reload();
  }

  async function changeRole(m: Member, role: OrgRoleKey) {
    if (!org) return;
    await run(
      `role-${m.user_id}`,
      () => api(`/api/orgs/${org.id}/members/${m.user_id}`, { method: 'PATCH', body: { role: toApiRole(role) } }),
      `${m.display_name || m.email} is now ${ORG_ROLE_SPECS[role].label.toLowerCase()}.`,
      'Could not change the role',
    );
    await members.reload();
  }

  async function removeMember(m: Member) {
    if (!org) return;
    if (!(await confirm({ title: `Remove ${m.display_name || m.email} from ${org.name}?`, body: 'They lose access at once. You can invite them again later.', confirmLabel: 'Remove member' }))) return;
    await run(`remove-${m.user_id}`, () => api(`/api/orgs/${org.id}/members/${m.user_id}`, { method: 'DELETE' }), 'Member removed.', 'Could not remove the member');
    await members.reload();
  }

  async function revokeInvite(inv: Invitation) {
    if (!org) return;
    const ok = await confirm({
      title: `Revoke the invitation for ${inv.email}?`,
      body: 'Its link stops working at once. You can send a new invitation later.',
      confirmLabel: 'Revoke invitation',
    });
    if (!ok) return;
    await run(`revoke-${inv.id}`, () => api(`/api/orgs/${org.id}/invitations/${inv.id}`, { method: 'DELETE' }), `Invitation for ${inv.email} revoked.`, 'Could not revoke the invitation');
    if (newLink?.email === inv.email) setNewLink(null);
    await invites.reload();
  }

  async function savePolicies() {
    if (!org) return;
    const ok = await run('policies', () => api(`/api/orgs/${org.id}/settings`, { method: 'PATCH', body: { settings: policies } }), 'Organization policies saved.', 'Could not save the policies');
    if (ok !== undefined) {
      setPolicyDraft(null);
      await members.reload();
    }
  }

  function exportAuditTrail() {
    const entries = audit.data?.entries ?? [];
    const payload = { organization: { id: org?.id, name: org?.name, slug: org?.slug }, exported_at: new Date().toISOString(), entries };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org?.slug ?? 'org'}-audit-trail.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Audit trail exported (${entries.length} entries).`);
  }

  if (!org) return <PageState loading error={null} kind="sections" />;

  return (
    <div className="space-y-8">
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-good-on-dark">
              <LiveDot tone="mint" />
              <span>ORGANIZATION · {org.name.toUpperCase()}</span>
            </span>
            <span>•</span>
            <span className="font-semibold text-accent-on-dark">{(usage.data?.plan ?? orgInfo?.plan ?? org.plan ?? 'free').toUpperCase()} PLAN</span>
          </>
        }
        statusChips={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good/20 px-2.5 py-0.5 text-[10px] font-semibold text-good-on-dark">
            <LiveDot tone="mint" />
            <span>YOUR ROLE: {roleLabel(org).toUpperCase()}</span>
          </span>
        }
        title="Organization Settings & Resource Allocation"
        subtitle="Manage members and their roles, invitations, AI usage and the policies of your organization."
        actions={
          <Link to="/org/events" className={`${linkButtonSecondary} border-white/15 bg-white/10 text-white hover:bg-white/20`}>
            <span>← Organizer Console</span>
          </Link>
        }
      />

      {!canManage && !canSeeUsage && !canAudit && (
        <Notice tone="info">Your role in {org.name} cannot see its settings. Ask an owner of the organization.</Notice>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TopAccentKpiCard
          accent="cobalt"
          eyebrow="Seats"
          icon="badge"
          value={usage.data?.seats_used ?? (canManage ? memberList.length : '–')}
          unit={seatLimit ? `/ ${seatLimit} seats` : ''}
          description={
            canManage
              ? `${memberList.filter((m) => primaryRole(m.roles) === 'judge').length} judges, ${memberList.filter((m) => primaryRole(m.roles) === 'organizer').length} organizers, ${memberList.filter((m) => primaryRole(m.roles) === 'owner').length} owners`
              : 'Member list is visible to owners.'
          }
          progress={seatLimit ? Math.min(100, Math.round(((usage.data?.seats_used ?? memberList.length) / seatLimit) * 100)) : 0}
        />
        <TopAccentKpiCard
          accent="emerald"
          eyebrow="AI calls, last 30 days"
          icon="memory"
          value={canSeeUsage ? (usage.loading ? '…' : compact(usageTotals.calls)) : '–'}
          unit={canSeeUsage ? `${compact(usageTotals.tokens)} tokens` : ''}
          description={canSeeUsage ? `Estimated cost: $${usageTotals.cost.toFixed(2)}` : 'Usage is visible to owners, organizers and auditors.'}
          progress={canSeeUsage && usageTotals.calls > 0 ? 100 : 0}
        />
        <TopAccentKpiCard
          accent="amber"
          eyebrow="Pending Invitations"
          icon="mark_email_unread"
          value={canManage ? invitations.length : '–'}
          unit="open"
          description="Invitation links expire after 72 hours."
          progress={Math.min(100, invitations.length * 25)}
        />
        <TopAccentKpiCard
          accent="neutral"
          eyebrow="Your Permissions"
          icon="verified"
          value={perms.length}
          unit={perms.length === 1 ? 'permission' : 'permissions'}
          description={permissionLabels(perms).join(' · ') || 'No permissions in this organization.'}
          progress={100}
        />
      </div>

      {/* 01: invitations */}
      {canManage && (
        <NumberedSectionCard
          id="section-seat-dispatch"
          number="01"
          icon="vpn_key"
          title="Invite a Member"
          subtitle="Create a role-scoped invitation link for a co-organizer, judge or auditor."
          sectionTag="SECTION 01 // INVITE"
          theme="accent"
        >
          <div className="space-y-6">
            <form onSubmit={(e) => void handleSendInvite(e)} className="grid grid-cols-1 items-end gap-4 md:grid-cols-12">
              <div className="space-y-1.5 md:col-span-6">
                <div className="flex items-center justify-between">
                  <label htmlFor="invite-email" className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase">
                    Work Email
                  </label>
                  <span className="font-mono-code text-[11px] text-accent">They must sign in with this email</span>
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute top-2.5 left-3 text-[17px] text-muted">alternate_email</span>
                  <Input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@university.edu"
                    className="font-mono-code h-10 bg-paper pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <label htmlFor="invite-role" className="font-mono-code block text-[11px] font-semibold tracking-wider text-ink uppercase">
                  Role
                </label>
                <Select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as OrgRoleKey)} className="h-10 bg-paper">
                  <option value="judge">Judge (scores assigned submissions)</option>
                  <option value="organizer">Organizer (runs events)</option>
                  <option value="auditor">Auditor (audit trail and integrity)</option>
                  <option value="owner">Owner (members and settings)</option>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Button type="submit" className="h-10 w-full" disabled={busy === 'invite'} loading={busy === 'invite'}>
                  <span className="material-symbols-outlined text-[17px]">link</span>
                  <span>{busy === 'invite' ? 'Creating…' : 'Create Invitation Link'}</span>
                </Button>
              </div>
            </form>

            {newLink && (
              <div className="space-y-2 rounded-[4px] border border-accent/30 bg-accent-soft p-4">
                <p className="text-[13px] text-ink">
                  Send this link to <strong>{newLink.email}</strong>. It is shown only once and expires {formatDate(newLink.expires_at)}.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-mono-code min-w-0 flex-1 truncate rounded-[3px] border border-line bg-surface px-2 py-1.5 text-[12px]">{newLink.url}</code>
                  <CopyLinkButton value={newLink.url} label="Copy Invitation Link" variant="primary" />
                </div>
              </div>
            )}

            <div className="space-y-2.5 border-t border-line pt-4">
              <div className="font-mono-code flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                <span className="material-symbols-outlined text-[15px] text-accent">grid_view</span>
                <span>What each role can do</span>
              </div>
              <RoleCapabilityGrid activeRole={inviteRole} />
            </div>
          </div>
        </NumberedSectionCard>
      )}

      {/* 02: members */}
      {canManage && (
        <NumberedSectionCard
          id="section-roster"
          number="02"
          icon="groups"
          title="Members"
          subtitle="Change roles or remove access. An organization always keeps at least one owner."
          sectionTag={`SECTION 02 // ${memberList.length} MEMBERS`}
          theme="neutral"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-line bg-paper p-3">
              <div className="relative max-w-md flex-1">
                <span className="material-symbols-outlined pointer-events-none absolute top-2 left-3 text-[16px] text-muted">search</span>
                <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by name, email or role…" className="h-9 bg-surface pl-9 text-[12px]" />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono-code mr-1 text-[11px] text-muted">Role:</span>
                {(
                  [
                    { key: 'all', label: `All (${memberList.length})` },
                    { key: 'owner', label: 'Owners' },
                    { key: 'organizer', label: 'Organizers' },
                    { key: 'judge', label: 'Judges' },
                    { key: 'auditor', label: 'Auditors' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setRoleFilter(tab.key)}
                    className={`font-mono-code cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      roleFilter === tab.key ? 'border-accent bg-surface font-semibold text-accent' : 'border-transparent text-muted hover:bg-white/70 hover:text-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {members.loading ? (
              <SkeletonTable rows={4} cols={4} />
            ) : members.error ? (
              <Notice tone="error">{members.error}</Notice>
            ) : (
              <div className="overflow-x-auto rounded-[4px] border border-line">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Member</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">GitHub</th>
                      <th className="px-4 py-3 font-semibold">Joined</th>
                      <th className="px-5 py-3 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredMembers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-[13px] text-muted">No member matches this search.</td>
                      </tr>
                    )}
                    {filteredMembers.map((m) => {
                      const role = primaryRole(m.roles);
                      const spec = ORG_ROLE_SPECS[role];
                      const isMe = m.user_id === me?.profile.id;
                      const name = m.display_name || m.email || 'Unnamed member';
                      return (
                        <tr key={m.user_id} className="audit-table-row transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`font-mono-code flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] text-[12px] font-bold ${spec.avatarBgClass}`}>
                                {initialsOf(name)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 font-medium text-ink">
                                  <span>{name}</span>
                                  {isMe && (
                                    <span className="font-mono-code rounded-[2px] border border-accent/25 bg-accent-soft px-1.5 py-0.2 text-[9px] font-bold text-accent-ink uppercase">YOU</span>
                                  )}
                                </div>
                                <div className="font-mono-code text-[11px] text-muted">{m.email ?? '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5"><RoleBadge role={role} /></td>
                          <td className="font-mono-code px-4 py-3.5 text-[12px] text-muted">{m.github_login ? `@${m.github_login}` : '—'}</td>
                          <td className="font-mono-code px-4 py-3.5 text-[12px] text-muted">{formatDate(m.joined_at)}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                aria-label={`Role of ${name}`}
                                value={role}
                                disabled={busy === `role-${m.user_id}`}
                                onChange={(e) => void changeRole(m, e.target.value as OrgRoleKey)}
                                className="h-8 w-auto bg-paper text-[12px]"
                              >
                                {ROLE_OPTIONS.map((r) => (
                                  <option key={r} value={r}>{ORG_ROLE_SPECS[r].label}</option>
                                ))}
                              </Select>
                              {!isMe && (
                                <button
                                  type="button"
                                  disabled={busy === `remove-${m.user_id}`}
                                  onClick={() => void removeMember(m)}
                                  className="btn-tactile font-mono-code cursor-pointer rounded-[3px] border border-bad/30 bg-bad-soft px-2.5 py-1 text-[11px] font-medium text-bad hover:bg-bad hover:text-on-bad disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </NumberedSectionCard>
      )}

      {/* 03: pending invitations */}
      {canManage && (
        <NumberedSectionCard
          id="section-dispatch-queue"
          number="03"
          icon="schedule_send"
          title="Pending Invitations"
          subtitle="Links not used yet. Revoke one to make its link stop working."
          sectionTag={`SECTION 03 // ${invitations.length} OPEN`}
          theme="warn"
        >
          {invites.loading ? (
            <SkeletonTable rows={2} cols={4} />
          ) : invites.error ? (
            <Notice tone="error">{invites.error}</Notice>
          ) : invitations.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">No pending invitations. Use section 01 to invite judges or co-organizers.</p>
          ) : (
            <div className="overflow-x-auto rounded-[4px] border border-warn/30">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="font-mono-code border-b border-warn/25 bg-warn-soft/45 text-[11px] tracking-wider text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Invited by</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-5 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="font-mono-code divide-y divide-line">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-warn-soft/20">
                      <td className="px-5 py-3.5 font-semibold text-ink">
                        <span className="inline-flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px] text-warn">mail</span>
                          <span>{inv.email}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><RoleBadge role={normalizeOrgRole(inv.role_key)} /></td>
                      <td className="px-4 py-3.5 text-muted">{inv.profiles?.display_name || '—'}</td>
                      <td className="px-4 py-3.5 text-muted">
                        {formatDate(inv.created_at)} <span className="text-warn">(expires in {expiresIn(inv.expires_at)})</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          disabled={busy === `revoke-${inv.id}`}
                          onClick={() => void revokeInvite(inv)}
                          className="btn-tactile cursor-pointer rounded-[3px] border border-bad/30 bg-bad-soft px-2.5 py-1 text-[11px] font-medium text-bad hover:bg-bad hover:text-on-bad disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NumberedSectionCard>
      )}

      {/* 04: AI usage */}
      {canSeeUsage && (
        <NumberedSectionCard
          id="section-usage"
          number="04"
          icon="analytics"
          title="AI Usage"
          subtitle={usage.data ? `Gemini calls since ${formatDate(usage.data.since)}, by job and model.` : 'Gemini calls of the last 30 days.'}
          sectionTag="SECTION 04 // USAGE"
          theme="accent"
        >
          {usage.loading ? (
            <SkeletonTable rows={3} cols={4} />
          ) : usage.error ? (
            <Notice tone="error">{usage.error}</Notice>
          ) : (usage.data?.usage.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">No AI calls in the last 30 days.</p>
          ) : (
            <div className="overflow-x-auto rounded-[4px] border border-line">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Job</th>
                    <th className="px-4 py-3 font-semibold">Model</th>
                    <th className="px-4 py-3 text-right font-semibold">Calls</th>
                    <th className="px-4 py-3 text-right font-semibold">Input tokens</th>
                    <th className="px-4 py-3 text-right font-semibold">Output tokens</th>
                    <th className="px-5 py-3 text-right font-semibold">Est. cost</th>
                  </tr>
                </thead>
                <tbody className="font-mono-code divide-y divide-line">
                  {usage.data!.usage.map((u) => (
                    <tr key={`${u.kind}-${u.model}`}>
                      <td className="px-5 py-3">{u.kind}</td>
                      <td className="px-4 py-3 text-muted">{u.model}</td>
                      <td className="px-4 py-3 text-right">{u.calls}</td>
                      <td className="px-4 py-3 text-right">{compact(u.input_tokens)}</td>
                      <td className="px-4 py-3 text-right">{compact(u.output_tokens)}</td>
                      <td className="px-5 py-3 text-right">${u.cost_usd.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </NumberedSectionCard>
      )}

      {/* 05: audit trail and policies */}
      <DarkBanner id="section-enclave" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono-code rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-accent-on-dark">
              SECTION 05 // AUDIT & POLICIES
            </span>
            <h3 className="font-serif-heading text-[22px] font-medium text-white">Audit Trail &amp; Organization Policies</h3>
          </div>
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70">
            ORG {org.id}
          </span>
        </div>

        {canManage && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="flex items-start gap-3 rounded-[4px] border border-white/10 bg-white/5 p-4 text-[12px] text-white/80">
              <ToggleSwitch
                checked={!!policies.require_oral_defense}
                onChange={(v) => setPolicyDraft({ ...policies, require_oral_defense: v })}
              />
              <span>
                <span className="block font-semibold text-white">Require an oral defense</span>
                New events ask participants for a voice interview about their code.
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-[4px] border border-white/10 bg-white/5 p-4 text-[12px] text-white/80">
              <ToggleSwitch
                checked={policies.allow_judge_overrides ?? true}
                onChange={(v) => setPolicyDraft({ ...policies, allow_judge_overrides: v })}
              />
              <span>
                <span className="block font-semibold text-white">Judges may override AI scores</span>
                When off, only organizers change the final score.
              </span>
            </label>
            <label className="space-y-1.5 rounded-[4px] border border-white/10 bg-white/5 p-4 text-[12px] text-white/80">
              <span className="block font-semibold text-white">Keep data for (days)</span>
              <Input
                type="number"
                min={30}
                max={3650}
                value={policies.retention_days ?? 365}
                onChange={(e) => setPolicyDraft({ ...policies, retention_days: Number(e.target.value) })}
                className="h-9 bg-surface text-[12px] text-ink"
              />
            </label>
          </div>
        )}

        {canAudit && (
          <div className="space-y-2">
            <div className="font-mono-code text-[11px] tracking-wider text-white/55 uppercase">Recent activity</div>
            {audit.loading ? (
              <SkeletonText lines={5} />
            ) : audit.error ? (
              <Notice tone="error">{audit.error}</Notice>
            ) : (audit.data?.entries.length ?? 0) === 0 ? (
              <p className="text-[12px] text-white/65">Nothing recorded yet. Score overrides, publishing, member changes and decisions appear here.</p>
            ) : (
              <ul className="font-mono-code max-h-72 divide-y divide-white/10 overflow-y-auto rounded-[4px] border border-white/10 text-[12px]">
                {audit.data!.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 text-white/80">
                    <span className="text-white/50">{formatDate(e.created_at)}</span>
                    <span className="font-semibold text-accent-on-dark">{e.action}</span>
                    <span>{e.profiles?.display_name ?? 'System'}</span>
                    <span className="text-white/50">{e.subject_type}</span>
                  </li>
                ))}
              </ul>
            )}
            {(audit.data?.entries.length ?? 0) >= auditLimit && (
              <button type="button" onClick={() => setAuditLimit((n) => n + 100)} className="text-[12px] font-semibold text-accent-on-dark hover:underline">
                Load more
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 pt-4">
          {canAudit && (
            <button
              type="button"
              onClick={exportAuditTrail}
              disabled={!audit.data}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-2 text-[11px] font-semibold text-white hover:bg-white/20 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">file_download</span>
              <span>Export Audit Trail (JSON)</span>
            </button>
          )}
          {canManage && policiesDirty && (
            <span role="status" className="font-mono-code text-[11px] font-semibold text-warn-on-dark">
              Unsaved changes
            </span>
          )}
          {canManage && (
            <Button type="button" onClick={() => void savePolicies()} disabled={!policiesDirty || busy === 'policies'} loading={busy === 'policies'}>
              <span className="material-symbols-outlined text-[16px]">save</span>
              <span>{busy === 'policies' ? 'Saving…' : 'Save Policies'}</span>
            </Button>
          )}
        </div>
      </DarkBanner>
    </div>
  );
}
