import { tr } from '../../i18n';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { one } from '../../components/Report';
import {
  CommandConsoleHeader,
  LiveDot,
  Notice,
  PageState,
  SIMILARITY_SIGNAL_LABEL,
  Select,
  Tabs,
  linkButtonSecondary,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { NONE } from '../../lib/empty';
import { useLoad } from '../../lib/useLoad';
import { downloadJson } from './download';
import { AuditorDecisionCard } from './similarity/AuditorDecisionCard';
import { ForensicProvenanceCards, SimilaritySignalsAndKpis } from './similarity/ForensicProvenanceCards';
import { SubmissionComparisonPane } from './similarity/SubmissionComparisonPane';
import type {
  ConsoleResponse,
  IntegrityResponse,
  SubmissionDetailPayload,
  VerdictOption,
} from './similarity/types';

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

  const flags = data?.similarity_flags ?? NONE;
  const submissions = data?.submissions ?? NONE;

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

  // Decisions and matching code recorded for the flag on screen, newest first.
  const flagDecisions = (integrity.data?.decisions ?? []).filter((d) => activeFlag && d.flag_id === activeFlag.id);
  const flagMatches = (integrity.data?.matches ?? []).filter((m) => activeFlag && m.flag_id === activeFlag.id);

  function exportForensicJson() {
    const payload = {
      event: { id: event.id, name: event.name, slug: event.slug },
      flag: activeFlag,
      submission_a: subA,
      submission_b: subB,
      decisions: flagDecisions,
      exported_at: new Date().toISOString(),
    };
    downloadJson(`${event.slug}-similarity-dossier.json`, payload);
    toast.success(tr('Forensic similarity dossier exported (JSON).'));
  }

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

      {/* 2–4. Signals, Alert Banner, and 4 Forensic Telemetry KPI Cards */}
      <SimilaritySignalsAndKpis
        flags={flags}
        submissions={submissions}
        activeFlag={activeFlag}
        subA={subA}
        subB={subB}
        sharedStackCount={sharedStack.length}
        analysisA={analysisA}
        analysisB={analysisB}
        commitsA={commitsA}
        commitsB={commitsB}
        onSelectPair={selectPair}
      />

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
        <ForensicProvenanceCards
          subA={subA}
          subB={subB}
          activeFlag={activeFlag}
          commitsA={commitsA}
          commitsB={commitsB}
        />
      )}

      {/* 8. Auditor Decision & Matching Code */}
      <AuditorDecisionCard
        activeFlag={activeFlag}
        canDecide={canDecide}
        signerName={me?.profile.display_name}
        verdict={verdict}
        onVerdictChange={setVerdict}
        notes={notes}
        onNotesChange={setNotes}
        savingDecision={savingDecision}
        onSubmitVerdict={(e) => void submitVerdict(e)}
        onExportJson={exportForensicJson}
        integrityLoading={integrity.loading}
        integrityError={integrity.error}
        flagDecisions={flagDecisions}
        flagMatches={flagMatches}
      />
    </div>
  );
}
