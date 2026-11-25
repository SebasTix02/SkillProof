import { tr } from '../i18n';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, PageState } from '../components/shared';
import { type EventView } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import {
  EventHeroHeader,
  EventLifecycleStepper,
  EventRubricSection,
  EventSectionNav,
} from './event/EventHero';
import { JoinPanel } from './event/JoinPanel';
import { ResultsView } from './event/ScoreBreakdownSection';
import { SubmissionCard } from './event/SubmissionCard';
import {
  getLifecycleStep,
  type EventResponse,
  type EventTab,
  type MySubmission,
  type Results,
} from './event/types';

export function EventPage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useLoad<EventResponse>(`/api/events/by-slug/${slug}`);
  const [activeTab, setActiveTab] = useState<EventTab>('workspace');
  const [now] = useState(() => Date.now());

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;
  const { event } = data;
  const activeStep = getLifecycleStep(event, data.is_participant, now);

  function jumpToSection(tab: EventTab, elementId: string) {
    setActiveTab(tab);
    const el = document.getElementById(elementId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div className="space-y-8">
      {/* 1. Top Event Dossier Header */}
      <EventHeroHeader event={event} isManager={data.is_manager} activeStep={activeStep} />

      {/* 2. Lifecycle State Progress Stepper */}
      <EventLifecycleStepper event={event} activeStep={activeStep} />

      {/* 3. Primary Navigation Bar */}
      <EventSectionNav event={event} activeTab={activeTab} onJump={jumpToSection} />

      {/* 4. Active Workspace Content */}
      <div id="workspaceSection" className="space-y-8">
        {data.is_participant ? (
          <Participant event={event} />
        ) : (
          <JoinPanel event={event} onJoined={reload} />
        )}
      </div>

      {/* 5. Rubric Specification Card */}
      <EventRubricSection event={event} />
    </div>
  );
}

function Participant({ event }: { event: EventView }) {
  const mine = useLoad<MySubmission>(`/api/events/${event.id}/my-submission`);
  const results = useLoad<Results>(
    `/api/events/${event.id}/results`,
    (r) => r.status === 'judging' || r.status === 'review',
  );
  if (!mine.data) return <PageState loading={mine.loading} error={mine.error} kind="list" />;
  const closed = !mine.data.accepting;
  const sub = mine.data.submission;

  return (
    <div className="space-y-8">
      {/* State 3: Judging / In Review Pipeline Banner */}
      {closed && results.data && !results.data.published && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[26px] text-accent">hourglass_top</span>
              <div>
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">
                  {sub?.locked_commit_sha
                    ? tr('Submissions Locked & Frozen at Commit @{sha}', { sha: sub.locked_commit_sha.slice(0, 7) })
                    : tr('Submissions Closed & Evaluation In Progress')}
                </h3>
                <p className="text-[13px] text-muted">
                  {results.data.status === 'judging'
                    ? tr('The repository analyzer and rubric evaluator are scoring submissions against the event criteria.')
                    : tr('The organizer is reviewing the AI scores and evidence. Final standings appear here once published.')}
                </p>
              </div>
            </div>
            <Badge tone="warn" dot>
              {results.data.status === 'judging' ? tr('PIPELINE RUNNING') : tr('ORGANIZER REVIEW')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-good">{tr('STAGE 01')}</span>
                <span className="material-symbols-outlined text-[17px] text-good">verified</span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Commit SHA Freeze')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good-ink">
                {sub?.locked_commit_sha ? tr('@{sha} LOCKED', { sha: sub.locked_commit_sha.slice(0, 7) }) : tr('LOCKED')}
              </span>
            </div>

            <div
              className={`space-y-1.5 rounded-[4px] border p-3.5 ${
                results.data.status === 'judging' ? 'border-accent/40 bg-accent-soft/60' : 'border-line bg-paper'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-accent">{tr('STAGE 02')}</span>
                <span
                  className={`material-symbols-outlined text-[17px] text-accent ${
                    results.data.status === 'judging' ? 'animate-spin' : ''
                  }`}
                >
                  {results.data.status === 'judging' ? 'sync' : 'verified'}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Rubric Vector Evaluation')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                {results.data.status === 'judging' ? tr('ACTIVE') : tr('SCORED')}
              </span>
            </div>

            <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-muted">{tr('STAGE 03')}</span>
                <span className="font-mono-code text-[10px] text-muted">
                  {event.interviews_enabled ? tr('ENABLED') : tr('SKIPPED')}
                </span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('3-Min Voice Defense')}</div>
              <span className="font-mono-code inline-block rounded-[2px] border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
                {event.interviews_enabled ? tr('OPENS AFTER JUDGING') : tr('NOT REQUIRED')}
              </span>
            </div>

            <div
              className={`space-y-1.5 rounded-[4px] border p-3.5 ${
                results.data.status === 'review' ? 'border-warn/40 bg-warn-soft/60' : 'border-line bg-paper'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono-code text-[11px] font-bold text-warn">{tr('STAGE 04')}</span>
                <span className="material-symbols-outlined text-[17px] text-warn">gavel</span>
              </div>
              <div className="text-[13px] font-semibold text-ink">{tr('Organizer Calibration')}</div>
              <span className="font-mono-code inline-block rounded-[2px] bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn-ink">
                {results.data.status === 'review' ? tr('IN JURY REVIEW') : tr('PENDING')}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* State 4: Published Results Dossier & Leaderboard */}
      {results.data?.published && <ResultsView event={event} results={results.data} lockedSha={sub?.locked_commit_sha ?? null} version={sub?.submission_versions.find((v) => v.id === sub.current_version_id) ?? null} />}

      {/* State 2 (and History): Submission Dossier Formulation & Timeline */}
      <SubmissionCard event={event} mine={mine.data} onSubmitted={mine.reload} />
    </div>
  );
}
