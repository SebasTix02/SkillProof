import { tr } from '../../i18n';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  CommandConsoleHeader,
  CopyLinkButton,
  Input,
  LedgerAnchorBanner,
  LiveDot,
  PageState,
  ScoreBar,
  SectionHeader,
  TopAccentKpiCard,
  formatDate,
  linkButton,
  linkButtonSecondary,
  Tabs,
} from '../../components/shared';
import { MyReviewQueue } from '../../components/MyReviewQueue';
import { useToast } from '../../components/toast';
import { useAuth } from '../../lib/auth';
import { roleLabel } from '../../lib/nav';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

type OrgEvent = EventView & { submission_count: number; participant_count: number };

type StatusFilter = 'all' | EventView['status'];

export function OrgEvents() {
  const { org } = useAuth();
  const toast = useToast();
  const { data, error, loading } = useLoad<{ events: OrgEvent[] }>(org ? `/api/orgs/${org.id}/events` : null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const events = data?.events ?? [];

  const stats = useMemo(() => {
    const totalEvents = events.length;
    const totalParticipants = events.reduce((acc, e) => acc + e.participant_count, 0);
    const totalSubmissions = events.reduce((acc, e) => acc + e.submission_count, 0);
    const inAdjudication = events.filter((e) => e.status === 'judging' || e.status === 'review').length;
    const withVoice = events.filter((e) => e.interviews_enabled).length;
    const conversionPct =
      totalParticipants > 0 ? Math.min(100, Math.round((totalSubmissions / totalParticipants) * 100)) : 0;
    const voiceCoveragePct = totalEvents > 0 ? Math.round((withVoice / totalEvents) * 100) : 100;
    return {
      totalEvents,
      totalParticipants,
      totalSubmissions,
      inAdjudication,
      withVoice,
      conversionPct,
      voiceCoveragePct,
    };
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        STATUS_LABEL[e.status].toLowerCase().includes(q)
      );
    });
  }, [events, search, statusFilter]);

  function exportMasterCsv() {
    if (events.length === 0) {
      toast.error(tr('No events available to export yet.'));
      return;
    }
    const header = ['id', 'name', 'slug', 'status', 'visibility', 'participants', 'submissions', 'deadline'];
    const rows = events.map((e) => [
      e.id,
      `"${e.name.replace(/"/g, '""')}"`,
      e.slug,
      e.status,
      e.visibility,
      String(e.participant_count),
      String(e.submission_count),
      e.submission_deadline,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${org?.slug ?? 'org'}-events-ledger.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tr('Master events ledger exported as CSV.'));
  }

  const isJudge = !!org?.permissions.includes('submission.review') && !org?.permissions.includes('event.manage');

  return (
    <div className="space-y-8">
      {isJudge && <MyReviewQueue />}
      {/* 1. Event console header */}
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <span className="font-semibold tracking-wider text-accent-on-dark">{tr('EVENT CONSOLE')}</span>
            <span>//</span>
            <span className="font-semibold text-white">{org?.name?.toUpperCase() ?? 'ORGANIZATION'}</span>
          </>
        }
        statusChips={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-accent-on-dark">
              <LiveDot tone="accent" />
              <span>{tr('ACTIVE PARTICIPANTS:')}{' '}{stats.totalParticipants}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-good-on-dark">
              <LiveDot tone="mint" pulse={stats.inAdjudication > 0} />
              <span>{tr('IN JUDGING:')}{' '}{stats.inAdjudication} {stats.inAdjudication === 1 ? 'EVENT' : 'EVENTS'}</span>
            </span>
            {org?.slug && (
              <span className="rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/70">
                {tr('ORG: /')}{org.slug}
              </span>
            )}
          </>
        }
        eyebrowBadge={tr('Organizer')}
        eyebrowMeta={tr('YOUR ROLE: {role}', { role: roleLabel(org).toUpperCase() })}
        title={tr('Event Console')}
        subtitle={tr('Create events, follow submissions and AI judging, and publish results. Every repository is frozen at its last commit before the deadline.')}
        actions={
          <>
            <button
              type="button"
              onClick={exportMasterCsv}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white hover:bg-white/15"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>{tr('Export Master CSV')}</span>
            </button>
            <Link
              to="/org/settings"
              className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-medium text-white hover:bg-white/15"
            >
              <span className="material-symbols-outlined text-[16px]">settings</span>
              <span>{tr('Org Settings')}</span>
            </Link>
            {org?.permissions.includes('event.create') && (
              <Link to="/org/events/new" className={linkButton}>
                <span className="material-symbols-outlined text-[17px]">add</span>
                <span>{tr('New event')}</span>
              </Link>
            )}
          </>
        }
      />

      {/* With no events yet, the four metrics at zero are hidden; the list below explains what to do. */}
      {(loading || !!error || events.length > 0) && (
        <>
          {/* 2. KPI & Telemetry Strip (4 Color-Themed Visual Cards) */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TopAccentKpiCard
              accent="cobalt"
              eyebrow={tr('Events')}
              icon="hub"
              value={stats.totalEvents}
              unit={tr('Events')}
              description={tr('{n} registered participants across your organization cohorts.', { n: stats.totalParticipants })}
              footerLeft={tr('SUBMISSION RATE')}
              footerRight={`${stats.conversionPct}%`}
            />
            <TopAccentKpiCard
              accent="emerald"
              eyebrow={tr('Repositories')}
              icon="account_tree"
              value={stats.totalSubmissions}
              unit={tr('Repositories')}
              description={tr('GitHub repositories ingested and tracked for commit-freeze rubric evaluation.')}
              progress={stats.conversionPct}
              footerLeft={tr('COMMIT LOCK')}
              footerRight={tr('AT THE DEADLINE')}
            />
            <TopAccentKpiCard
              accent="amber"
              eyebrow={tr('Judging')}
              icon="fact_check"
              value={String(stats.inAdjudication).padStart(2, '0')}
              unit={tr('In Review')}
              description={tr('Events currently in AI judging or awaiting organizer score calibration.')}
              footerLeft={tr('CALIBRATION MODE')}
              footerRight={stats.inAdjudication > 0 ? tr('ACTION READY') : tr('ALL CLEAR')}
            />
            <TopAccentKpiCard
              accent="neutral"
              eyebrow={tr('Voice interviews')}
              icon="record_voice_over"
              value={`${stats.voiceCoveragePct}%`}
              unit={tr('Voice Defense')}
              description={tr('{n} of {total} events configured with 3-minute live oral defense.', { n: stats.withVoice, total: stats.totalEvents || 1 })}
              footerLeft={tr('LIVE AUDIO ENGINE')}
              footerRight="GEMINI LIVE"
            />
          </section>
        </>
      )}

      <PageState loading={loading} error={error} kind="table" />

      {/* 3. SECTION 01: Registered Hackathons & Capstone Evaluations */}
      {data && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <SectionHeader
            eyebrow={tr('ALL EVENTS • {org}', { org: org?.name?.toUpperCase() ?? tr('ORGANIZATION') })}
            eyebrowTone="accent"
            title={tr('Registered Hackathons & Capstone Evaluations')}
            subtitle={tr('Manage submission windows, freeze repository commits, inspect AI rubric scores, and publish final leaderboards.')}
            rightSlot={
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[16px] text-muted">
                    search
                  </span>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={tr('Filter by name, slug, status…')}
                    className="h-9 w-56 bg-paper pl-8 text-[12px]"
                  />
                </div>
                <Link to="/org/events/new" className={linkButton}>
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  <span>{tr('Create Event')}</span>
                </Link>
              </div>
            }
          />

          {/* Status Filter Strip */}
          <Tabs
            variant="chips"
            size="sm"
            ariaLabel={tr('Filter events by status')}
            className="border-b border-line pb-3"
            tabs={(['all', 'open', 'judging', 'review', 'published', 'draft'] as const).map((key) => ({
              key,
              label: { all: tr('All'), open: tr('Open'), judging: tr('Judging'), review: tr('In Review'), published: tr('Published'), draft: tr('Drafts') }[key],
              count: key === 'all' ? events.length : events.filter((e) => e.status === key).length,
            }))}
            active={statusFilter}
            onChange={setStatusFilter}
          />

          {filtered.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-line bg-paper/50 p-10 text-center">
              <span className="material-symbols-outlined text-[28px] text-muted">event_note</span>
              <h3 className="font-serif-heading mt-2 text-[20px] font-medium text-ink">
                {events.length === 0 ? tr('No events created yet') : tr('No events match your filter')}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
                {events.length === 0
                  ? tr('Create an event, configure your weighted rubric, share its link with participants, and SkillProof judges every repository at the deadline.')
                  : tr('Try clearing the search query or switching the status filter above.')}
              </p>
              {events.length === 0 && (
                <div className="mt-4">
                  <Link to="/org/events/new" className={linkButton}>
                    {tr('Create your first event →')}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((e) => {
                const subRatio =
                  e.participant_count > 0
                    ? Math.min(100, Math.round((e.submission_count / e.participant_count) * 100))
                    : e.submission_count > 0
                      ? 100
                      : 0;
                const statusTone =
                  e.status === 'open'
                    ? 'accent'
                    : e.status === 'published'
                      ? 'good'
                      : e.status === 'review' || e.status === 'judging'
                        ? 'warn'
                        : 'neutral';

                return (
                  <div
                    key={e.id}
                    className="card-interactive flex flex-col justify-between gap-4 rounded-[6px] border border-line bg-paper/45 p-4 transition-colors hover:border-accent hover:bg-surface xl:flex-row xl:items-center"
                  >
                    <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
                      {/* Event Title & Identifier */}
                      <div className="min-w-[260px] space-y-1">
                        <div className="flex items-center gap-2">
                          <LiveDot
                            tone={
                              e.status === 'open'
                                ? 'accent'
                                : e.status === 'published'
                                  ? 'good'
                                  : e.status === 'judging' || e.status === 'review'
                                    ? 'warn'
                                    : 'muted'
                            }
                            pulse={e.status === 'open' || e.status === 'judging'}
                          />
                          <Link
                            to={`/org/events/${e.id}`}
                            className="font-serif-heading text-[20px] leading-snug font-medium text-ink hover:text-accent"
                          >
                            {e.name}
                          </Link>
                        </div>
                        <div className="font-mono-code flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span>{tr('SLUG: /e/')}{e.slug}</span>
                          <span>•</span>
                          <span className="font-medium text-ink uppercase">{e.kind}</span>
                        </div>
                      </div>

                      {/* 3-Col Track & Stats Matrix */}
                      <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-0.5">
                          <span className="font-mono-code block text-[10px] text-muted uppercase">
                            {tr('Access & Rubric')}
                          </span>
                          <span className="block text-[13px] font-medium text-ink">
                            {VISIBILITY_LABEL[e.visibility]}{' '}{tr('Access')}
                          </span>
                          <span className="font-mono-code block text-[11px] text-muted">
                            {e.rubric_json.length}{' '}{tr('Weighted Criteria')}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="font-mono-code block text-[10px] text-muted uppercase">
                            {tr('Submissions & Cohort')}
                          </span>
                          <span className="block text-[13px] font-medium text-ink">
                            {e.submission_count}{' '}{tr('Submissions /')}{' '}{e.participant_count}{' '}{tr('Joined')}
                          </span>
                          <ScoreBar
                            value={subRatio}
                            max={100}
                            tone={e.status === 'published' ? 'good' : 'accent'}
                            heightClass="h-1"
                          />
                        </div>

                        <div className="space-y-0.5">
                          <span className="font-mono-code block text-[10px] text-muted uppercase">
                            {tr('Oral Defense & Cutoff')}
                          </span>
                          <span className="block text-[13px] font-medium text-ink">
                            {e.interviews_enabled ? tr('3-Min Voice Defense') : tr('Code Rubric Only')}
                          </span>
                          <span className="font-mono-code block text-[11px] text-muted">
                            {tr('Deadline:')}{' '}{formatDate(e.submission_deadline)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge & Quick Actions */}
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-3 xl:justify-end xl:border-t-0 xl:pt-0">
                      <Badge tone={statusTone} dot>
                        {STATUS_LABEL[e.status]}
                      </Badge>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link to={`/org/events/${e.id}`} className={`${linkButton} px-3 py-1.5 text-[12px]`}>
                          <span>{tr('Open Console')}</span>
                          <span className="arrow-nudge font-mono-code text-[11px]">→</span>
                        </Link>
                        <Link
                          to={`/e/${e.slug}`}
                          className={`${linkButtonSecondary} px-3 py-1.5 text-[12px]`}
                        >
                          {tr('Participant View')}
                        </Link>
                        <CopyLinkButton
                          value={`${window.location.origin}/e/${e.slug}`}
                          label={tr('Invite URL')}
                          copiedLabel={tr('Copied')}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 4. Audit log banner */}
      <LedgerAnchorBanner
        badge={tr('AUDIT LOG')}
        meta={tr('ORG: {org} // RECORDED CHANGES', { org: org?.name?.toUpperCase() ?? tr('ORGANIZER') })}
        title={tr('Every change is in the audit log')}
        description={tr('Score overrides, event closes, publications and integrity decisions are recorded with who made them and when. Scores cite the repository files and name the model that wrote them.')}
        actions={
          <>
            <button
              type="button"
              onClick={exportMasterCsv}
              className={linkButtonSecondary}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>{tr('Audit Trail Export (CSV)')}</span>
            </button>
            <Link to="/org/settings" className={linkButton}>
              <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
              <span>{tr('Organization & Seat Settings')}</span>
            </Link>
          </>
        }
      />
    </div>
  );
}
