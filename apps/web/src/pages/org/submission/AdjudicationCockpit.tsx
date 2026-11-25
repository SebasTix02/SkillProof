import type { Rubric } from '@skillproof/shared';
import { Link } from 'react-router-dom';
import { JudgeReviewCard, JudgeReviewsList } from '../../../components/JudgeReview';
import { Badge, linkButton, linkButtonSecondary } from '../../../components/shared';
import { tr } from '../../../i18n';
import { STATUS_LABEL, type EventView, type ScoreView } from '../../../lib/types';
import { ScoreCalibrationRow } from './ScoreCalibrationRow';
import type { QueueSubmission } from './types';

export function AdjudicationCockpit({
  eventId,
  submissionId,
  eventStatus,
  canOverride,
  canReview,
  isManager,
  queueLength,
  aiTotal,
  total,
  delta,
  rubric,
  orderedScores,
  repoUrl,
  sha,
  videoUrl,
  onScoreSaved,
  nextSub,
}: {
  eventId: string | undefined;
  submissionId: string;
  eventStatus: EventView['status'];
  canOverride: boolean;
  canReview: boolean;
  isManager: boolean;
  queueLength: number;
  aiTotal: number | null;
  total: number | null;
  delta: number;
  rubric: Rubric;
  orderedScores: readonly ScoreView[];
  repoUrl: string | null;
  sha: string | null;
  videoUrl: string | null;
  onScoreSaved: () => void;
  nextSub: QueueSubmission | null | undefined;
}) {
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-4">
      <div className="space-y-4 rounded-[6px] border border-line bg-surface p-5">
        <div className="space-y-1 border-b border-line pb-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif-heading text-[22px] font-medium text-ink">
              {tr('Adjudication & Calibration')}
            </h2>
            <Badge tone={canOverride ? 'accent' : 'neutral'}>
              {canOverride ? tr('OVERRIDE READY') : STATUS_LABEL[eventStatus]}
            </Badge>
          </div>
          <p className="text-[12px] text-muted">
            {canOverride
              ? tr('Each score comes with the reason and the files behind it. Change any score you disagree with; the total updates right away.')
              : eventStatus === 'published'
                ? tr('Results are published, so scores can no longer be changed.')
                : tr('Each score comes with the reason and the files behind it.')}
          </p>
        </div>

        {/* Baseline Metrics */}
        <div className="font-mono-code grid grid-cols-2 gap-2.5 text-[11px]">
          <div className="rounded-[4px] border border-line bg-paper p-3">
            <span className="block text-[10px] font-semibold text-muted uppercase">{tr('AI Baseline')}</span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-[20px] font-bold text-ink">
                {aiTotal != null ? aiTotal.toFixed(1) : '—'}
              </span>
              <span className="text-[11px] text-muted">/ 100</span>
            </div>
          </div>

          <div className="rounded-[4px] border border-good/30 bg-good-soft/50 p-3">
            <span className="block text-[10px] font-semibold text-good uppercase">{tr('Effective Total')}</span>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-[20px] font-bold text-good">
                {total != null ? total.toFixed(1) : '—'}
              </span>
              <span className="text-[11px] text-good/80">/ 100</span>
            </div>
          </div>
        </div>

        {/* Rubric Score Calibration List */}
        {orderedScores.length > 0 ? (
          <ul className="space-y-3">
            {orderedScores.map((s, idx) => (
              <ScoreCalibrationRow
                key={s.id}
                index={idx}
                score={s}
                criterion={rubric.find((c) => c.key === s.criterion_key)}
                repoUrl={repoUrl}
                sha={sha}
                videoUrl={videoUrl}
                canOverride={canOverride}
                onSaved={onScoreSaved}
              />
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-[13px] text-muted">
            {tr('Scores will appear here as soon as the AI evaluation completes.')}
          </p>
        )}

        {/* Dynamic Adjusted Composite Banner */}
        {total != null && (
          <div className="flex items-center justify-between rounded-[4px] border border-accent/30 bg-accent-soft/55 p-3.5">
            <div>
              <span className="font-mono-code block text-[10px] font-semibold tracking-wider text-muted uppercase">
                {tr('Weighted Composite Score')}
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
                    ? 'border-good/30 bg-good-soft text-good-ink'
                    : delta < 0
                      ? 'border-warn/30 bg-warn-soft text-warn-ink'
                      : 'border-line bg-surface text-muted'
                }`}
              >
                {delta > 0 ? `+${delta}` : delta}{' '}{tr('DELTA')}
              </span>
              <span className="font-mono-code mt-1 block text-[10px] text-muted">{tr('vs. AI baseline')}</span>
            </div>
          </div>
        )}

        {/* Navigation CTAs */}
        <div className="flex flex-col gap-2 pt-1">
          {nextSub && (
            <Link to={`/org/events/${eventId}/s/${nextSub.id}`} className={`${linkButton} w-full py-2.5`}>
              <span>{tr('Proceed to Next (')}{nextSub.team_name})</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          )}
          <Link to={`/org/events/${eventId}`} className={`${linkButtonSecondary} w-full py-2`}>
            {tr('Return to Event Console')}
          </Link>
        </div>
      </div>

      {canReview && (!isManager || queueLength > 0) && (
        <JudgeReviewCard submissionId={submissionId} rubric={rubric} locked={eventStatus === 'published'} />
      )}
      {isManager && <JudgeReviewsList submissionId={submissionId} rubric={rubric} />}

      {/* Keyboard Shortcut Pill Bar */}
      <div className="font-mono-code flex items-center justify-between rounded-[6px] border border-line bg-surface p-3 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-semibold text-ink">J</kbd>
          <span>/</span>
          <kbd className="rounded border border-line bg-paper px-1.5 py-0.5 font-semibold text-ink">K</kbd>
          <span>{tr('Navigate Queue')}</span>
        </span>
        <span>{canOverride ? tr('Auto-saves on change') : tr('Read-only mode')}</span>
      </div>
    </aside>
  );
}
