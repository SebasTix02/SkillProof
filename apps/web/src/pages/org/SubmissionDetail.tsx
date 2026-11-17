import { weightedTotal, type ActivityEntry, type CommitProfile, type RepoMap, type Rubric } from '@skillproof/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../../components/AiActivity';
import { one } from '../../components/Report';
import {
  Badge,
  Button,
  CommandConsoleHeader,
  Input,
  LiveDot,
  Notice,
  PageState,
  ScoreBar,
  Select,
  Spinner,
  formatDate,
  linkButton,
  linkButtonSecondary,
  scoreTone,
} from '../../components/shared';
import { JudgeReviewCard, JudgeReviewsList } from '../../components/JudgeReview';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL, type EventView, type Feedback, type ScoreView, type VersionView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

interface DetailResponse {
  primary_models?: string[];
  submission: {
    id: string;
    team_name: string;
    status: string;
    error: string | null;
    activity_json: ActivityEntry[] | null;
    models_used: string[] | null;
    locked_commit_sha: string | null;
    locked_at: string | null;
    next_attempt_at?: string | null;
    judge_attempts?: number;
    events: { id: string; name: string; rubric_json: Rubric; status: EventView['status'] };
    repo_analyses: Analysis | Analysis[] | null;
    submission_versions: VersionView[];
  };
  scores: ScoreView[];
  feedback: Feedback | null;
  interview: { id: string; status: string } | null;
}

interface QueueSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error';
  locked_commit_sha: string | null;
  total: number | null;
  ownership: { score: number; confidence: string } | null;
}

interface QueueResponse {
  event: EventView;
  submissions: QueueSubmission[];
}

interface AssignmentRow {
  submission_id: string;
  submissions: { team_name: string; status: QueueSubmission['status']; locked_commit_sha: string | null } | null;
  my_review: { status: 'draft' | 'submitted'; updated_at: string } | null;
}

function ScoreCalibrationRow({
  index,
  score,
  criterion,
  repoUrl,
  sha,
  canOverride,
  onSaved,
}: {
  index: number;
  score: ScoreView;
  criterion: Rubric[number] | undefined;
  repoUrl: string | null;
  sha: string | null;
  canOverride: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const effective = score.override_score ?? score.ai_score;
  const isOverridden = score.override_score != null;

  async function save(value: string) {
    setBusy(true);
    try {
      await api(`/api/scores/${score.id}`, {
        method: 'PATCH',
        body: { override_score: value === '' ? null : Number(value) },
      });
      toast.success(
        value === '' ? 'Back to the AI score.' : `Score changed to ${value}. The total is updated.`,
      );
      onSaved();
    } catch (err) {
      toast.error(`The score was not saved. ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`space-y-2.5 rounded-[4px] border p-3.5 transition-colors ${
        isOverridden ? 'border-accent/40 bg-accent-soft/35' : 'border-line bg-paper/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono-code text-[11px] font-bold text-ink">
            {index + 1}. {criterion?.name ?? score.criterion_key}
          </span>
          {criterion && (
            <span className="font-mono-code text-[10px] text-muted">({criterion.weight}%)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-code rounded-[3px] border border-line bg-white px-1.5 py-0.5 text-[10px] text-muted">
            AI: {score.ai_score ?? '–'}
          </span>
          <Badge tone={scoreTone(effective)}>{effective ?? '–'}/10</Badge>
          {isOverridden && <Badge tone="accent">Changed by you</Badge>}
        </div>
      </div>

      {canOverride && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              disabled={busy}
              value={effective ?? 5}
              onChange={(e) => void save(e.target.value)}
              aria-label={`Slider for ${criterion?.name ?? score.criterion_key}`}
              className="h-1.5 w-full cursor-pointer accent-accent"
            />
            <Select
              aria-label={`Your score for ${criterion?.name ?? score.criterion_key}`}
              className="font-mono-code h-8 w-auto bg-white px-2 py-1 text-[11px] font-bold"
              disabled={busy}
              value={score.override_score ?? ''}
              onChange={(e) => void save(e.target.value)}
            >
              <option value="">Keep AI ({score.ai_score ?? '–'})</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} / 10
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-muted">{score.justification}</p>

      {score.evidence_json.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
          <span className="font-mono-code text-[10px] text-muted uppercase">Evidence:</span>
          {score.evidence_json.map((path) =>
            repoUrl && sha ? (
              <a
                key={path}
                href={`${repoUrl}/blob/${sha}/${path}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono-code rounded-[2px] border border-line bg-white px-1.5 py-0.5 text-[11px] text-accent hover:underline"
              >
                {path}
              </a>
            ) : (
              <code
                key={path}
                className="font-mono-code rounded-[2px] border border-line bg-white px-1.5 py-0.5 text-[11px] text-ink"
              >
                {path}
              </code>
            ),
          )}
        </div>
      )}
    </li>
  );
}

export function SubmissionDetail() {
  const { id, sid } = useParams();
  const navigate = useNavigate();
  const { org, me } = useAuth();
  const toast = useToast();
  const [rejudging, setRejudging] = useState(false);
  const [queueSearch, setQueueSearch] = useState('');
  const [activeCriterionIdx, setActiveCriterionIdx] = useState(0);

  const { data, error, loading, reload } = useLoad<DetailResponse>(
    `/api/submissions/${sid}`,
    (d) => d.submission.status === 'queued' || d.submission.status === 'analyzing',
  );
  // Organizers see every submission of the event; a judge sees only the ones assigned to them.
  const isManager = !!org?.permissions.includes('event.manage');
  const canReview = !!org?.permissions.includes('submission.review');
  const consoleData = useLoad<QueueResponse>(id && isManager ? `/api/events/${id}/console` : null);
  const assignmentData = useLoad<{ assignments: AssignmentRow[] }>(id && !isManager ? `/api/me/assignments?event_id=${id}` : null);

  const queue: QueueSubmission[] = isManager
    ? (consoleData.data?.submissions ?? [])
    : (assignmentData.data?.assignments ?? []).map((a) => ({
        id: a.submission_id,
        team_name: a.submissions?.team_name ?? 'Submission',
        submitted_by_name: a.my_review ? (a.my_review.status === 'submitted' ? 'Review submitted' : 'Draft saved') : 'Not reviewed yet',
        status: a.submissions?.status ?? 'submitted',
        locked_commit_sha: a.submissions?.locked_commit_sha ?? null,
        total: null,
        ownership: null,
      }));
  const queueLoading = isManager ? consoleData.loading : assignmentData.loading;
  const currentQueueIndex = useMemo(() => queue.findIndex((q) => q.id === sid), [queue, sid]);
  const prevSub = currentQueueIndex > 0 ? queue[currentQueueIndex - 1] : null;
  const nextSub =
    currentQueueIndex >= 0 && currentQueueIndex < queue.length - 1 ? queue[currentQueueIndex + 1] : null;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        !target ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === 'j' || e.key === 'J') {
        if (nextSub && id) navigate(`/org/events/${id}/s/${nextSub.id}`);
      } else if (e.key === 'k' || e.key === 'K') {
        if (prevSub && id) navigate(`/org/events/${id}/s/${prevSub.id}`);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [id, navigate, nextSub, prevSub]);

  const filteredQueue = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter(
      (item) =>
        item.team_name.toLowerCase().includes(q) ||
        item.submitted_by_name.toLowerCase().includes(q) ||
        (item.locked_commit_sha?.toLowerCase().includes(q) ?? false),
    );
  }, [queue, queueSearch]);

  if (!data) return <PageState loading={loading} error={error} />;
  const { submission: sub, scores, feedback } = data;

  async function rejudge() {
    setRejudging(true);
    try {
      await api(`/api/submissions/${sub.id}/rejudge`, { method: 'POST' });
      toast.success('Judging again. The steps appear below as the AI works.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRejudging(false);
    }
  }

  const rubric = sub.events.rubric_json;
  const analysis = one(sub.repo_analyses);
  const versions = [...sub.submission_versions].sort((a, b) => b.version_no - a.version_no);
  const current = versions[0];
  const repoUrl = current?.repos.url ?? null;
  const sha = sub.locked_commit_sha;

  const total = weightedTotal(rubric, scores);
  const aiTotal = weightedTotal(
    rubric,
    scores.map((s) => ({ ...s, override_score: null })),
  );
  const delta = total != null && aiTotal != null ? +(total - aiTotal).toFixed(2) : 0;

  const canOverride = !!org?.permissions.includes('score.override') && sub.events.status === 'review';
  const ordered = rubric.flatMap((c) => scores.filter((s) => s.criterion_key === c.key));
  const map = analysis?.map_json;
  const commits = analysis?.commit_profile_json;
  const activity = sub.activity_json ?? [];
  const working = sub.status === 'queued' || sub.status === 'analyzing';
  const models = sub.models_used?.length ? sub.models_used : analysis?.model ? [analysis.model] : [];

  const scoredInQueue = queue.filter((q) => q.status === 'scored').length;
  const queueProgressPct = queue.length > 0 ? Math.round((scoredInQueue / queue.length) * 100) : 100;
  const activeCriterion = rubric[activeCriterionIdx] ?? rubric[0];
  const activeScore = activeCriterion ? scores.find((s) => s.criterion_key === activeCriterion.key) : undefined;

  return (
    <div className="space-y-6">
      {/* 1. Top Command Header & Docket Banner with Live Telemetry */}
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <Link to={`/org/events/${id}`} className="font-semibold text-[#93B4FF] hover:underline">
              ← {sub.events.name.toUpperCase()}
            </Link>
            <span>//</span>
            <span>DOCKET #{sub.id.slice(0, 8).toUpperCase()}</span>
            <span>//</span>
            <span className="inline-flex items-center gap-1.5 text-[#79d9ae]">
              <LiveDot tone="mint" pulse={working} />
              <span>{STATUS_LABEL[sub.events.status].toUpperCase()}</span>
            </span>
          </>
        }
        statusChips={
          <div className="flex items-center gap-2 rounded-[4px] border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-[#79d9ae]" />
            <span className="font-medium text-white">{me?.profile.display_name || 'Judge'}</span>
            {me?.email && <span className="text-white/50">({me.email})</span>}
            <span className="text-white/30">|</span>
            <span className="text-[#93B4FF] uppercase">
              {(org?.roles ?? ['judge']).join(', ')}
            </span>
          </div>
        }
        eyebrowBadge={`SUBMISSION ${currentQueueIndex >= 0 ? `#${currentQueueIndex + 1} OF ${queue.length}` : 'DOSSIER'}`}
        eyebrowMeta={sha ? `FROZEN AT COMMIT @${sha.slice(0, 7)}` : 'AWAITING COMMIT FREEZE'}
        title={sub.team_name}
        subtitle={
          current
            ? `Repository: ${current.repos.owner}/${current.repos.name}${
                analysis ? ` · ${analysis.file_count} source files analyzed` : ''
              }`
            : 'Inspecting project submission, AI rubric evidence, and oral verification status.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {prevSub && (
              <Link
                to={`/org/events/${id}/s/${prevSub.id}`}
                className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>Prev ({prevSub.team_name.slice(0, 14)})</span>
              </Link>
            )}
            {nextSub && (
              <Link
                to={`/org/events/${id}/s/${nextSub.id}`}
                className={`${linkButton} font-mono-code px-3.5 py-1.5 text-[11px]`}
              >
                <span>Next ({nextSub.team_name.slice(0, 14)})</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </Link>
            )}
          </div>
        }
        footerSlot={
          queue.length > 0 ? (
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div className="max-w-xl flex-1 space-y-1.5">
                <div className="font-mono-code flex items-center justify-between text-[11px]">
                  <span className="text-white/80">
                    <strong className="text-white">{scoredInQueue}</strong> of{' '}
                    <strong className="text-white">{queue.length}</strong> Cohort Submissions Scored
                  </span>
                  <span className="font-semibold text-[#93B4FF]">{queueProgressPct}% Complete</span>
                </div>
                <ScoreBar
                  value={queueProgressPct}
                  max={100}
                  tone="accent"
                  heightClass="h-1.5"
                  trackClass="bg-white/10"
                />
              </div>
              <div className="font-mono-code text-[11px] text-white/60">
                {canOverride
                  ? 'CALIBRATION MODE ACTIVE: Override any criterion score on the right.'
                  : `EVENT STATUS: ${STATUS_LABEL[sub.events.status].toUpperCase()}`}
              </div>
            </div>
          ) : undefined
        }
      />

      {/* Error & Status Notices */}
      {sub.status === 'error' && (
        <Notice tone="error">
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex-1">{sub.error || 'This submission could not be judged.'}</span>
            {sha && (
              <Button variant="secondary" disabled={rejudging} onClick={() => void rejudge()}>
                {rejudging ? 'Queuing…' : 'Judge again'}
              </Button>
            )}
          </span>
        </Notice>
      )}
      {!sha && (
        <Notice>
          This submission is judged when the event closes. Until then the participant can still send new versions.
        </Notice>
      )}

      {/* 2. 3-Column Ergonomic Workspace Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* PANEL 1: Assigned Submissions Queue (Left Rail, 3 Cols) */}
        <aside className="flex flex-col gap-3.5 rounded-[6px] border border-line bg-white p-4 lg:col-span-3">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
                Assigned Queue
              </span>
            </div>
            <span className="font-mono-code rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
              {queue.length} {isManager ? 'Submissions' : 'Assigned'}
            </span>
          </div>

          <div className="relative">
            <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[15px] text-muted">
              search
            </span>
            <Input
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
              placeholder="Filter by team or hash..."
              className="h-8 bg-paper pl-8 text-[12px]"
            />
          </div>

          <nav aria-label="Review Queue" className="flex max-h-[600px] flex-col gap-2 overflow-y-auto pr-0.5">
            {filteredQueue.length > 0 ? (
              filteredQueue.map((item, idx) => {
                const isActive = item.id === sub.id;
                return (
                  <Link
                    key={item.id}
                    to={`/org/events/${id}/s/${item.id}`}
                    className={`flex flex-col gap-1.5 rounded-[4px] border p-3 transition-colors ${
                      isActive
                        ? 'border-2 border-accent bg-accent-soft/45'
                        : 'border-line bg-paper/45 hover:border-muted hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-[13px] ${
                          isActive ? 'font-bold text-ink' : 'font-semibold text-ink'
                        }`}
                      >
                        {item.team_name}
                      </span>
                      {isActive ? (
                        <span className="font-mono-code rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
                          ACTIVE
                        </span>
                      ) : item.total != null ? (
                        <span className="font-mono-code rounded-[2px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good">
                          {item.total.toFixed(1)}
                        </span>
                      ) : (
                        <span className="font-mono-code rounded-[2px] bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                          --.-
                        </span>
                      )}
                    </div>
                    <div className="font-mono-code flex items-center justify-between text-[10px] text-muted">
                      <span>
                        #{String(idx + 1).padStart(2, '0')}{' '}
                        {item.locked_commit_sha ? `• @${item.locked_commit_sha.slice(0, 7)}` : ''}
                      </span>
                      <span
                        className={
                          item.status === 'scored'
                            ? 'font-semibold text-good'
                            : item.status === 'error'
                              ? 'font-semibold text-bad'
                              : 'text-warn'
                        }
                      >
                        {item.status === 'scored' ? 'Scored' : item.status}
                      </span>
                    </div>
                  </Link>
                );
              })
            ) : queueLoading ? (
              <p className="py-3 text-center text-[12px] text-muted">Loading the queue…</p>
            ) : !isManager && queue.length === 0 ? (
              <p className="rounded-[4px] border border-line bg-paper p-3 text-[12px] text-muted">
                No submissions of this event are assigned to you yet. An organizer assigns them from the event console.
              </p>
            ) : (
              <div className="rounded-[4px] border border-accent bg-accent-soft/40 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-ink">{sub.team_name}</span>
                  <span className="font-mono-code rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">
                    ACTIVE
                  </span>
                </div>
                {sha && <div className="font-mono-code mt-1 text-[10px] text-muted">@{sha.slice(0, 7)}</div>}
              </div>
            )}
          </nav>

          <div className="font-mono-code rounded-[4px] border border-line bg-paper p-3 text-[11px] text-muted">
            <div className="flex items-center justify-between font-semibold text-ink">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-accent">keyboard</span>
                <span>Queue Navigation</span>
              </span>
              <span className="text-good">J / K Ready</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              Press <kbd className="rounded border border-line bg-white px-1">J</kbd> or{' '}
              <kbd className="rounded border border-line bg-white px-1">K</kbd> to jump between cohort dossiers.
            </p>
          </div>
        </aside>

        {/* PANEL 2: Center Inspection Workspace (Forensic Artifacts, 5 Cols) */}
        <section className="flex flex-col gap-5 lg:col-span-5">
          {/* Submission Profile & Repo Map Card */}
          <div className="space-y-4 rounded-[6px] border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
                  Submission ID: #{sub.id.slice(0, 8).toUpperCase()}
                </span>
                <h2 className="font-serif-heading text-[24px] leading-tight font-medium text-ink">
                  {sub.team_name}
                </h2>
                {sub.locked_at && (
                  <span className="font-mono-code text-[11px] text-muted">
                    Frozen on {formatDate(sub.locked_at)}
                  </span>
                )}
              </div>
              <Badge tone={sub.status === 'scored' ? 'good' : sub.status === 'error' ? 'bad' : 'accent'} dot={working}>
                {sub.status.toUpperCase()}
              </Badge>
            </div>

            <div className="font-mono-code grid grid-cols-1 gap-2.5 border-t border-line pt-3 text-[12px] sm:grid-cols-2">
              <div className="rounded-[4px] border border-line bg-paper p-2.5">
                <span className="block text-[10px] font-semibold text-muted uppercase">Repository Tree</span>
                {current ? (
                  <a
                    href={current.repos.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 block truncate font-semibold text-accent hover:underline"
                  >
                    {current.repos.owner}/{current.repos.name}
                  </a>
                ) : (
                  <span className="mt-0.5 block text-muted">—</span>
                )}
              </div>
              <div className="rounded-[4px] border border-line bg-paper p-2.5">
                <span className="block text-[10px] font-semibold text-muted uppercase">Audited Commit</span>
                <span className="mt-0.5 block font-semibold text-ink">
                  {sha ? sha.slice(0, 12) : 'Pending freeze'}
                  {analysis ? ` (${analysis.file_count} files)` : ''}
                </span>
              </div>
            </div>

            {/* Architecture & Complexity Signals */}
            {map && (
              <div className="space-y-3 border-t border-line pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {[...map.stack.languages, ...map.stack.frameworks, ...map.stack.services].map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                  <Badge tone={map.complexity_signals.has_tests ? 'good' : 'neutral'}>
                    {map.complexity_signals.has_tests ? 'Has tests' : 'No tests'}
                  </Badge>
                  <Badge tone={map.complexity_signals.has_ci ? 'good' : 'neutral'}>
                    {map.complexity_signals.has_ci ? 'Has CI' : 'No CI'}
                  </Badge>
                </div>

                {/* Forensic Pre-Screening Summary Box */}
                <div className="space-y-1.5 rounded-[4px] border border-good/30 bg-good-soft/45 p-3.5">
                  <div className="font-mono-code flex items-center justify-between text-[11px] font-bold text-good">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">security</span>
                      <span>What the Project Is (AI Repo Map)</span>
                    </span>
                    {commits && (
                      <span className="rounded-[2px] border border-good/30 bg-white px-1.5 py-0.2 text-[10px]">
                        {commits.total_commits} commits · {commits.authors.length} author
                        {commits.authors.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] leading-relaxed text-ink">{map.summary}</p>
                  {commits?.commits_before_start != null && commits.commits_before_start > 0 && (
                    <p className="font-mono-code text-[11px] font-semibold text-warn">
                      ⚠ {commits.commits_before_start} commit{commits.commits_before_start === 1 ? '' : 's'} authored
                      before the event started.
                    </p>
                  )}
                </div>

                {map.key_decisions.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
                      Key Architectural Decisions
                    </h3>
                    <ul className="space-y-1.5 text-[12px]">
                      {map.key_decisions.map((d, i) => (
                        <li key={i} className="rounded-[4px] border border-line bg-paper/60 p-2.5">
                          <span className="font-semibold text-ink">{d.decision}</span>{' '}
                          <span className="text-muted">— {d.rationale}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {map.weaknesses.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
                      Weak Points &amp; Risks
                    </h3>
                    <ul className="space-y-1.5 text-[12px]">
                      {map.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 rounded-[4px] border border-line bg-paper/40 p-2">
                          <Badge
                            tone={w.severity === 'high' ? 'bad' : w.severity === 'medium' ? 'warn' : 'neutral'}
                          >
                            {w.severity}
                          </Badge>
                          <span className="text-ink">{w.issue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Syntactic Rubric Evidence Explorer */}
          {rubric.length > 0 && ordered.length > 0 && (
            <div className="overflow-hidden rounded-[6px] border border-line bg-white">
              <div className="font-mono-code flex items-center overflow-x-auto border-b border-line bg-paper text-[11px]">
                {rubric.map((c, idx) => {
                  const active = idx === activeCriterionIdx;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setActiveCriterionIdx(idx)}
                      className={`cursor-pointer border-b-2 px-3.5 py-2.5 whitespace-nowrap transition-colors ${
                        active
                          ? 'border-accent bg-white font-bold text-accent'
                          : 'border-transparent text-muted hover:bg-white/60 hover:text-ink'
                      }`}
                    >
                      {String(idx + 1).padStart(2, '0')}. {c.name} ({c.weight}%)
                    </button>
                  );
                })}
              </div>

              <div className="font-mono-code flex items-center justify-between bg-[#0F141C] px-4 py-2 text-[11px] text-white/80">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[15px] text-[#93B4FF]">code</span>
                  <span className="font-semibold text-white">
                    {activeScore?.evidence_json[0] ?? activeCriterion?.name ?? 'Criterion Evidence'}
                  </span>
                </div>
                <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-[#79d9ae]">
                  SCORE: {activeScore?.override_score ?? activeScore?.ai_score ?? '–'} / 10
                </span>
              </div>

              <div className="space-y-3 bg-[#0D1117] p-4 text-[12px] text-white/85">
                <p className="leading-relaxed text-white/90">
                  {activeScore?.justification || 'No justification recorded for this criterion.'}
                </p>
                {activeScore && activeScore.evidence_json.length > 0 && (
                  <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                    <span className="font-mono-code block text-[10px] text-white/50 uppercase">
                      Cited Repository Files (Click to inspect at frozen commit):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {activeScore.evidence_json.map((path) =>
                        repoUrl && sha ? (
                          <a
                            key={path}
                            href={`${repoUrl}/blob/${sha}/${path}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-white/15 bg-white/10 px-2 py-1 text-[11px] text-[#93B4FF] hover:bg-white/20 hover:underline"
                          >
                            <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                            <span>{path}</span>
                          </a>
                        ) : (
                          <code
                            key={path}
                            className="font-mono-code rounded-[3px] border border-white/15 bg-white/10 px-2 py-1 text-[11px] text-white"
                          >
                            {path}
                          </code>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Oral Verification Evidence Card */}
          {data.interview && (
            <div className="space-y-3 rounded-[6px] border border-[#C7D2FE] bg-[#EEF2FF]/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono-code flex items-center gap-2 text-[11px] font-bold text-[#3730A3] uppercase">
                  <span className="material-symbols-outlined text-[18px] text-accent">record_voice_over</span>
                  <span>Oral Verification Defense</span>
                </div>
                <Badge tone={data.interview.status === 'completed' ? 'good' : 'accent'}>
                  {data.interview.status.toUpperCase()}
                </Badge>
              </div>
              <p className="text-[13px] text-ink">
                This participant {data.interview.status === 'completed' ? 'completed' : 'started'} a 3-minute voice
                interview defending this repository.
              </p>
              <div>
                <Link to={`/interview/${data.interview.id}`} className={linkButtonSecondary}>
                  <span className="material-symbols-outlined text-[16px]">description</span>
                  <span>Open Oral Defense Dossier →</span>
                </Link>
              </div>
            </div>
          )}

          {/* How the AI Judged It (Activity & Reasoning) */}
          {(activity.length > 0 || working || models.length > 0) && (
            <div className="space-y-3 rounded-[6px] border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                <h2 className="font-serif-heading text-[20px] font-medium text-ink">How the AI Judged It</h2>
                {working && <Spinner label={sub.status === 'queued' ? 'Waiting to start' : 'Working'} />}
              </div>
              {models.length > 0 && (
                <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <span>MODELS USED:</span>
                  <ModelsUsed models={models} primary={data.primary_models} />
                </div>
              )}
              {sub.status === 'queued' && sub.next_attempt_at && sub.error && (
                <Notice tone="warn">{sub.error}</Notice>
              )}
              {activity.length > 0 ? (
                <AiActivity entries={activity} live={working} />
              ) : (
                working && (
                  <p className="text-[13px] text-muted">
                    The steps appear here as the AI works. This page updates on its own.
                  </p>
                )
              )}
            </div>
          )}

          {/* Feedback the Team Will Receive */}
          {feedback && (
            <div className="space-y-3 rounded-[6px] border border-line bg-white p-5">
              <h2 className="font-serif-heading text-[20px] font-medium text-ink">
                Feedback the Team Will Receive
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink">
                {feedback.strengths_json.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <ul className="space-y-2 text-[13px]">
                {feedback.improvements_json.map((f, i) => (
                  <li key={i} className="rounded-[4px] border border-line bg-paper/60 p-3">
                    <p className="font-medium text-ink">{f.what}</p>
                    <p className="font-mono-code text-[11px] text-accent">{f.where}</p>
                    <p className="mt-1 text-[12px] text-muted">Next step: {f.next_step}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Versions Sent */}
          <div className="space-y-3 rounded-[6px] border border-line bg-white p-5">
            <h2 className="font-serif-heading text-[20px] font-medium text-ink">Versions Sent</h2>
            <ol className="space-y-2.5 text-[13px]">
              {versions.map((v, i) => (
                <li key={v.id} className="rounded-[4px] border border-line bg-paper/45 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-code font-semibold text-ink">Version {v.version_no}</span>
                    {i === 0 && <Badge tone="accent">{sha ? 'Judged' : 'Latest'}</Badge>}
                    <span className="font-mono-code text-[11px] text-muted">{formatDate(v.created_at)}</span>
                  </div>
                  {v.description && <p className="mt-2 whitespace-pre-line text-muted">{v.description}</p>}
                  <p className="font-mono-code mt-2 flex flex-wrap gap-3 text-[12px]">
                    <a
                      href={v.repos.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-accent hover:underline"
                    >
                      Repository ↗
                    </a>
                    {v.video_url && (
                      <a
                        href={v.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-accent hover:underline"
                      >
                        Demo video ↗
                      </a>
                    )}
                    {v.slides_url && (
                      <a
                        href={v.slides_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-accent hover:underline"
                      >
                        Slides ↗
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* PANEL 3: Right Adjudication & Scoring Cockpit (4 Cols, Sticky) */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-4">
          <div className="space-y-4 rounded-[6px] border border-line bg-white p-5">
            <div className="space-y-1 border-b border-line pb-3">
              <div className="flex items-center justify-between">
                <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                  Adjudication &amp; Calibration
                </h2>
                <Badge tone={canOverride ? 'accent' : 'neutral'}>
                  {canOverride ? 'OVERRIDE READY' : STATUS_LABEL[sub.events.status]}
                </Badge>
              </div>
              <p className="text-[12px] text-muted">
                {canOverride
                  ? 'Each score comes with the reason and the files behind it. Change any score you disagree with; the total updates right away.'
                  : sub.events.status === 'published'
                    ? 'Results are published, so scores can no longer be changed.'
                    : 'Each score comes with the reason and the files behind it.'}
              </p>
            </div>

            {/* Baseline Metrics */}
            <div className="font-mono-code grid grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded-[4px] border border-line bg-paper p-3">
                <span className="block text-[10px] font-semibold text-muted uppercase">AI Baseline</span>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-[20px] font-bold text-ink">
                    {aiTotal != null ? aiTotal.toFixed(1) : '—'}
                  </span>
                  <span className="text-[11px] text-muted">/ 100</span>
                </div>
              </div>

              <div className="rounded-[4px] border border-good/30 bg-good-soft/50 p-3">
                <span className="block text-[10px] font-semibold text-good uppercase">Effective Total</span>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-[20px] font-bold text-good">
                    {total != null ? total.toFixed(1) : '—'}
                  </span>
                  <span className="text-[11px] text-good/80">/ 100</span>
                </div>
              </div>
            </div>

            {/* Rubric Score Calibration List */}
            {ordered.length > 0 ? (
              <ul className="space-y-3">
                {ordered.map((s, idx) => (
                  <ScoreCalibrationRow
                    key={s.id}
                    index={idx}
                    score={s}
                    criterion={rubric.find((c) => c.key === s.criterion_key)}
                    repoUrl={repoUrl}
                    sha={sha}
                    canOverride={canOverride}
                    onSaved={reload}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-[13px] text-muted">
                Scores will appear here as soon as the AI evaluation completes.
              </p>
            )}

            {/* Dynamic Adjusted Composite Banner */}
            {total != null && (
              <div className="flex items-center justify-between rounded-[4px] border border-accent/30 bg-accent-soft/55 p-3.5">
                <div>
                  <span className="font-mono-code block text-[10px] font-semibold tracking-wider text-muted uppercase">
                    Weighted Composite Score
                  </span>
                  <div className="mt-0.5 flex items-baseline gap-1">
                    <span className="font-serif-heading text-[28px] leading-none font-bold text-accent">
                      {total.toFixed(1)}
                    </span>
                    <span className="font-mono-code text-[12px] text-muted">/ 100</span>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono-code inline-block rounded-[3px] border px-2 py-0.5 text-[11px] font-bold ${
                      delta > 0
                        ? 'border-good/30 bg-good-soft text-good'
                        : delta < 0
                          ? 'border-warn/30 bg-warn-soft text-warn'
                          : 'border-line bg-white text-muted'
                    }`}
                  >
                    {delta > 0 ? `+${delta}` : delta} DELTA
                  </span>
                  <span className="font-mono-code mt-1 block text-[10px] text-muted">vs. AI baseline</span>
                </div>
              </div>
            )}

            {/* Navigation CTAs */}
            <div className="flex flex-col gap-2 pt-1">
              {nextSub && (
                <Link to={`/org/events/${id}/s/${nextSub.id}`} className={`${linkButton} w-full py-2.5`}>
                  <span>Proceed to Next ({nextSub.team_name})</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              )}
              <Link to={`/org/events/${id}`} className={`${linkButtonSecondary} w-full py-2`}>
                Return to Event Console
              </Link>
            </div>
          </div>

          {canReview && (!isManager || queue.length > 0) && (
            <JudgeReviewCard submissionId={sub.id} rubric={rubric} locked={sub.events.status === 'published'} />
          )}
          {isManager && <JudgeReviewsList submissionId={sub.id} rubric={rubric} />}

          {/* Keyboard Shortcut Pill Bar */}
          <div className="font-mono-code flex items-center justify-between rounded-[6px] border border-line bg-white p-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-semibold text-ink">J</kbd>
              <span>/</span>
              <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-semibold text-ink">K</kbd>
              <span>Navigate Queue</span>
            </span>
            <span>{canOverride ? 'Auto-saves on change' : 'Read-only mode'}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
