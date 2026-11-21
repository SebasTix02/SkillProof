import { tr, trn } from '../../i18n';
import type { ActivityEntry } from '@skillproof/shared';
import { Fragment, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, latestStep, modelName } from '../../components/AiActivity';
import {
  Badge,
  Button,
  CommandConsoleHeader,
  CopyLinkButton,
  Input,
  LedgerAnchorBanner,
  LiveDot,
  Notice,
  NumberedSectionCard,
  PageState,
  SIMILARITY_SIGNAL_LABEL,
  SUBMISSION_STATUS_LABEL,
  ScoreBar,
  SectionHeader,
  Spinner,
  Textarea,
  TopAccentKpiCard,
  formatDate,
  linkButton,
  linkButtonSecondary,
  scoreTone,
  type SimilaritySignal,
  type SubmissionPipelineStatus,
  useConfirm,
  questionToOptions,
} from '../../components/shared';
import { JudgeAssignments } from '../../components/JudgeAssignments';
import { SubmissionJudgingControls } from '../../components/JudgingControls';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView, type RepoRef, type ScoreView } from '../../lib/types';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';

interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';
  error: string | null;
  activity: ActivityEntry[];
  step_count: number;
  judge_attempts: number;
  next_attempt_at: string | null;
  models_used: string[] | null;
  versions_used: number;
  locked_commit_sha: string | null;
  current_version: { repos: RepoRef } | null;
  scores: ScoreView[];
  total: number | null;
  ownership: { score: number; confidence: string } | null;
}

interface Flag {
  id: string;
  submission_a: string;
  submission_b: string;
  signal: SimilaritySignal;
  explanation: string;
}

interface ConsoleResponse {
  event: EventView;
  participant_count: number;
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}

const EMAIL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g;

function Allowlist({ eventId }: { eventId: string }) {
  const list = useLoad<{ allowlist: { email: string; claimed_by: string | null }[] }>(
    `/api/events/${eventId}/allowlist`,
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'error'; text: string } | null>(null);
  const emails = [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = '';
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      for (let i = 0; i < emails.length; i += 2000) {
        await api(`/api/events/${eventId}/allowlist`, { body: { emails: emails.slice(i, i + 2000) } });
      }
      setMessage({ tone: 'good', text: tr('{n} emails are now on the list.', { n: emails.length }) });
      setText('');
      await list.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const joined = list.data?.allowlist.filter((a) => a.claimed_by).length ?? 0;

  return (
    <NumberedSectionCard
      number="AL"
      icon="mail_lock"
      title={tr('Invited Participant Allowlist')}
      subtitle={
        <>
          {tr('Only people who sign up with one of these emails and confirm it can join.')}
          {list.data && (
            <>
              {' '}
              <strong>{list.data.allowlist.length}</strong>{' '}{tr('invited,')}{' '}<strong>{joined}</strong> joined.
            </>
          )}
        </>
      }
      sectionTag={tr('INVITE-ONLY ACCESS')}
      theme="accent"
    >
      <div className="space-y-4">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr('Paste emails, one per line or separated by commas...')}
          aria-label={tr('Emails to invite')}
          className="font-mono-code text-[12px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-paper px-3 py-1.5 text-[11px] font-semibold text-accent hover:border-accent">
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            <span>{tr('Upload CSV / TXT File')}</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e)}
            />
          </label>
          <Button disabled={busy || emails.length === 0} loading={busy} onClick={() => void add()}>
            {busy ? tr('Adding…') : trn('Add {count} email', 'Add {count} emails', emails.length)}
          </Button>
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {list.data && list.data.allowlist.length > 0 && (
          <details className="rounded-[4px] border border-line bg-paper/60 p-3">
            <summary className="font-mono-code cursor-pointer text-[11px] font-semibold tracking-wider text-ink uppercase">
              {tr('Inspect Allowlist Roster (')}{list.data.allowlist.length}{' '}{tr('emails)')}
            </summary>
            <ul className="font-mono-code mt-2.5 max-h-56 space-y-1.5 overflow-auto border-t border-line pt-2.5 text-[12px]">
              {list.data.allowlist.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2">
                  <span className="text-ink">{a.email}</span>
                  {a.claimed_by ? <Badge tone="good">{tr('Joined')}</Badge> : <Badge>{tr('Invited')}</Badge>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </NumberedSectionCard>
  );
}

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
  const teamName = (sid: string) => submissions.find((s) => s.id === sid)?.team_name ?? tr('Unknown team');
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
      `"${s.team_name.replace(/"/g, '""')}"`,
      `"${s.submitted_by_name.replace(/"/g, '""')}"`,
      s.current_version?.repos ? `${s.current_version.repos.owner}/${s.current_version.repos.name}` : '',
      s.locked_commit_sha ?? '',
      s.status,
      s.total != null ? s.total.toFixed(1) : '',
      s.ownership ? String(s.ownership.score) : '',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-standings.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
      <section className="rounded-[6px] border border-line bg-surface p-6">
        {event.status === 'draft' && (
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="font-mono-code text-[11px] font-bold text-warn uppercase">
                {tr('STAGE 01 // DRAFT ASSESSMENT')}
              </div>
              <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                {tr('This event is currently a draft')}
              </h2>
              <p className="text-[13px] text-muted">
                {tr('Participants cannot view or join the event until you open it.')}
              </p>
            </div>
            <Button
              disabled={!!busy} loading={busy === 'open'}
              onClick={() =>
                void act(
                  'open',
                  `/api/events/${event.id}/open`,
                  tr('The event is open. Share the link with participants.'),
                )
              }
            >
              <span className="material-symbols-outlined text-[17px]">lock_open</span>
              <span>{busy === 'open' ? tr('Opening…') : tr('Open the event')}</span>
            </Button>
          </div>
        )}

        {event.status === 'open' && (
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="font-mono-code flex items-center gap-2 text-[11px] font-bold text-accent uppercase">
                <LiveDot tone="accent" />
                <span>{tr('STAGE 02 // SUBMISSIONS OPEN')}</span>
              </div>
              <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                {tr('Accepting repository submissions until')}{' '}{formatDate(event.submission_deadline)}
              </h2>
              <p className="max-w-2xl text-[13px] text-muted">
                {tr('At the deadline SkillProof records the latest commit SHA of every repository and judges that exact snapshot. Commits pushed after the cutoff are ignored.')}
              </p>
            </div>

            {!confirmClose ? (
              <Button variant="secondary" onClick={() => setConfirmClose(true)}>
                <span className="material-symbols-outlined text-[16px]">lock_clock</span>
                <span>{tr('Close and judge now')}</span>
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5 rounded-[4px] border border-bad/30 bg-bad-soft/40 p-3">
                <span className="text-[13px] font-medium text-ink">
                  {tr('Close submissions and freeze commits now? This cannot be undone.')}
                </span>
                <Button
                  variant="danger"
                  disabled={!!busy} loading={busy === 'close'}
                  onClick={() =>
                    void act(
                      'close',
                      `/api/events/${event.id}/close`,
                      tr('Submissions are closed. Judging has started.'),
                    )
                  }
                >
                  {busy === 'close' ? tr('Closing…') : tr('Yes, close and judge')}
                </Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => setConfirmClose(false)}>
                  {tr('Cancel')}
                </Button>
              </div>
            )}
          </div>
        )}

        {event.status === 'judging' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Spinner label={tr('Judging in progress')} />
                <span className="text-[13px] text-ink">
                  <strong>{done}</strong> of <strong>{submissions.length}</strong>{' '}{tr('submissions judged. This page updates automatically every 5 seconds.')}
                </span>
              </div>
              <span className="font-mono-code text-[12px] font-bold text-accent">{progressPct}{tr('% COMPLETE')}</span>
            </div>
            <ScoreBar value={progressPct} max={100} tone="accent" heightClass="h-2" />
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                {event.judging_paused_at ? (
                  <>
                    <span className="font-mono-code rounded-[3px] bg-warn px-2 py-0.5 text-[11px] font-bold text-on-warn uppercase">{tr('Judging paused')}</span>
                    <Button disabled={!!busy} loading={busy === 'resume-all'} onClick={() => void act('resume-all', `/api/events/${event.id}/judging/resume`, tr('Judging resumed.'))}>
                      {tr('Resume judging')}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={!!busy} loading={busy === 'pause-all'} onClick={() => void act('pause-all', `/api/events/${event.id}/judging/pause`, tr('Judging paused. Running submissions stop at their next checkpoint.'))}>
                    {tr('Pause judging')}
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={!!busy} loading={busy === 'cancel-all'}
                  onClick={() =>
                    void act(
                      'cancel-all',
                      `/api/events/${event.id}/judging/cancel`,
                      tr('Judging canceled. The event moved to review; canceled submissions can be judged again.'),
                      tr('Cancel judging for every submission not judged yet ({n})? The event moves to review and you can judge them again later.', { n: submissions.length - done }),
                    )
                  }
                >
                  {tr('Cancel judging')}
                </Button>
              </div>
            )}
          </div>
        )}

        {event.status === 'review' && (
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1">
              <div className="font-mono-code text-[11px] font-bold text-warn uppercase">
                {tr('STAGE 03 // ORGANIZER & JUDGE CALIBRATION')}
              </div>
              <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                {tr('AI judging has finished')}{failed > 0 ? ` (${failed} failed)` : ''}{' '}{tr('— Ready for score review')}
              </h2>
              <p className="max-w-2xl text-[13px] text-muted">
                {tr('Click any team below to open the Judge Workspace, inspect the cited files, override any criterion score you disagree with, and then publish the final standings. Participants see nothing until you publish.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {submissions[0] && (
                <Link to={`/org/events/${event.id}/s/${submissions[0].id}`} className={linkButtonSecondary}>
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  <span>{tr('Calibrate in Judge Workspace')}</span>
                </Link>
              )}
              <Button
                disabled={!!busy} loading={busy === 'publish'}
                onClick={() =>
                  void act(
                    'publish',
                    `/api/events/${event.id}/publish`,
                    tr('Results are published. Participants can see them now.'),
                  )
                }
              >
                <span className="material-symbols-outlined text-[17px]">verified</span>
                <span>{busy === 'publish' ? tr('Publishing…') : tr('Publish results')}</span>
              </Button>
            </div>
          </div>
        )}

        {event.status === 'published' && (
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[24px] text-good">verified</span>
              <div>
                <h2 className="font-serif-heading text-[20px] font-medium text-ink">
                  {tr('Official standings are published')}
                </h2>
                <p className="text-[13px] text-muted">
                  {tr('Published')}{' '}{event.published_at ? formatDate(event.published_at) : ''}{tr('. Participants can now inspect their rubric breakdown, feedback, and leaderboard rank.')}
                </p>
              </div>
            </div>
            <Link to={`/e/${event.slug}`} className={linkButtonSecondary}>
              {tr('View Public Leaderboard →')}
            </Link>
          </div>
        )}
      </section>

      {/* 4. Invite-Only Allowlist */}
      {event.visibility === 'invite' && <Allowlist eventId={event.id} />}

      {canManage && event.status !== 'draft' && <JudgeAssignments eventId={event.id} submissions={submissions} />}

      {/* 5. Possible Duplicates / Forensic Similarity Signals */}
      {data.similarity_flags.length > 0 && (
        <NumberedSectionCard
          number="FS"
          icon="warning"
          title={tr('Forensic Similarity & Duplicate Signals')}
          subtitle={tr('These are automated signals for human judges to inspect, not automatic disqualifications.')}
          sectionTag={tr('{n} SIGNALS DETECTED', { n: data.similarity_flags.length })}
          theme="warn"
        >
          <ul className="space-y-2.5">
            {data.similarity_flags.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-warn/30 bg-warn-soft/35 p-3 text-[13px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">{SIMILARITY_SIGNAL_LABEL[f.signal]}</Badge>
                  <Link
                    to={`/org/events/${event.id}/s/${f.submission_a}`}
                    className="font-semibold text-ink hover:text-accent hover:underline"
                  >
                    {teamName(f.submission_a)}
                  </Link>
                  <span className="text-muted">↔</span>
                  <Link
                    to={`/org/events/${event.id}/s/${f.submission_b}`}
                    className="font-semibold text-ink hover:text-accent hover:underline"
                  >
                    {teamName(f.submission_b)}
                  </Link>
                  {f.explanation && <span className="font-mono-code text-[12px] text-muted">· {f.explanation}</span>}
                </div>
                <div className="flex items-center gap-2.5">
                  <Link
                    to={`/org/events/${event.id}/compare?a=${f.submission_a}&b=${f.submission_b}&flag=${f.id}`}
                    className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-warn/40 bg-surface px-2.5 py-1 text-[11px] font-semibold text-warn hover:bg-warn hover:text-on-warn"
                  >
                    <span>{tr('Compare Side-by-Side')}</span>
                    <span>→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </NumberedSectionCard>
      )}

      {/* 6. Submissions & Official Leaderboard Table */}
      <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
        <SectionHeader
          eyebrow={ranked ? tr('RANKED RESULTS') : tr('LIVE SUBMISSIONS')}
          eyebrowTone="accent"
          title={ranked ? tr('Leaderboard & Adjudication Docket') : tr('Cohort Submissions')}
          subtitle={tr('Click any team to open the 3-column Judge Workspace with full repository analysis, rubric sliders, and voice defense evidence.')}
          rightSlot={
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[16px] text-muted">
                search
              </span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Filter team, author, SHA…')}
                className="h-9 w-56 bg-paper pl-8 text-[12px]"
              />
            </div>
          }
        />

        {filteredSubmissions.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-[14px] font-semibold text-ink">{submissions.length === 0 ? tr('No submissions yet') : tr('No submissions match your search')}</p>
            <p className="mx-auto max-w-md text-[13px] text-muted">
              {submissions.length === 0
                ? event.status === 'draft'
                  ? tr('Open the event so participants can join and submit their repositories.')
                  : tr('Share the event link: participants join and submit a GitHub repository before the deadline.')
                : tr('Clear the search to see every submission.')}
            </p>
            {submissions.length === 0 && event.status !== 'draft' && (
              <div className="flex justify-center">
                <CopyLinkButton value={link} label={tr('Copy event link')} />
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[4px] border border-line">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                <tr>
                  {ranked && <th className="px-4 py-3">#</th>}
                  <th className="px-4 py-3">{tr('Team & Author')}</th>
                  <th className="px-4 py-3">{tr('Repository & Commit')}</th>
                  <th className="px-4 py-3">{tr('Pipeline Status')}</th>
                  <th className="px-4 py-3 text-right">{tr('Rubric Score')}</th>
                  {event.interviews_enabled && <th className="px-4 py-3 text-right">{tr('Ownership')}</th>}
                  <th className="px-4 py-3 text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((s, i) => {
                  const repo = s.current_version?.repos;
                  const working = s.status === 'queued' || s.status === 'analyzing';
                  const latest = latestStep(s.activity);
                  const expanded = openSteps.has(s.id);
                  const waitingRetry = s.status === 'queued' && !!s.next_attempt_at;

                  return (
                    <Fragment key={s.id}>
                      <tr
                        className={`audit-table-row transition-colors ${
                          expanded ? 'border-b-0 bg-paper/40' : 'border-b border-line last:border-0'
                        }`}
                      >
                        {ranked && (
                          <td className="font-serif-heading px-4 py-3.5 text-[18px] font-bold text-ink tabular-nums">
                            {s.total != null ? `#${String(i + 1).padStart(2, '0')}` : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <Link
                            to={`/org/events/${event.id}/s/${s.id}`}
                            className="font-semibold text-ink hover:text-accent hover:underline"
                          >
                            {s.team_name}
                          </Link>
                          <div className="font-mono-code text-[11px] text-muted">{s.submitted_by_name}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {repo && (
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono-code text-[12px] text-accent hover:underline"
                              >
                                {repo.owner}/{repo.name}
                              </a>
                            )}
                            {s.locked_commit_sha && (
                              <code className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink">
                                @{s.locked_commit_sha.slice(0, 7)}
                              </code>
                            )}
                            {flagged.has(s.id) && <Badge tone="warn">{tr('Check')}</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}
                              dot={working}
                            >
                              {SUBMISSION_STATUS_LABEL[s.status as SubmissionPipelineStatus]}
                            </Badge>
                            {s.step_count > 0 && (
                              <button
                                type="button"
                                className="font-mono-code cursor-pointer text-[11px] font-semibold text-accent hover:underline"
                                aria-expanded={expanded}
                                onClick={() => toggleSteps(s.id)}
                              >
                                {expanded ? tr('Hide steps') : tr('View {n} steps', { n: s.step_count })}
                              </button>
                            )}
                          </div>
                          {s.status === 'error' && s.error && (
                            <div className="mt-1 max-w-xs text-[12px] text-bad">{s.error}</div>
                          )}
                          {waitingRetry && s.error && (
                            <div className="mt-1 max-w-xs text-[12px] text-warn">{s.error}</div>
                          )}
                          {working && !waitingRetry && (
                            <div className="font-mono-code mt-1 max-w-xs text-[11px] text-muted">
                              {latest ? (
                                <>
                                  {tr('Step')}{' '}{s.step_count}: {latest.text}
                                </>
                              ) : s.status === 'queued' ? (
                                tr('Waiting for a free slot. Submissions are judged a few at a time.')
                              ) : (
                                tr('Starting…')
                              )}
                            </div>
                          )}
                          {s.status === 'scored' && s.models_used && s.models_used.length > 0 && (
                            <div className="font-mono-code mt-1 text-[11px] text-muted">
                              {s.models_used.map(modelName).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {s.total != null ? (
                            <Badge tone={scoreTone(s.total, 100)}>{s.total.toFixed(1)}</Badge>
                          ) : (
                            <span className="font-mono-code text-muted">–</span>
                          )}
                        </td>
                        {event.interviews_enabled && (
                          <td className="px-4 py-3.5 text-right">
                            {s.ownership ? (
                              <Badge tone={scoreTone(s.ownership.score, 100)}>{s.ownership.score}</Badge>
                            ) : (
                              <span className="font-mono-code text-muted">–</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canManage && (
                              <SubmissionJudgingControls
                                id={s.id}
                                name={s.team_name}
                                status={s.status}
                                frozen={!!s.locked_commit_sha}
                                busy={busy}
                                act={(key, path, success, confirmText) => void act(key, path, success, confirmText)}
                                compact
                              />
                            )}
                            <Link
                              to={`/org/events/${event.id}/s/${s.id}`}
                              className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[4px] border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                            >
                              <span>{tr('Judge')}</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-line bg-paper/30 last:border-0">
                          <td
                            colSpan={5 + (ranked ? 1 : 0) + (event.interviews_enabled ? 1 : 0)}
                            className="px-4 pb-4"
                          >
                            <AiActivity entries={s.activity} live={working} maxHeight="18rem" />
                            <Link
                              to={`/org/events/${event.id}/s/${s.id}`}
                              className="font-mono-code mt-2 inline-block text-[11px] font-semibold text-accent hover:underline"
                            >
                              {tr('Open the Judge Workspace for the full history and the AI\'s reasoning →')}
                            </Link>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LedgerAnchorBanner
        badge={tr('COMMIT-LOCKED AUDIT')}
        meta={tr('EVENT ID: {id} // {n} RUBRIC VECTORS', { id: event.id.slice(0, 8).toUpperCase(), n: event.rubric_json.length })}
        title={tr('Frozen Commits & Override Trail')}
        description={tr('Every AI score includes cited repository files, and every manual judge override is tracked with user attribution and timestamp.')}
      />
    </div>
  );
}
