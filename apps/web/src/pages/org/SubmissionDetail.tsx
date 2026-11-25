import { tr } from '../../i18n';
import { rich } from '../../i18n/rich';
import { weightedTotal } from '@skillproof/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SubmissionJudgingControls } from '../../components/JudgingControls';
import { one } from '../../components/Report';
import {
  CommandConsoleHeader,
  LiveDot,
  Notice,
  PageState,
  ScoreBar,
  linkButton,
  questionToOptions,
  useConfirm,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';
import { AdjudicationCockpit } from './submission/AdjudicationCockpit';
import { SubmissionQueueRail } from './submission/SubmissionQueueRail';
import { SubmissionRepoAndRubric } from './submission/SubmissionRepoAndRubric';
import { SubmissionTimelineCards } from './submission/SubmissionTimelineCards';
import type { AssignmentRow, DetailResponse, QueueResponse, QueueSubmission } from './submission/types';

export { ScoreCalibrationRow } from './submission/ScoreCalibrationRow';

export function SubmissionDetail() {
  const { id, sid } = useParams();
  const navigate = useNavigate();
  const { org, me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [rejudging, setRejudging] = useState(false);
  const [controlKey, setControlKey] = useState<string | null>(null);
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

  const consoleSubs = consoleData.data?.submissions;
  const myAssignments = assignmentData.data?.assignments;
  const queue = useMemo<QueueSubmission[]>(
    () =>
      isManager
        ? (consoleSubs ?? [])
        : (myAssignments ?? []).map((a) => ({
            id: a.submission_id,
            team_name: a.submissions?.team_name ?? tr('Submission'),
            submitted_by_name: a.my_review ? (a.my_review.status === 'submitted' ? tr('Review submitted') : tr('Draft saved')) : tr('Not reviewed yet'),
            status: a.submissions?.status ?? 'submitted',
            locked_commit_sha: a.submissions?.locked_commit_sha ?? null,
            total: null,
            ownership: null,
          })),
    [isManager, consoleSubs, myAssignments],
  );
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

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;
  const { submission: sub, scores, feedback } = data;

  /** Pause, resume, cancel or judge again, from the controls bar. */
  async function control(key: string, path: string, success: string, confirmText?: string) {
    if (confirmText && !(await confirm(questionToOptions(confirmText, { confirmLabel: tr('Continue') })))) return;
    setRejudging(true);
    setControlKey(key);
    try {
      await api(path, { method: 'POST' });
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRejudging(false);
      setControlKey(null);
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
            <Link to={`/org/events/${id}`} className="font-semibold text-accent-on-dark hover:underline">
              ← {sub.events.name.toUpperCase()}
            </Link>
            <span>//</span>
            <span>{tr('DOCKET #')}{sub.id.slice(0, 8).toUpperCase()}</span>
            <span>//</span>
            <span className="inline-flex items-center gap-1.5 text-good-on-dark">
              <LiveDot tone="mint" pulse={working} />
              <span>{STATUS_LABEL[sub.events.status].toUpperCase()}</span>
            </span>
          </>
        }
        statusChips={
          <div className="flex items-center gap-2 rounded-[4px] border border-white/10 bg-white/5 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-good-on-dark" />
            <span className="font-medium text-white">{me?.profile.display_name || tr('Judge')}</span>
            {me?.email && <span className="text-white/50">({me.email})</span>}
            <span className="text-white/30">|</span>
            <span className="text-accent-on-dark uppercase">
              {(org?.roles ?? ['judge']).join(', ')}
            </span>
          </div>
        }
        eyebrowBadge={(currentQueueIndex >= 0 ? tr('SUBMISSION #{n} OF {total}', { n: currentQueueIndex + 1, total: queue.length }) : tr('SUBMISSION DOSSIER'))}
        eyebrowMeta={sha ? tr('FROZEN AT COMMIT @{sha}', { sha: sha.slice(0, 7) }) : tr('AWAITING COMMIT FREEZE')}
        title={sub.team_name}
        subtitle={
          current
            ? `${tr('Repository: {repo}', { repo: `${current.repos.owner}/${current.repos.name}` })}${
                analysis ? ` · ${tr('{n} source files analyzed', { n: analysis.file_count })}` : ''
              }`
            : tr('Inspecting project submission, AI rubric evidence, and oral verification status.')
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {prevSub && (
              <Link
                to={`/org/events/${id}/s/${prevSub.id}`}
                className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                <span className="material-symbols-outlined text-[15px]">arrow_back</span>
                <span>{tr('Prev (')}{prevSub.team_name.slice(0, 14)})</span>
              </Link>
            )}
            {nextSub && (
              <Link
                to={`/org/events/${id}/s/${nextSub.id}`}
                className={`${linkButton} font-mono-code px-3.5 py-1.5 text-[11px]`}
              >
                <span>{tr('Next (')}{nextSub.team_name.slice(0, 14)})</span>
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
                    {rich(tr('{done} of {total} Cohort Submissions Scored'), {
                      done: <strong className="text-white">{scoredInQueue}</strong>,
                      total: <strong className="text-white">{queue.length}</strong>,
                    })}
                  </span>
                  <span className="font-semibold text-accent-on-dark">{queueProgressPct}{tr('% Complete')}</span>
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
                  ? tr('CALIBRATION MODE ACTIVE: Override any criterion score on the right.')
                  : tr('EVENT STATUS: {status}', { status: STATUS_LABEL[sub.events.status].toUpperCase() })}
              </div>
            </div>
          ) : undefined
        }
      />

      {/* Error & Status Notices */}
      {['queued', 'analyzing', 'paused', 'error', 'canceled'].includes(sub.status) && sha && (
        <Notice tone={sub.status === 'error' ? 'error' : sub.status === 'paused' || sub.status === 'canceled' ? 'warn' : 'info'}>
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex-1">
              {sub.status === 'paused'
                ? tr('Judging is paused. Work done so far is cached and reused when it resumes.')
                : sub.status === 'canceled'
                  ? sub.error || tr('Judging was canceled.')
                  : sub.status === 'error'
                    ? sub.error || tr('This submission could not be judged.')
                    : tr('The AI is judging this submission. You can pause or cancel it.')}
            </span>
            {isManager && (
              <SubmissionJudgingControls
                id={sub.id}
                name={sub.team_name}
                status={sub.status as 'queued'}
                frozen={!!sha}
                busy={rejudging ? controlKey : null}
                act={(key, path, success, confirmText) => void control(key, path, success, confirmText)}
              />
            )}
          </span>
        </Notice>
      )}
      {!sha && (
        <Notice>
          {tr('This submission is judged when the event closes. Until then the participant can still send new versions.')}
        </Notice>
      )}

      {/* 2. 3-Column Ergonomic Workspace Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <SubmissionQueueRail
          eventId={id}
          activeSubmissionId={sub.id}
          activeTeamName={sub.team_name}
          sha={sha}
          isManager={isManager}
          queueLength={queue.length}
          queueLoading={queueLoading}
          queueSearch={queueSearch}
          onQueueSearchChange={setQueueSearch}
          filteredQueue={filteredQueue}
        />

        <section className="flex flex-col gap-5 lg:col-span-5">
          <SubmissionRepoAndRubric
            submissionId={sub.id}
            teamName={sub.team_name}
            status={sub.status}
            working={working}
            lockedAt={sub.locked_at}
            sha={sha}
            current={current}
            analysis={analysis}
            map={map}
            commits={commits}
            rubric={rubric}
            orderedScores={ordered}
            activeCriterionIdx={activeCriterionIdx}
            onActiveCriterionChange={setActiveCriterionIdx}
            activeCriterion={activeCriterion}
            activeScore={activeScore}
            repoUrl={repoUrl}
          />

          <SubmissionTimelineCards
            interview={data.interview}
            activity={activity}
            working={working}
            status={sub.status}
            nextAttemptAt={sub.next_attempt_at}
            error={sub.error}
            models={models}
            primaryModels={data.primary_models}
            feedback={feedback}
            versions={versions}
            sha={sha}
          />
        </section>

        <AdjudicationCockpit
          eventId={id}
          submissionId={sub.id}
          eventStatus={sub.events.status}
          canOverride={canOverride}
          canReview={canReview}
          isManager={isManager}
          queueLength={queue.length}
          aiTotal={aiTotal}
          total={total}
          delta={delta}
          rubric={rubric}
          orderedScores={ordered}
          repoUrl={repoUrl}
          sha={sha}
          videoUrl={current?.video_url ?? null}
          onScoreSaved={reload}
          nextSub={nextSub}
        />
      </div>
    </div>
  );
}
