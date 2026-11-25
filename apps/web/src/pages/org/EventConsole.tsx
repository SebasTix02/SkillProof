import { tr, trn } from '../../i18n';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { JudgeAssignments } from '../../components/JudgeAssignments';
import {
  CommandConsoleHeader,
  CopyLinkButton,
  LedgerAnchorBanner,
  LiveDot,
  PageState,
  TopAccentKpiCard,
  formatDate,
  linkButton,
  questionToOptions,
  useConfirm,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL, VISIBILITY_LABEL } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';
import { Allowlist } from './consoles/EventAllowlistCard';
import { EventLifecycleBanner } from './consoles/EventLifecycleBanner';
import { EventSubmissionsSection } from './consoles/EventSubmissionsSection';
import type { ConsoleResponse } from './consoles/eventConsoleTypes';
import { csvQuote, downloadCsv } from './download';

export function EventConsole() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad<ConsoleResponse>(
    `/api/events/${id}/console`,
    (d) =>
      d.event.status === 'judging' ||
      d.event.status === 'open' ||
      d.submissions.some((s) => s.status === 'queued' || s.status === 'analyzing'),
    5000,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [openSteps, setOpenSteps] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const { org } = useAuth();
  const canManage = !!org?.permissions.includes('event.manage');

  const toggleSteps = (sid: string) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  const filteredSubmissions = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.submissions;
    return data.submissions.filter(
      (s) =>
        s.team_name.toLowerCase().includes(q) ||
        s.submitted_by_name.toLowerCase().includes(q) ||
        (s.locked_commit_sha?.toLowerCase().includes(q) ?? false) ||
        (s.current_version?.repos.name.toLowerCase().includes(q) ?? false),
    );
  }, [data, search]);

  if (!data) return <PageState loading={loading} error={error} kind="console" />;
  const { event, submissions } = data;

  async function act(key: string, path: string, success: string, confirmText?: string) {
    if (confirmText && !(await confirm(questionToOptions(confirmText, { confirmLabel: tr('Continue') })))) return;
    setBusy(key);
    try {
      await api(path, { method: 'POST' });
      setConfirmClose(false);
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const link = `${window.location.origin}/e/${event.slug}`;
  const done = submissions.filter((s) => s.status === 'scored' || s.status === 'error').length;
  const failed = submissions.filter((s) => s.status === 'error').length;
  const voiceCompleted = submissions.filter((s) => s.ownership != null).length;
  const flagged = new Set(data.similarity_flags.flatMap((f) => [f.submission_a, f.submission_b]));
  const ranked = event.status !== 'open' && event.status !== 'draft';
  const progressPct = submissions.length > 0 ? Math.round((done / submissions.length) * 100) : 0;

  function exportEventCsv() {
    if (submissions.length === 0) {
      toast.error(tr('No submissions to export yet.'));
      return;
    }
    const header = ['rank', 'team_name', 'submitted_by', 'repo', 'commit_sha', 'status', 'score', 'ownership_score'];
    const rows = submissions.map((s, idx) => [
      ranked && s.total != null ? String(idx + 1) : '',
      csvQuote(s.team_name),
      csvQuote(s.submitted_by_name),
      s.current_version?.repos ? `${s.current_version.repos.owner}/${s.current_version.repos.name}` : '',
      s.locked_commit_sha ?? '',
      s.status,
      s.total != null ? s.total.toFixed(1) : '',
      s.ownership ? String(s.ownership.score) : '',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCsv(`${event.slug}-standings.csv`, csv);
    toast.success(tr('Event standings exported as CSV.'));
  }

  return (
    <div className="space-y-8">
      {/* 1. Command Console Context Header */}
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <Link to="/org/events" className="text-accent-on-dark hover:underline">
              {tr('← ALL ORGANIZATION EVENTS')}
            </Link>
            <span>//</span>
            <span>{tr('SLUG: /e/')}{event.slug}</span>
            <span>//</span>
            <span className="font-semibold text-white">{VISIBILITY_LABEL[event.visibility].toUpperCase()}{' '}{tr('ACCESS')}</span>
          </>
        }
        statusChips={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-good-on-dark">
              <LiveDot
                tone={event.status === 'open' || event.status === 'judging' ? 'mint' : 'good'}
                pulse={event.status === 'open' || event.status === 'judging'}
              />
              <span>{tr('STATUS:')}{' '}{STATUS_LABEL[event.status].toUpperCase()}</span>
            </span>
            <span className="rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/75">
              {tr('DEADLINE:')}{' '}{formatDate(event.submission_deadline).toUpperCase()}
            </span>
          </>
        }
        eyebrowBadge={tr('EVENT CONSOLE // {kind}', { kind: event.kind.toUpperCase() })}
        eyebrowMeta={
          event.max_submissions == null
            ? tr('UNLIMITED VERSIONS')
            : tr('MAX {n} VERSIONS / PARTICIPANT', { n: event.max_submissions })
        }
        title={event.name}
        subtitle={tr('Participant registration link: {link}', { link })}
        actions={
          <>
            <CopyLinkButton
              value={link}
              label={tr('Copy Participant Link')}
              copiedLabel={tr('Link Copied!')}
              variant="dark"
            />
            <button
              type="button"
              onClick={exportEventCsv}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>{tr('Export CSV')}</span>
            </button>
            {submissions[0] && (
              <Link to={`/org/events/${event.id}/s/${submissions[0].id}`} className={linkButton}>
                <span className="material-symbols-outlined text-[16px]">gavel</span>
                <span>{tr('Open Judge Workspace')}</span>
              </Link>
            )}
            <Link
              to={`/org/integrity/${event.id}`}
              className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[15px]">policy</span>
              <span>{tr('Integrity review')}</span>
            </Link>
          </>
        }
      />

      {/* 2. 4-Card KPI Telemetry Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TopAccentKpiCard
          accent="cobalt"
          eyebrow={tr('Cohort Roster')}
          icon="groups"
          value={data.participant_count}
          unit={tr('Participants')}
          description={`${submissions.length} project submissions received so far.`}
          footerLeft={tr('VISIBILITY')}
          footerRight={VISIBILITY_LABEL[event.visibility].toUpperCase()}
        />
        <TopAccentKpiCard
          accent="emerald"
          eyebrow={tr('Evaluation Pipeline')}
          icon="memory"
          value={`${done} / ${submissions.length}`}
          unit={tr('Judged')}
          description={
            failed > 0
              ? trn('{count} submission encountered an error and can be retried.', '{count} submissions encountered an error and can be retried.', failed)
              : tr('Automated repository map & rubric scoring.')
          }
          progress={progressPct}
        />
        <TopAccentKpiCard
          accent="neutral"
          eyebrow={tr('Oral Defense')}
          icon="record_voice_over"
          value={event.interviews_enabled ? voiceCompleted : 'OFF'}
          unit={event.interviews_enabled ? `/ ${submissions.length} Verified` : undefined}
          description={
            event.interviews_enabled
              ? '3-minute live voice interviews completed by authors.'
              : tr('Voice interviews are disabled for this event.')
          }
          footerLeft={tr('VOICE ENGINE')}
          footerRight={event.interviews_enabled ? 'ENABLED' : 'SKIPPED'}
        />
        <TopAccentKpiCard
          accent="amber"
          eyebrow={tr('Forensic Signals')}
          icon="policy"
          value={data.similarity_flags.length}
          unit={tr('Flags')}
          description={tr('Shared repositories, common forks, or structural overlap signals.')}
          footerLeft={tr('INTEGRITY STATUS')}
          footerRight={data.similarity_flags.length === 0 ? 'CLEAN' : tr('CHECK SIGNALS')}
        />
      </section>

      {/* 3. Lifecycle Control Banner */}
      <EventLifecycleBanner
        event={event}
        submissionsCount={submissions.length}
        firstSubmissionId={submissions[0]?.id}
        done={done}
        failed={failed}
        progressPct={progressPct}
        canManage={canManage}
        busy={busy}
        confirmClose={confirmClose}
        onConfirmCloseChange={setConfirmClose}
        act={(key, path, success, confirmText) => void act(key, path, success, confirmText)}
      />

      {/* 4. Invite-Only Allowlist */}
      {event.visibility === 'invite' && <Allowlist eventId={event.id} />}

      {canManage && event.status !== 'draft' && <JudgeAssignments eventId={event.id} submissions={submissions} />}

      {/* 5 & 6. Forensic Signals + Submissions & Leaderboard Table */}
      <EventSubmissionsSection
        event={event}
        link={link}
        submissions={submissions}
        filteredSubmissions={filteredSubmissions}
        similarityFlags={data.similarity_flags}
        flaggedSet={flagged}
        ranked={ranked}
        search={search}
        onSearchChange={setSearch}
        openSteps={openSteps}
        onToggleSteps={toggleSteps}
        canManage={canManage}
        busy={busy}
        act={(key, path, success, confirmText) => void act(key, path, success, confirmText)}
      />

      <LedgerAnchorBanner
        badge={tr('COMMIT-LOCKED AUDIT')}
        meta={tr('EVENT ID: {id} // {n} RUBRIC VECTORS', { id: event.id.slice(0, 8).toUpperCase(), n: event.rubric_json.length })}
        title={tr('Frozen Commits & Override Trail')}
        description={tr('Every AI score includes cited repository files, and every manual judge override is tracked with user attribution and timestamp.')}
      />
    </div>
  );
}
