import type { Rubric } from '@skillproof/shared';
import { Link } from 'react-router-dom';
import { Badge, Notice, TopAccentKpiCard, linkButton } from '../../../components/shared';
import { tr } from '../../../i18n';
import type { CohortMetrics, ConsoleSubmission, CourseTab, Flag, Target } from './types';

export function IntegrityTabPanels({
  target,
  metrics,
  submissions,
  flags,
  activeTab,
  selectedRubric,
}: {
  target: Target | null;
  metrics: CohortMetrics;
  submissions: readonly ConsoleSubmission[];
  flags: readonly Flag[];
  activeTab: CourseTab;
  selectedRubric: Rubric;
}) {
  return (
    <>
      {/* 3. 4-Column Metric Telemetry Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TopAccentKpiCard
          accent="cobalt"
          eyebrow={tr('Class Average Score')}
          icon="analytics"
          value={metrics.avgScore != null ? metrics.avgScore.toFixed(1) : '—'}
          unit="/ 100"
          description={tr('{n} of {total} submissions scored.', { n: metrics.scoredCount, total: submissions.length })}
        />
        <TopAccentKpiCard
          accent="emerald"
          eyebrow={tr('Authorship Confidence')}
          icon="fingerprint"
          value={metrics.avgOwnership != null ? `${metrics.avgOwnership.toFixed(1)}%` : '—'}
          unit={tr('Mean')}
          description={tr('{n} students completed 3-min voice defense.', { n: metrics.withOwnershipCount })}
        />
        <TopAccentKpiCard
          accent="amber"
          eyebrow={tr('Similarity Anomalies')}
          icon="schema"
          value={`${metrics.anomalyPct}%`}
          unit={`(${flags.length} pairs)`}
          description={tr('Shared repositories, common forks, or structural matches.')}
        />
        <TopAccentKpiCard
          accent="neutral"
          eyebrow={tr('Oral Defense Status')}
          icon="mic"
          value={metrics.withOwnershipCount}
          unit={tr('Completed')}
          description={
            target?.interviews_enabled
              ? tr('Gemini Live 3-minute repository cross-exam enabled.')
              : tr('Oral defense disabled for this assignment.')
          }
        />
      </section>

      {/* Tab 04: Course Rubric View */}
      {activeTab === 'rubric' && selectedRubric.length > 0 && (
        <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
          <h2 className="font-serif-heading text-[22px] font-medium text-ink">
            {tr('Course Rubric & Auto-Grader Criteria')}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {selectedRubric.map((c, idx) => (
              <div key={c.key} className="space-y-1.5 rounded-[4px] border border-line bg-paper/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono-code text-[11px] font-bold text-accent uppercase">
                    {tr('Criterion')}{' '}{String(idx + 1).padStart(2, '0')}
                  </span>
                  <Badge tone="neutral">{tr('WEIGHT:')}{' '}{c.weight}%</Badge>
                </div>
                <div className="font-serif-heading text-[18px] font-medium text-ink">{c.name}</div>
                {c.description && <p className="text-[13px] text-muted">{c.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tab 02: Similarity Flags Quick Matrix */}
      {activeTab === 'plagiarism' && (
        <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                {tr('Plagiarism & Similarity Cluster Matrix')}
              </h2>
              <p className="text-[13px] text-muted">
                {tr('Inspect flagged submission pairs side-by-side in the Forensic Comparison Console.')}
              </p>
            </div>
            {target?.compareLink && flags[0] && (
              <Link to={target.compareLink(flags[0].submission_a, flags[0].submission_b, flags[0].id)} className={linkButton}>
                {tr('Open Forensic Comparison →')}
              </Link>
            )}
          </div>

          {flags.length === 0 ? (
            <Notice tone="good">{tr('Zero similarity anomalies detected across the current cohort.')}</Notice>
          ) : (
            <ul className="space-y-2.5">
              {flags.map((f) => {
                const nameA = submissions.find((s) => s.id === f.submission_a)?.team_name ?? tr('Team A');
                const nameB = submissions.find((s) => s.id === f.submission_b)?.team_name ?? tr('Team B');
                return (
                  <li
                    key={f.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-warn/35 bg-warn-soft/35 p-3.5 text-[13px]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warn">{f.signal.replace('_', ' ')}</Badge>
                      <strong className="text-ink">{nameA}</strong>
                      <span className="text-muted">↔</span>
                      <strong className="text-ink">{nameB}</strong>
                      {f.explanation && <span className="font-mono-code text-[12px] text-muted">· {f.explanation}</span>}
                    </div>
                    {target?.compareLink && (
                      <Link
                        to={target.compareLink(f.submission_a, f.submission_b, f.id)}
                        className="font-mono-code text-[11px] font-semibold text-accent hover:underline"
                      >
                        {tr('Compare Side-by-Side →')}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
