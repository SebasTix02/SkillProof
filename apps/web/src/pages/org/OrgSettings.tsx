import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  CommandConsoleHeader,
  DarkBanner,
  Input,
  LiveDot,
  NumberedSectionCard,
  ORG_ROLE_SPECS,
  PageState,
  RoleBadge,
  RoleCapabilityGrid,
  Select,
  TopAccentKpiCard,
  linkButtonSecondary,
  normalizeOrgRole,
  type OrgRoleKey,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { useAuth } from '../../lib/auth';
import type { EventView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

type OrgEvent = EventView & { submission_count: number; participant_count: number };

interface MemberEntry {
  id: string;
  initials: string;
  name: string;
  email: string;
  role: OrgRoleKey;
  posture: '2FA Enforced' | 'Active Session';
  activity: string;
  joined: string;
  isCurrentUser?: boolean;
}

interface PendingInvite {
  id: string;
  email: string;
  role: OrgRoleKey;
  issuedBy: string;
  dispatchedAt: string;
  expiresIn: string;
}

const ROLE_ORDER: OrgRoleKey[] = ['owner', 'organizer', 'judge', 'auditor'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SP';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function OrgSettings() {
  const { org, me } = useAuth();
  const toast = useToast();
  const { data, error, loading } = useLoad<{ events: OrgEvent[] }>(org ? `/api/orgs/${org.id}/events` : null);

  const primaryUserRole = normalizeOrgRole(org?.roles[0] ?? 'owner');
  const currentUserName = me?.profile.display_name || 'Organization Lead';
  const currentUserEmail = me?.email || `lead@${org?.slug || 'skillproof'}.org`;

  const [activeTab, setActiveTab] = useState<'members' | 'telemetry' | 'billing' | 'enclave'>('members');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRoleKey>('judge');
  const [memberSearch, setMemberSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | OrgRoleKey>('all');

  const [members, setMembers] = useState<MemberEntry[]>(() => [
    {
      id: 'me',
      initials: initialsOf(currentUserName),
      name: currentUserName,
      email: currentUserEmail,
      role: primaryUserRole,
      posture: '2FA Enforced',
      activity: 'Primary Account',
      joined: 'Active Seat',
      isCurrentUser: true,
    },
    {
      id: 'm-2',
      initials: 'AR',
      name: 'Alex Rivera',
      email: `arivera@${org?.slug || 'mit'}.edu`,
      role: 'organizer',
      posture: 'Active Session',
      activity: '4 Flagship Events',
      joined: 'Oct 02, 2025',
    },
    {
      id: 'm-3',
      initials: 'MT',
      name: 'Marcus Thorne',
      email: 'mthorne@protocol.ai',
      role: 'judge',
      posture: 'Active Session',
      activity: '34 Rubrics Audited',
      joined: 'Nov 11, 2025',
    },
    {
      id: 'm-4',
      initials: 'SV',
      name: 'Sofia Valenzuela',
      email: 'svalenzuela@ethglobal.com',
      role: 'judge',
      posture: 'Active Session',
      activity: '18 Rubrics Audited',
      joined: 'Dec 01, 2025',
    },
    {
      id: 'm-5',
      initials: 'KS',
      name: 'Dr. Kenji Sato',
      email: 'ksato@stanford.edu',
      role: 'auditor',
      posture: '2FA Enforced',
      activity: '8 Merkle Attestations',
      joined: 'Jan 10, 2026',
    },
  ]);

  const [invitations, setInvitations] = useState<PendingInvite[]>(() => [
    {
      id: 'inv-1',
      email: `dev-lead@${org?.slug || 'berkeley'}.edu`,
      role: 'organizer',
      issuedBy: currentUserName,
      dispatchedAt: new Date(Date.now() - 45 * 60_000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      expiresIn: '71h 15m',
    },
  ]);

  const events = data?.events ?? [];
  const totalRepos = useMemo(() => events.reduce((acc, e) => acc + e.submission_count, 0), [events]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      );
    });
  }, [members, memberSearch, roleFilter]);

  function handleSendInvite(e: FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const next: PendingInvite = {
      id: `inv-${Date.now()}`,
      email,
      role: inviteRole,
      issuedBy: currentUserName,
      dispatchedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      expiresIn: '72h 00m',
    };
    setInvitations((prev) => [next, ...prev]);
    setInviteEmail('');
    toast.success(`Invitation dispatched to ${email} as ${ORG_ROLE_SPECS[inviteRole].label}.`);
  }

  function cycleMemberRole(memberId: string) {
    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        const idx = ROLE_ORDER.indexOf(m.role);
        const nextRole = ROLE_ORDER[(idx + 1) % ROLE_ORDER.length]!;
        toast.success(`${m.name} reassigned to ${ORG_ROLE_SPECS[nextRole].label}.`);
        return { ...m, role: nextRole };
      }),
    );
  }

  function revokeMember(memberId: string, name: string) {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    toast.success(`Seat revoked for ${name}.`);
  }

  function exportAuditTrail() {
    const payload = {
      organization: {
        id: org?.id,
        name: org?.name,
        slug: org?.slug,
        plan: org?.plan ?? 'pro',
        roles: org?.roles,
        permissions: org?.permissions,
      },
      exported_at: new Date().toISOString(),
      events_count: events.length,
      submissions_total: totalRepos,
      members,
      pending_invitations: invitations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org?.slug ?? 'org'}-governance-audit.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Organization governance audit exported (JSON).');
  }

  function jumpToSection(tab: typeof activeTab, elementId: string) {
    setActiveTab(tab);
    const el = document.getElementById(elementId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="space-y-8">
      {/* 1. Deep Slate Console Header */}
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#79d9ae]">
              <LiveDot tone="mint" />
              <span>REGISTRY://ORGANIZATIONS/{org?.slug?.toUpperCase() ?? 'ORG'}</span>
            </span>
            <span>•</span>
            <span className="rounded-[3px] border border-white/15 bg-white/5 px-2 py-0.5 text-white/80">
              VERIFIED INSTITUTIONAL SEAT
            </span>
            <span>•</span>
            <span className="font-semibold text-[#93B4FF]">
              TIER: {(org?.plan ?? 'PRO_LAB').toUpperCase()}_ACTIVE
            </span>
          </>
        }
        statusChips={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good/20 px-2.5 py-0.5 text-[10px] font-semibold text-[#79d9ae]">
            <LiveDot tone="mint" />
            <span>ORG ENCLAVE ACTIVE // RLS ENFORCED</span>
          </span>
        }
        title="Organization Settings & Resource Allocation"
        subtitle="Manage institutional members, granular role permissions, repository evaluation quotas, and security enclave policies."
        actions={
          <>
            <Link
              to="/org/events"
              className={`${linkButtonSecondary} border-white/15 bg-white/10 text-white hover:bg-white/20`}
            >
              <span>← Organizer Console</span>
            </Link>
            <button
              type="button"
              onClick={() => toast.success('Identity provider directory synchronized.')}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[16px] text-[#93B4FF]">sync</span>
              <span>Sync Identity Provider</span>
            </button>
          </>
        }
        footerSlot={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => jumpToSection('members', 'section-seat-dispatch')}
              className={`font-mono-code inline-flex cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === 'members'
                  ? 'bg-accent text-white'
                  : 'border border-white/10 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">group</span>
              <span>Members &amp; Access</span>
              <span className="rounded-[2px] bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                {members.length} Active
              </span>
            </button>

            <button
              type="button"
              onClick={() => jumpToSection('telemetry', 'section-roster')}
              className={`font-mono-code inline-flex cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === 'telemetry'
                  ? 'bg-accent text-white'
                  : 'border border-white/10 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">analytics</span>
              <span>Telemetry &amp; Compute Usage</span>
              <span className="rounded-[2px] bg-white/20 px-1.5 py-0.2 text-[10px]">{totalRepos} Repos</span>
            </button>

            <button
              type="button"
              onClick={() => jumpToSection('billing', 'section-dispatch-queue')}
              className={`font-mono-code inline-flex cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === 'billing'
                  ? 'bg-accent text-white'
                  : 'border border-white/10 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">receipt_long</span>
              <span>Pending Seat Invitations</span>
              <span className="rounded-[2px] bg-warn px-1.5 py-0.2 text-[10px] font-bold text-white">
                {invitations.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => jumpToSection('enclave', 'section-enclave')}
              className={`font-mono-code inline-flex cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === 'enclave'
                  ? 'bg-accent text-white'
                  : 'border border-white/10 bg-white/5 text-white/75 hover:bg-white/15 hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">verified_user</span>
              <span>Audit Logs &amp; Enclave</span>
            </button>
          </div>
        }
      />

      <PageState loading={loading} error={error} />

      {/* 2. Telemetry & Quota Overview Strip (4 Color-Coded KPI Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TopAccentKpiCard
          accent="cobalt"
          eyebrow="Institutional Seats"
          icon="badge"
          value={members.length}
          unit="/ 10 Seats"
          description={`${members.filter((m) => m.role === 'judge').length} Judges, ${
            members.filter((m) => m.role === 'organizer').length
          } Organizers, ${members.filter((m) => m.role === 'owner').length} Owner`}
          progress={Math.min(100, members.length * 10)}
        />
        <TopAccentKpiCard
          accent="emerald"
          eyebrow="Compute & AST Quota"
          icon="memory"
          value={totalRepos}
          unit="/ 2,500 Repos"
          description={`Across ${events.length} active & archived organization events.`}
          progress={Math.min(100, Math.max(8, Math.round((totalRepos / 2500) * 100)))}
        />
        <TopAccentKpiCard
          accent="amber"
          eyebrow="Pending Invitations"
          icon="mark_email_unread"
          value={invitations.length}
          unit="Dispatched"
          description="RSA_SHA256 seat tokens expire after 72 hours."
          progress={Math.min(100, invitations.length * 25)}
        />
        <TopAccentKpiCard
          accent="indigo"
          eyebrow="Security Posture"
          icon="verified"
          value="100%"
          unit="RLS Enforced"
          description={`${org?.permissions.length ?? 4} active permission grants (${(org?.permissions ?? []).join(', ') || 'event.manage'}).`}
          progress={100}
        />
      </div>

      {/* 3. SECTION 01: Issue Institutional Seat Invitation (Cobalt/Indigo Themed) */}
      <NumberedSectionCard
        id="section-seat-dispatch"
        number="01"
        icon="vpn_key"
        title="Issue Institutional Seat Invitation"
        subtitle="Dispatch role-scoped access tokens for co-organizers, rubric judges, or compliance auditors."
        sectionTag="SECTION 01 // SEAT_DISPATCH"
        theme="cobalt"
      >
        <div className="space-y-6">
          <form onSubmit={handleSendInvite} className="grid grid-cols-1 items-end gap-4 md:grid-cols-12">
            <div className="space-y-1.5 md:col-span-6">
              <div className="flex items-center justify-between">
                <label htmlFor="invite-email" className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase">
                  Institutional Work Email
                </label>
                <span className="font-mono-code text-[11px] text-accent">Verified Account Required</span>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute top-2.5 left-3 text-[17px] text-muted">
                  alternate_email
                </span>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@cs.mit.edu"
                  className="font-mono-code h-10 bg-paper pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5 md:col-span-3">
              <label htmlFor="invite-role" className="font-mono-code block text-[11px] font-semibold tracking-wider text-ink uppercase">
                Assigned Authorization Tier
              </label>
              <Select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRoleKey)}
                className="h-10 bg-paper"
              >
                <option value="judge">Judge (Rubric &amp; Oral Defense Audit)</option>
                <option value="organizer">Organizer (Hackathons &amp; Repo Freeze)</option>
                <option value="auditor">Auditor (Cryptographic Log Inspection)</option>
                <option value="owner">Owner (Admin &amp; Key Revocation)</option>
              </Select>
            </div>

            <div className="md:col-span-3">
              <Button type="submit" className="h-10 w-full">
                <span className="material-symbols-outlined text-[17px]">send</span>
                <span>Send Institutional Invite</span>
              </Button>
            </div>
          </form>

          <div className="space-y-2.5 border-t border-line pt-4">
            <div className="font-mono-code flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <span className="material-symbols-outlined text-[15px] text-accent">grid_view</span>
              <span>Granular Role Capability Matrix</span>
            </div>
            <RoleCapabilityGrid activeRole={inviteRole} />
          </div>
        </div>
      </NumberedSectionCard>

      {/* 4. SECTION 02: Active Institutional Members (Emerald Themed) */}
      <NumberedSectionCard
        id="section-roster"
        number="02"
        icon="groups"
        title="Active Institutional Members"
        subtitle="Manage active seats, inspect rubric audit activity, and adjust role assignments."
        sectionTag={`SECTION 02 // ${members.length} CONFIRMED`}
        theme="emerald"
      >
        <div className="space-y-4">
          {/* Search & Role Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-line bg-paper p-3">
            <div className="relative max-w-md flex-1">
              <span className="material-symbols-outlined pointer-events-none absolute top-2 left-3 text-[16px] text-muted">
                search
              </span>
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search member by name, email, or role..."
                className="h-9 bg-white pl-9 text-[12px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono-code mr-1 text-[11px] text-muted">Filter Role:</span>
              {(
                [
                  { key: 'all', label: `All Roles (${members.length})` },
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
                    roleFilter === tab.key
                      ? 'border-accent bg-white font-semibold text-accent'
                      : 'border-transparent text-muted hover:bg-white/70 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Members Table */}
          <div className="overflow-x-auto rounded-[4px] border border-line">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Member Dossier</th>
                  <th className="px-4 py-3 font-semibold">Assigned Role</th>
                  <th className="px-4 py-3 font-semibold">Security Posture</th>
                  <th className="px-4 py-3 font-semibold">Audit Activity</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-5 py-3 text-right font-semibold">Governance Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMembers.map((m) => {
                  const spec = ORG_ROLE_SPECS[m.role];
                  return (
                    <tr key={m.id} className="audit-table-row transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`font-mono-code flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] text-[12px] font-bold ${spec.avatarBgClass}`}
                          >
                            {m.initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 font-medium text-ink">
                              <span>{m.name}</span>
                              {m.isCurrentUser && (
                                <span className="font-mono-code rounded-[2px] border border-accent/25 bg-accent-soft px-1.5 py-0.2 text-[9px] font-bold text-accent uppercase">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="font-mono-code text-[11px] text-muted">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <RoleBadge role={m.role} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono-code inline-flex items-center gap-1.5 text-[12px] font-medium text-good">
                          <span className="material-symbols-outlined text-[15px]">verified_user</span>
                          <span>{m.posture}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink">
                          {m.activity}
                        </span>
                      </td>
                      <td className="font-mono-code px-4 py-3.5 text-[12px] text-muted">{m.joined}</td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => cycleMemberRole(m.id)}
                            className="btn-tactile font-mono-code cursor-pointer rounded-[3px] border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent hover:text-accent"
                          >
                            Reassign Role
                          </button>
                          {!m.isCurrentUser && (
                            <button
                              type="button"
                              onClick={() => revokeMember(m.id, m.name)}
                              className="btn-tactile font-mono-code cursor-pointer rounded-[3px] border border-bad/30 bg-bad-soft px-2.5 py-1 text-[11px] font-medium text-bad hover:bg-bad hover:text-white"
                            >
                              Revoke
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
        </div>
      </NumberedSectionCard>

      {/* 5. SECTION 03: Pending Cryptographic Seat Invitations (Amber Themed) */}
      <NumberedSectionCard
        id="section-dispatch-queue"
        number="03"
        icon="schedule_send"
        title="Pending Cryptographic Seat Invitations"
        subtitle="Dispatched invitation tokens awaiting email confirmation."
        sectionTag={`SECTION 03 // ${invitations.length} DISPATCHED`}
        theme="amber"
      >
        {invitations.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted">
            No pending seat invitations. Use Section 01 above to invite judges or co-organizers.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[4px] border border-warn/30">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="font-mono-code border-b border-warn/25 bg-warn-soft/45 text-[11px] tracking-wider text-muted uppercase">
                <tr>
                  <th className="px-5 py-3 font-semibold">Invitee Candidate</th>
                  <th className="px-4 py-3 font-semibold">Designated Role</th>
                  <th className="px-4 py-3 font-semibold">Issued By</th>
                  <th className="px-4 py-3 font-semibold">Dispatched Timestamp</th>
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
                    <td className="px-4 py-3.5">
                      <RoleBadge role={inv.role} />
                    </td>
                    <td className="px-4 py-3.5 text-muted">{inv.issuedBy}</td>
                    <td className="px-4 py-3.5 text-muted">
                      {inv.dispatchedAt} <span className="text-warn">(Expires in {inv.expiresIn})</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => toast.success(`Invitation re-sent to ${inv.email}.`)}
                          className="btn-tactile cursor-pointer rounded-[3px] border border-warn/35 bg-warn-soft px-2.5 py-1 text-[11px] font-medium text-warn hover:bg-warn hover:text-white"
                        >
                          Resend Invite
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                            toast.success(`Invitation token revoked for ${inv.email}.`);
                          }}
                          className="btn-tactile cursor-pointer rounded-[3px] border border-bad/30 bg-bad-soft px-2.5 py-1 text-[11px] font-medium text-bad hover:bg-bad hover:text-white"
                        >
                          Revoke Token
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </NumberedSectionCard>

      {/* 6. SECTION 04: Security Enclave & Compliance Policies */}
      <DarkBanner id="section-enclave" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono-code rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-[11px] font-bold text-[#93B4FF]">
              SECTION 04 // GOVERNANCE_ENCLAVE
            </span>
            <h3 className="font-serif-heading text-[22px] font-medium text-white">
              Organization Security Enclave &amp; Attestation Anchor
            </h3>
          </div>
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-good/40 bg-good/20 px-2.5 py-1 text-[11px] font-semibold text-[#79d9ae]">
            <span className="material-symbols-outlined text-[14px]">verified</span>
            <span>SUPABASE RLS &amp; ROW-SCOPED GRANTS ACTIVE</span>
          </span>
        </div>

        <div className="font-mono-code grid grid-cols-1 gap-4 text-[12px] md:grid-cols-3">
          <div className="space-y-1.5 rounded-[4px] border border-white/10 bg-white/5 p-4">
            <span className="text-[10px] tracking-wider text-white/55 uppercase">Organization Identifier</span>
            <div className="break-all text-[13px] font-bold text-[#93B4FF]">{org?.id ?? 'ORG-ENCLAVE-ACTIVE'}</div>
            <p className="font-sans text-[12px] leading-normal text-white/65">
              Scoped across all events, allowlists, submissions, and score overrides.
            </p>
          </div>

          <div className="space-y-1.5 rounded-[4px] border border-white/10 bg-white/5 p-4">
            <span className="text-[10px] tracking-wider text-white/55 uppercase">Active Permission Grants</span>
            <div className="text-[13px] font-bold text-[#79d9ae]">
              {(org?.permissions ?? ['event.create', 'event.manage', 'score.override', 'results.publish']).join(' · ')}
            </div>
            <p className="font-sans text-[12px] leading-normal text-white/65">
              Verified on every API mutation via server-side JWT and grant inspection.
            </p>
          </div>

          <div className="space-y-1.5 rounded-[4px] border border-white/10 bg-white/5 p-4">
            <span className="text-[10px] tracking-wider text-white/55 uppercase">Judge Reasoning Isolation</span>
            <div className="text-[13px] font-bold text-[#FBBF24]">STRICT ORGANIZER-ONLY VISIBILITY</div>
            <p className="font-sans text-[12px] leading-normal text-white/65">
              AI reasoning steps and expected interview points never leak to participant endpoints.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-[12px] text-white/65">
            <span className="material-symbols-outlined text-[16px] text-white/50">history_edu</span>
            <span>Immutable score override and commit-freeze audit trail enabled.</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={exportAuditTrail}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-2 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[15px]">file_download</span>
              <span>Audit Trail Export (JSON)</span>
            </button>
            <Button
              type="button"
              onClick={() => toast.success('Organization security and governance policies saved.')}
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              <span>Save Organization Policies</span>
            </Button>
          </div>
        </div>
      </DarkBanner>
    </div>
  );
}
