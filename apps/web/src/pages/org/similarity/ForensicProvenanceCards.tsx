import type { CommitProfile } from '@skillproof/shared';
import {
  Notice,
  SIMILARITY_SIGNAL_LABEL,
  ScoreBar,
  SeverityAlertBanner,
  TopAccentKpiCard,
} from '../../../components/shared';
import { tr, trn } from '../../../i18n';
import { rich } from '../../../i18n/rich';
import type { Analysis, ConsoleSubmission, Flag } from './types';

export function SimilaritySignalsAndKpis({
  flags,
  submissions,
  activeFlag,
  subA,
  subB,
  sharedStackCount,
  analysisA,
  analysisB,
  commitsA,
  commitsB,
  onSelectPair,
}: {
  flags: readonly Flag[];
  submissions: readonly ConsoleSubmission[];
  activeFlag: Flag | null;
  subA: ConsoleSubmission | null;
  subB: ConsoleSubmission | null;
  sharedStackCount: number;
  analysisA: Analysis | null;
  analysisB: Analysis | null;
  commitsA: CommitProfile | null | undefined;
  commitsB: CommitProfile | null | undefined;
  onSelectPair: (nextA: string, nextB: string, flagId?: string) => void;
}) {
  return (
    <>
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
                onClick={() => onSelectPair(f.submission_a, f.submission_b, f.id)}
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
            { label: tr('Shared Stack'), value: tr('{n} tags', { n: sharedStackCount }) },
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
          value={tr('{n} Shared', { n: sharedStackCount })}
          description={tr('Sub A: {a} files · Sub B: {b} files.', { a: analysisA?.file_count ?? '–', b: analysisB?.file_count ?? '–' })}
          progress={sharedStackCount > 0 ? Math.min(100, sharedStackCount * 25) : 0}
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
    </>
  );
}

export function ForensicProvenanceCards({
  subA,
  subB,
  activeFlag,
  commitsA,
  commitsB,
}: {
  subA: ConsoleSubmission;
  subB: ConsoleSubmission;
  activeFlag: Flag | null;
  commitsA: CommitProfile | null | undefined;
  commitsB: CommitProfile | null | undefined;
}) {
  return (
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
  );
}
