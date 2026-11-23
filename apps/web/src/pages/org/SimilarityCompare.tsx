import { tr, trn } from '../../i18n';
import { rich } from '../../i18n/rich';
import { MatchingCode } from '../../components/MatchingCode';
import type { CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { one } from '../../components/Report';
import {
  Badge,
  Button,
  CommandConsoleHeader,
  EditorialQuoteBlock,
  LiveDot,
  Notice,
  NumberedSectionCard,
  PageState,
  SIMILARITY_SIGNAL_LABEL,
  ScoreBar,
  Select,
  SeverityAlertBanner,
  Tabs,
  Textarea,
  TopAccentKpiCard,
  formatDate,
  linkButtonSecondary,
  scoreTone,
  type SimilaritySignal,
  VERDICT_LABEL,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { evidenceLink, evidenceTitle } from '../../lib/evidence';
import type { EventView, RepoRef, ScoreView, VersionView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: string;
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
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}

interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

interface SubmissionDetailPayload {
  submission: {
    id: string;
    team_name: string;
    status: string;
    locked_commit_sha: string | null;
    locked_at: string | null;
    events: { id: string; name: string; rubric_json: Rubric; status: string };
    repo_analyses: Analysis | Analysis[] | null;
    submission_versions: VersionView[];
  };
  scores: ScoreView[];
  interview: { id: string; status: string } | null;
}

type VerdictOption = 'direct_plagiarism' | 'collusion' | 'starter_template' | 'independent_invention';

interface IntegrityResponse {
  decisions: { id: string; flag_id: string | null; submission_id: string | null; verdict: string; note: string; created_at: string; profiles?: { display_name: string } | null }[];
  matches: { id: string; flag_id: string; path_a: string; start_a: number; end_a: number; path_b: string; start_b: number; end_b: number; score: number | string }[];
}

function SubmissionComparisonPane({
  side,
  summary,
  detail,
  rubric,
}: {
  side: 'A' | 'B';
  summary: ConsoleSubmission;
  detail: SubmissionDetailPayload | null;
  rubric: Rubric;
}) {
  const isA = side === 'A';
  const analysis = detail ? one(detail.submission.repo_analyses) : null;
  const map = analysis?.map_json;
  const commits = analysis?.commit_profile_json;
  const versions = detail
    ? [...detail.submission.submission_versions].sort((a, b) => b.version_no - a.version_no)
    : [];
  const current = versions[0];
  const repo = current?.repos ?? summary.current_version?.repos ?? null;
  const sha = summary.locked_commit_sha;

  return (
    <div className="flex flex-col overflow-hidden rounded-[6px] border border-line bg-surface">
      {/* Colored Header */}
      <div
        className={`space-y-2 border-b p-4 ${
          isA ? 'border-good/25 bg-good-soft/55' : 'border-bad/25 bg-bad-soft/55'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono-code rounded-[3px] px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-good uppercase ${
                isA ? 'bg-good' : 'bg-bad'
              }`}
            >
              {isA ? tr('SUBMISSION {side} (REFERENCE)', { side }) : tr('SUBMISSION {side} (COMPARED)', { side })}
            </span>
            {sha && (
              <span className="font-mono-code text-[11px] text-muted">
                {tr('SHA:')}{' '}<code className="font-bold text-ink">{sha.slice(0, 8)}</code>
              </span>
            )}
          </div>
          {summary.ownership ? (
            <Badge tone={summary.ownership.score >= 70 ? 'good' : 'bad'} dot>
              {tr('ORAL OWNERSHIP:')}{' '}{summary.ownership.score}%
            </Badge>
          ) : (
            <Badge tone="neutral">{tr('NO VOICE DEFENSE')}</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Link
              to={`/org/events/${detail?.submission.events.id ?? ''}/s/${summary.id}`}
              className="font-serif-heading text-[20px] font-medium text-ink hover:text-accent hover:underline"
            >
              {summary.team_name}
            </Link>
            <span className="ml-2 text-[12px] text-muted">({summary.submitted_by_name})</span>
          </div>
          {summary.total != null && (
            <Badge tone={scoreTone(summary.total, 100)}>{summary.total.toFixed(1)} / 100</Badge>
          )}
        </div>

        <div className="font-mono-code flex flex-wrap items-center gap-2 border-t border-line/70 pt-2 text-[11px] text-muted">
          {repo && (
            <a href={repo.url} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              {repo.owner}/{repo.name} ↗
            </a>
          )}
          {detail?.submission.locked_at && (
            <>
              <span>•</span>
              <span>{tr('Frozen:')}{' '}{formatDate(detail.submission.locked_at)}</span>
            </>
          )}
          {analysis && (
            <>
              <span>•</span>
              <span>{analysis.file_count}{' '}{tr('files read')}</span>
            </>
          )}
        </div>
      </div>

      {/* Repo Map & Stack Comparison */}
      <div className="flex-1 space-y-4 p-5">
        {map ? (
          <>
            <div className="space-y-1.5">
              <span className="font-mono-code text-[10px] font-bold tracking-wider text-muted uppercase">
                {tr('Repository Architecture Summary')}
              </span>
              <p className="text-[13px] leading-relaxed text-ink">{map.summary}</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[...map.stack.languages, ...map.stack.frameworks, ...map.stack.services].map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>

            {commits && (
              <div className="font-mono-code grid grid-cols-3 gap-2 rounded-[4px] border border-line bg-paper p-3 text-[11px]">
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Commits')}</span>
                  <span className="font-bold text-ink">{commits.total_commits}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Authors')}</span>
                  <span className="font-bold text-ink">{commits.authors.length}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Pre-Event')}</span>
                  <span className={`font-bold ${(commits.commits_before_start ?? 0) > 0 ? 'text-warn' : 'text-good'}`}>
                    {commits.commits_before_start ?? 0}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">
            {tr('Detailed repository analysis is not available yet for this submission.')}
          </p>
        )}

        {/* Cited Evidence Files per Criterion */}
        {rubric.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <span className="font-mono-code block text-[10px] font-bold tracking-wider text-muted uppercase">
              {tr('Rubric Scores & Cited Files')}
            </span>
            <ul className="space-y-2">
              {rubric.map((c) => {
                const s = (detail?.scores ?? summary.scores).find((x) => x.criterion_key === c.key);
                const val = s?.override_score ?? s?.ai_score ?? null;
                return (
                  <li key={c.key} className="rounded-[4px] border border-line bg-paper/55 p-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{c.name}</span>
                      <Badge tone={scoreTone(val)}>{val ?? '–'}/10</Badge>
                    </div>
                    {s?.evidence_json && s.evidence_json.length > 0 && (
                      <div className="font-mono-code mt-1.5 flex flex-wrap gap-1 text-[10px]">
                        {s.evidence_json.map((item) => {
                          const ev = evidenceLink(item, { repoUrl: repo?.url ?? null, sha, videoUrl: current?.video_url ?? null });
                          return ev.href ? (
                            <a
                              key={item}
                              href={ev.href}
                              target="_blank"
                              rel="noreferrer"
                              title={evidenceTitle(ev)}
                              className="rounded border border-line bg-surface px-1.5 py-0.5 text-accent hover:underline"
                            >
                              {ev.kind === 'video' ? '▶ ' : ''}
                              {ev.label}
                            </a>
                          ) : (
                            <code key={item} title={evidenceTitle(ev)} className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink">
                              {ev.kind === 'video' ? '▶ ' : ''}
                              {ev.label}
                            </code>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Oral Defense Cross-Exam Footer */}
      <div className="border-t border-line bg-paper/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono-code flex items-center gap-2 text-[11px] font-semibold text-ink">
            <span className={`material-symbols-outlined text-[17px] ${isA ? 'text-good' : 'text-bad'}`}>
              {detail?.interview ? 'graphic_eq' : 'mic_off'}
            </span>
            <span>
              {detail?.interview
                ? tr('Oral Defense ({status})', { status: detail.interview.status.toUpperCase() })
                : tr('No Oral Defense Recorded')}
            </span>
          </div>
          {detail?.interview && (
            <Link
              to={`/interview/${detail.interview.id}`}
              className="font-mono-code text-[11px] font-semibold text-accent hover:underline"
            >
              {tr('Inspect Transcript →')}
            </Link>
          )}
        </div>
        {summary.ownership && (
          <div className="mt-2.5">
            <EditorialQuoteBlock
              theme={isA ? 'accent' : 'neutral'}
              quote={tr('Ownership score {score}/100 ({level} confidence).', { score: summary.ownership.score, level: summary.ownership.confidence })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function SimilarityCompare() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { me, org } = useAuth();
  const toast = useToast();

  const { data, error, loading } = useLoad<ConsoleResponse>(id ? `/api/events/${id}/console` : null);

  const [viewMode, setViewMode] = useState<'side_by_side' | 'repo_overlap' | 'oral'>('side_by_side');
  const [verdict, setVerdict] = useState<VerdictOption>('direct_plagiarism');
  const [notes, setNotes] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const integrity = useLoad<IntegrityResponse>(id ? `/api/events/${id}/integrity` : null);

  const flags = data?.similarity_flags ?? [];
  const submissions = data?.submissions ?? [];

  const activeFlag = useMemo(() => {
    const flagId = searchParams.get('flag');
    if (flagId) return flags.find((f) => f.id === flagId) ?? null;
    const paramA = searchParams.get('a');
    const paramB = searchParams.get('b');
    if (paramA && paramB) {
      return (
        flags.find(
          (f) =>
            (f.submission_a === paramA && f.submission_b === paramB) ||
            (f.submission_a === paramB && f.submission_b === paramA),
        ) ?? null
      );
    }
    return flags[0] ?? null;
  }, [flags, searchParams]);

  const idA = searchParams.get('a') ?? activeFlag?.submission_a ?? submissions[0]?.id ?? null;
  const idB =
    searchParams.get('b') ??
    activeFlag?.submission_b ??
    submissions.find((s) => s.id !== idA)?.id ??
    null;

  const detailA = useLoad<SubmissionDetailPayload>(idA ? `/api/submissions/${idA}` : null);
  const detailB = useLoad<SubmissionDetailPayload>(idB ? `/api/submissions/${idB}` : null);

  const subA = submissions.find((s) => s.id === idA) ?? null;
  const subB = submissions.find((s) => s.id === idB) ?? null;

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;

  const { event } = data;
  const analysisA = detailA.data ? one(detailA.data.submission.repo_analyses) : null;
  const analysisB = detailB.data ? one(detailB.data.submission.repo_analyses) : null;
  const commitsA = analysisA?.commit_profile_json;
  const commitsB = analysisB?.commit_profile_json;

  const stackA = new Set([
    ...(analysisA?.map_json.stack.languages ?? []),
    ...(analysisA?.map_json.stack.frameworks ?? []),
  ]);
  const stackB = new Set([
    ...(analysisB?.map_json.stack.languages ?? []),
    ...(analysisB?.map_json.stack.frameworks ?? []),
  ]);
  const sharedStack = [...stackA].filter((t) => stackB.has(t));

  function selectPair(nextA: string, nextB: string, flagId?: string) {
    const next = new URLSearchParams();
    next.set('a', nextA);
    next.set('b', nextB);
    if (flagId) next.set('flag', flagId);
    setSearchParams(next);
  }

  function exportForensicJson() {
    const payload = {
      event: { id: event.id, name: event.name, slug: event.slug },
      flag: activeFlag,
      submission_a: subA,
      submission_b: subB,
      decisions: flagDecisions,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-similarity-dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(tr('Forensic similarity dossier exported (JSON).'));
  }

  // Decisions and matching code recorded for the flag on screen, newest first.
  const flagDecisions = (integrity.data?.decisions ?? []).filter((d) => activeFlag && d.flag_id === activeFlag.id);
  const flagMatches = (integrity.data?.matches ?? []).filter((m) => activeFlag && m.flag_id === activeFlag.id);
  const latestDecision = flagDecisions[0] ?? null;

  async function dismissFalsePositive() {
    if (!activeFlag) return;
    setVerdict('independent_invention');
    setSavingDecision(true);
    try {
      await api('/api/integrity-decisions', { body: { flag_id: activeFlag.id, verdict: 'independent_invention', note: notes || tr('Dismissed as a false positive.') } });
      toast.success(tr('Marked as a false positive.'));
      await integrity.reload();
    } catch (err) {
      toast.error(tr('Could not record the decision. {error}', { error: errorMessage(err) }));
    } finally {
      setSavingDecision(false);
    }
  }

  async function submitVerdict(e: FormEvent) {
    e.preventDefault();
    if (!activeFlag) return;
    setSavingDecision(true);
    try {
      await api('/api/integrity-decisions', { body: { flag_id: activeFlag.id, verdict, note: notes } });
      toast.success(tr('Determination recorded in the audit trail.'));
      setNotes('');
      await integrity.reload();
    } catch (err) {
      toast.error(tr('Could not record the determination. {error}', { error: errorMessage(err) }));
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Dark Technical Enclave Header */}
      <CommandConsoleHeader
        breadcrumbs={
          <>
            <Link to={`/org/events/${event.id}`} className="font-semibold text-accent-on-dark hover:underline">
              ← {event.name.toUpperCase()}
            </Link>
            <span>//</span>
            <span>{tr('FORENSIC SIMILARITY AUDIT')}</span>
            {activeFlag && (
              <>
                <span>//</span>
                <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-bad/40 bg-bad/20 px-2 py-0.5 font-semibold text-bad-on-dark">
                  <LiveDot tone="bad" />
                  <span>{SIMILARITY_SIGNAL_LABEL[activeFlag.signal].toUpperCase()}</span>
                </span>
              </>
            )}
          </>
        }
        statusChips={
          <>
            <span className="rounded-[3px] border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/80">
              {tr('FLAGGED PAIRS:')}{' '}{flags.length}
            </span>
            <span className="rounded-[3px] border border-good/30 bg-good/20 px-2.5 py-0.5 text-good-on-dark">
              {tr('COMMIT-LOCKED DIFF')}
            </span>
          </>
        }
        title={tr('Syntactic & Control Flow Overlap Analysis')}
        subtitle={tr('Side-by-side repository comparison, commit chronology provenance, and oral defense divergence across flagged cohort submissions.')}
        actions={
          <>
            <button
              type="button"
              disabled={!canDecide || !activeFlag || savingDecision}
              onClick={() => void dismissFalsePositive()}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[15px] text-good-on-dark">verified_user</span>
              <span>{tr('Dismiss False Positive')}</span>
            </button>
            <button
              type="button"
              onClick={exportForensicJson}
              className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>{tr('Export Dossier (JSON)')}</span>
            </button>
            <Link to={`/org/integrity/${event.id}`} className={linkButtonSecondary}>
              {tr('Integrity review')}
            </Link>
          </>
        }
        footerSlot={
          submissions.length >= 2 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono-code text-[11px] text-white/70 uppercase">{tr('Compare Pair:')}</span>
              <Select
                aria-label={tr('Submission A')}
                value={idA ?? ''}
                onChange={(e) => selectPair(e.target.value, idB ?? '')}
                className="font-mono-code h-8 w-56 border-white/20 bg-white/10 text-[12px] text-white"
              >
                {submissions.map((s) => (
                  <option key={s.id} value={s.id} className="text-ink">
                    A: {s.team_name}
                  </option>
                ))}
              </Select>
              <span className="font-mono-code text-white/50">vs</span>
              <Select
                aria-label={tr('Submission B')}
                value={idB ?? ''}
                onChange={(e) => selectPair(idA ?? '', e.target.value)}
                className="font-mono-code h-8 w-56 border-white/20 bg-white/10 text-[12px] text-white"
              >
                {submissions.map((s) => (
                  <option key={s.id} value={s.id} className="text-ink">
                    B: {s.team_name}
                  </option>
                ))}
              </Select>
            </div>
          ) : undefined
        }
      />

      {/* 2. Flagged Pair Cluster Pills */}
      {flags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-line bg-surface p-3.5">
          <span className="font-mono-code mr-1 text-[11px] font-semibold text-muted uppercase">
            {tr('Detected Similarity Signals:')}
          </span>
          {flags.map((f, idx) => {
            const nameA = submissions.find((s) => s.id === f.submission_a)?.team_name ?? tr('Team A');
            const nameB = submissions.find((s) => s.id === f.submission_b)?.team_name ?? tr('Team B');
            const isCurrent = activeFlag?.id === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => selectPair(f.submission_a, f.submission_b, f.id)}
                className={`font-mono-code cursor-pointer rounded-[3px] border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  isCurrent
                    ? 'border-bad bg-bad-soft text-bad'
                    : 'border-line bg-paper text-muted hover:border-muted hover:text-ink'
                }`}
              >
                0{idx + 1}: {nameA} ↔ {nameB} ({SIMILARITY_SIGNAL_LABEL[f.signal]})
              </button>
            );
          })}
        </div>
      )}

      {/* 3. Severity Warning Banner */}
      {activeFlag ? (
        <SeverityAlertBanner
          tone="bad"
          badge={tr('SIMILARITY SIGNAL DETECTED')}
          meta={`// ${SIMILARITY_SIGNAL_LABEL[activeFlag.signal].toUpperCase()}`}
          description={
            <>
              {rich(tr('Overlap signal between {a} and {b}:'), {
                a: <strong>{subA?.team_name ?? tr('Submission A')}</strong>,
                b: <strong>{subB?.team_name ?? tr('Submission B')}</strong>,
              })}{' '}
              {activeFlag.explanation || tr('Automated repository and structural similarity check triggered.')}
            </>
          }
          metrics={[
            { label: tr('Shared Stack'), value: tr('{n} tags', { n: sharedStack.length }) },
            { label: tr('Signal Type'), value: SIMILARITY_SIGNAL_LABEL[activeFlag.signal] },
          ]}
        />
      ) : (
        <Notice tone="info">
          {tr('No automated similarity flag exists between these two submissions. You are inspecting a manual side-by-side comparison.')}
        </Notice>
      )}

      {/* 4. 4 Forensic Telemetry KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TopAccentKpiCard
          accent="amber"
          eyebrow={tr('Similarity Signal')}
          icon="account_tree"
          value={activeFlag ? SIMILARITY_SIGNAL_LABEL[activeFlag.signal] : tr('Manual Diff')}
          description={activeFlag?.explanation || tr('Direct side-by-side repository comparison.')}
        />
        <TopAccentKpiCard
          accent="cobalt"
          eyebrow={tr('Files & Stack Overlap')}
          icon="data_array"
          value={tr('{n} Shared', { n: sharedStack.length })}
          description={tr('Sub A: {a} files · Sub B: {b} files.', { a: analysisA?.file_count ?? '–', b: analysisB?.file_count ?? '–' })}
          progress={sharedStack.length > 0 ? Math.min(100, sharedStack.length * 25) : 0}
        />
        <TopAccentKpiCard
          accent="emerald"
          eyebrow={tr('Commit Chronology')}
          icon="schedule"
          value={`${commitsA?.total_commits ?? '–'} vs ${commitsB?.total_commits ?? '–'}`}
          description={tr('Authors: {a} (A) vs {b} (B).', { a: commitsA?.authors.length ?? '–', b: commitsB?.authors.length ?? '–' })}
        />
        <TopAccentKpiCard
          accent="neutral"
          eyebrow={tr('Oral Defense Match')}
          icon="record_voice_over"
          value={`${subA?.ownership?.score ?? '–'}% vs ${subB?.ownership?.score ?? '–'}%`}
          description={tr('Live 3-minute voice cross-examination authorship score.')}
        />
      </div>

      {/* 5. View Switcher */}
      <Tabs
        ariaLabel={tr('Comparison views')}
        tabs={[
          { key: 'side_by_side', label: tr('Side-by-Side Comparison'), icon: 'compare' },
          { key: 'repo_overlap', label: tr('Commit & Stack Provenance'), icon: 'account_tree' },
          { key: 'oral', label: tr('Oral Defense Divergence'), icon: 'record_voice_over' },
        ]}
        active={viewMode}
        onChange={setViewMode}
      />

      {/* 6. Side-by-Side Dual Inspector */}
      {subA && subB ? (
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <SubmissionComparisonPane side="A" summary={subA} detail={detailA.data} rubric={event.rubric_json} />
          <SubmissionComparisonPane side="B" summary={subB} detail={detailB.data} rubric={event.rubric_json} />
        </div>
      ) : (
        <Notice tone="warn">{tr('At least two submissions are needed in this event to compare side-by-side.')}</Notice>
      )}

      {/* 7. Visual Forensic Summary Cards */}
      {subA && subB && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="flex flex-col justify-between rounded-[6px] border border-line bg-surface p-5">
            <div className="space-y-1">
              <span className="font-mono-code text-[10px] font-semibold tracking-wider text-muted uppercase">
                {tr('Repository Lineage')}
              </span>
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Fork & Repo Provenance')}</h3>
              <p className="text-[12px] leading-relaxed text-muted">
                {activeFlag
                  ? tr('Flagged under "{signal}".', { signal: SIMILARITY_SIGNAL_LABEL[activeFlag.signal] })
                  : tr('Comparing repository origins and frozen commit snapshots.')}
              </p>
            </div>
            <div className="font-mono-code mt-4 space-y-1.5 border-t border-line pt-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">{tr('Sub A Fork:')}</span>
                <span className="font-semibold text-ink">
                  {subA.current_version?.repos.is_fork
                    ? subA.current_version.repos.fork_parent || tr('Yes')
                    : tr('Original Repo')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{tr('Sub B Fork:')}</span>
                <span className="font-semibold text-ink">
                  {subB.current_version?.repos.is_fork
                    ? subB.current_version.repos.fork_parent || tr('Yes')
                    : tr('Original Repo')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[6px] border border-line bg-surface p-5">
            <div className="space-y-1">
              <span className="font-mono-code text-[10px] font-semibold tracking-wider text-muted uppercase">
                {tr('Candidate Artifacts Provenance')}
              </span>
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Git Commit Chronology')}</h3>
              <p className="text-[12px] leading-relaxed text-muted">
                {tr('Compare incremental development history vs. single-commit bulk pushes.')}
              </p>
            </div>
            <div className="font-mono-code mt-4 space-y-3 text-[11px]">
              <div>
                <div className="flex justify-between pb-1">
                  <span className="font-semibold text-ink">{subA.team_name}</span>
                  <span className="font-bold text-good">{trn('{count} commit', '{count} commits', commitsA?.total_commits ?? 0)}</span>
                </div>
                <ScoreBar value={Math.min(100, (commitsA?.total_commits ?? 0) * 4)} max={100} tone="good" heightClass="h-2" />
              </div>
              <div>
                <div className="flex justify-between pb-1">
                  <span className="font-semibold text-ink">{subB.team_name}</span>
                  <span className="font-bold text-bad">{trn('{count} commit', '{count} commits', commitsB?.total_commits ?? 0)}</span>
                </div>
                <ScoreBar value={Math.min(100, (commitsB?.total_commits ?? 0) * 4)} max={100} tone="bad" heightClass="h-2" />
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[6px] border border-line bg-surface p-5">
            <div className="space-y-1">
              <span className="font-mono-code text-[10px] font-semibold tracking-wider text-muted uppercase">
                {tr('Score & Ownership Parity')}
              </span>
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Composite Benchmark')}</h3>
              <p className="text-[12px] leading-relaxed text-muted">
                {tr('Side-by-side comparison of weighted rubric totals and oral defense confidence.')}
              </p>
            </div>
            <div className="font-mono-code mt-4 space-y-2 border-t border-line pt-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">{tr('Rubric Total (A vs B):')}</span>
                <span className="font-bold text-ink">
                  {subA.total?.toFixed(1) ?? '–'} vs {subB.total?.toFixed(1) ?? '–'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{tr('Voice Ownership (A vs B):')}</span>
                <span className="font-bold text-accent">
                  {subA.ownership?.score ?? '–'} vs {subB.ownership?.score ?? '–'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. Auditor Decision & Sanction Protocol */}
      <NumberedSectionCard
        number="AD"
        icon="gavel"
        title={tr('Auditor Decision & Sanction Protocol')}
        subtitle={tr('Record your evidentiary determination after inspecting both repositories and oral defense transcripts.')}
        sectionTag={latestDecision ? tr('LAST: {verdict}', { verdict: (VERDICT_LABEL[latestDecision.verdict] ?? latestDecision.verdict).toUpperCase() }) : tr('FORMAL ADJUDICATION')}
        theme="warn"
      >
        <form onSubmit={submitVerdict} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            <span className="font-mono-code block text-[11px] font-bold tracking-wider text-muted uppercase">
              {tr('Select Adjudication Determination:')}
            </span>
            {(
              [
                {
                  key: 'direct_plagiarism',
                  title: tr('Direct Unauthorized Plagiarism'),
                  desc: tr('Submission B systematically copied or renamed code from Submission A.'),
                },
                {
                  key: 'collusion',
                  title: tr('Coordinated Unauthorized Collaboration'),
                  desc: tr('Both parties jointly developed core logic in violation of assessment rules.'),
                },
                {
                  key: 'starter_template',
                  title: tr('Shared Canonical Boilerplate / Starter Code'),
                  desc: tr('Overlap originates from a public framework or permitted starter kit.'),
                },
                {
                  key: 'independent_invention',
                  title: tr('Independent Invention (Dismiss Flag)'),
                  desc: tr('Algorithmic constraints explain the similarity. No penalty applied.'),
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.key}
                className={`flex cursor-pointer items-start gap-3 rounded-[4px] border p-3 transition-colors ${
                  verdict === opt.key ? 'border-accent bg-accent-soft/45' : 'border-line bg-paper/45 hover:bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="adjudication_verdict"
                  checked={verdict === opt.key}
                  onChange={() => setVerdict(opt.key)}
                  className="mt-1 accent-accent"
                />
                <div>
                  <span className="block text-[13px] font-semibold text-ink">{opt.title}</span>
                  <span className="block text-[11px] leading-snug text-muted">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            <div className="space-y-1.5">
              <label
                htmlFor="auditor_notes"
                className="font-mono-code block text-[11px] font-bold tracking-wider text-muted uppercase"
              >
                {tr('Auditor Findings & Evidentiary Justification')}
              </label>
              <Textarea
                id="auditor_notes"
                rows={6}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tr('Document specific file overlaps, commit history observations, and oral defense comparison notes...')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <div className="font-mono-code text-[11px] text-muted">
                {tr('SIGNER:')}{' '}<strong className="text-ink">{me?.profile.display_name || tr('Lead Auditor')}</strong>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button type="button" variant="secondary" onClick={exportForensicJson}>
                  {tr('Export Forensic JSON')}
                </Button>
                <Button
                  type="submit"
                  disabled={!canDecide || !activeFlag || savingDecision} loading={savingDecision}
                  variant={verdict === 'independent_invention' ? 'primary' : 'danger'}
                >
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>{savingDecision ? tr('Recording…') : tr('Confirm Forensic Determination')}</span>
                </Button>
              </div>
            </div>
            {!activeFlag && <p className="text-[12px] text-muted">{tr('Pick a flagged pair to record a decision. Pairs compared by hand have no flag to decide on.')}</p>}
            {activeFlag && !canDecide && <p className="text-[12px] text-muted">{tr('Your role cannot record integrity decisions.')}</p>}
          </div>
        </form>

        <div className="mt-6 space-y-2 border-t border-line pt-4">
          <div className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{tr('Decision history')}</div>
          {integrity.loading ? (
            <p className="text-[12px] text-muted">{tr('Loading decisions…')}</p>
          ) : integrity.error ? (
            <p className="text-[12px] text-bad">{integrity.error}</p>
          ) : flagDecisions.length === 0 ? (
            <p className="text-[12px] text-muted">{tr('No decision recorded for this pair yet.')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-[4px] border border-line">
              {flagDecisions.map((d) => (
                <li key={d.id} className="space-y-0.5 px-3 py-2 text-[12px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-code font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                    <span className="text-muted">
                      {tr('by {name} · {date}', { name: d.profiles?.display_name || tr('a reviewer'), date: formatDate(d.created_at) })}
                    </span>
                  </div>
                  {d.note && <p className="text-muted">{d.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard
        id="section-matches"
        number="M"
        icon="difference"
        title={tr('Matching Code')}
        subtitle={tr('Fragments that are the same in both repositories.')}
        sectionTag={tr('{n} FRAGMENTS', { n: flagMatches.length })}
        theme="neutral"
      >
        {flagMatches.length === 0 ? (
          <p className="text-[13px] text-muted">
            {tr('File comparison is not available yet. This flag comes from the signal "{signal}", not from comparing file contents.', {
              signal: activeFlag ? SIMILARITY_SIGNAL_LABEL[activeFlag.signal] : tr('Similarity'),
            })}
          </p>
        ) : (
          <MatchingCode matches={flagMatches} scope="event" labelA={tr('Submission A')} labelB={tr('Submission B')} />
        )}
      </NumberedSectionCard>
    </div>
  );
}
