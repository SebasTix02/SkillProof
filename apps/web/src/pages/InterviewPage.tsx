import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity } from '../components/AiActivity';
import { PrintMasthead } from '../components/PrintMasthead';
import {
  Button,
  DossierPageHeader,
  Notice,
  PageState,
  Spinner,
  linkButtonSecondary,
  questionToOptions,
  useConfirm,
} from '../components/shared';
import { useToast } from '../components/toast';
import { tr } from '../i18n';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { InterviewDossier } from './interview/InterviewDossier';
import { InterviewRoom } from './interview/InterviewRoom';
import { InterviewStepper } from './interview/InterviewStepper';
import type { InterviewResponse } from './interview/types';

export function InterviewPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const [liveActive, setLiveActive] = useState(false);

  const { data, error, loading, reload } = useLoad<InterviewResponse>(
    `/api/interviews/${id}`,
    (d) => d.interview.status === 'preparing' || d.interview.status === 'evaluating',
  );

  const toast = useToast();
  const confirm = useConfirm();
  const [acting, setActing] = useState<string | null>(null);

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;
  const { interview } = data;
  const activity = data.activity ?? [];

  /** Cancel a preparation, or pause, resume or cancel the report. */
  async function control(action: 'cancel' | 'pause-report' | 'resume-report', confirmText?: string) {
    if (
      confirmText &&
      !(await confirm(
        questionToOptions(confirmText, {
          confirmLabel: action === 'cancel' ? tr('Cancel it') : tr('Confirm'),
          cancelLabel: tr('Keep it'),
        }),
      ))
    ) {
      return;
    }
    setActing(action);
    try {
      await api(`/api/interviews/${interview.id}/${action}`, { method: 'POST' });
      toast.success(
        action === 'cancel'
          ? interview.status === 'preparing'
            ? tr('Preparation canceled. It does not count as your interview on this commit.')
            : tr('Report canceled. Your answers are saved.')
          : action === 'pause-report'
            ? tr('Report paused.')
            : tr('Writing the report.'),
      );
      await reload();
    } catch (err) {
      toast.error(tr('Could not do that. {error}', { error: errorMessage(err) }));
    } finally {
      setActing(null);
    }
  }

  const profile = me?.public_profile;
  const publicUrl = profile?.slug ? `${window.location.origin}/p/${profile.slug}` : null;

  return (
    <div className="space-y-8">
      {/* Top Stage Controller */}
      {interview.status === 'completed' && (
        <PrintMasthead
          kind={tr('Voice interview report')}
          name={
            interview.is_owner && me?.profile.display_name
              ? me.profile.display_name
              : `${interview.repo.owner}/${interview.repo.name}`
          }
          repo={`${interview.repo.owner}/${interview.repo.name}`}
          commit={interview.commit_sha}
          date={interview.created_at}
          url={publicUrl}
        />
      )}
      <div className="no-print">
        <InterviewStepper status={interview.status} liveActive={liveActive} />
      </div>

      {/* Page Masthead */}
      <DossierPageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            {interview.assignment ? (
              <Link
                to={
                  interview.is_owner
                    ? `/courses/${interview.assignment.course_id}/a/${interview.assignment.id}`
                    : `/org/courses/${interview.assignment.course_id}/assignments/${interview.assignment.id}`
                }
                className="text-accent hover:underline"
              >
                ← {interview.assignment.title.toUpperCase()}
              </Link>
            ) : (
              <Link to="/interview/new" className="text-accent hover:underline">
                {tr('← MY INTERVIEWS')}
              </Link>
            )}
            <span>•</span>
            <span>{tr('DOSSIER #')}{interview.id.slice(0, 8).toUpperCase()}</span>
            {interview.commit_sha && (
              <>
                <span>•</span>
                <span className="rounded-[3px] border border-line bg-surface px-2 py-0.5 text-ink">
                  {tr('COMMIT')}{' '}<code>{interview.commit_sha.slice(0, 7)}</code>
                </span>
              </>
            )}
          </div>
        }
        title={tr('Oral Verification: {repo}', { repo: `${interview.repo.owner}/${interview.repo.name}` })}
        subtitle={interview.summary}
        rightSlot={
          <a
            href={interview.repo.url}
            target="_blank"
            rel="noreferrer"
            className="btn-tactile font-mono-code inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
          >
            <span>{tr('Inspect GitHub Repo')}</span>
            <span>↗</span>
          </a>
        }
      />

      {/* Stage 01: Preparing Repository & Questions */}
      {interview.status === 'preparing' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label={tr('Reading the repository and preparing your code-anchored questions')} />
            <p className="text-[13px] text-muted">
              {tr('This takes about a minute. You can leave this page open; it will advance automatically.')}
            </p>
          </div>
          {interview.is_owner && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={!!acting}
                loading={acting === 'cancel'}
                onClick={() =>
                  void control(
                    'cancel',
                    tr('Cancel the preparation? You can start again later; it does not use up your interview on this commit.'),
                  )
                }
              >
                {acting === 'cancel' ? tr('Canceling…') : tr('Cancel preparation')}
              </Button>
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {interview.status === 'canceled' && (
        <div className="space-y-4">
          <Notice>
            {tr('This interview was canceled before it started, so it does not count. You can start a new one.')}
          </Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>
            {tr('Start another interview')}
          </Link>
        </div>
      )}

      {(interview.status === 'report_paused' || interview.status === 'report_canceled') && (
        <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
          <Notice tone="warn">
            {interview.status === 'report_paused'
              ? tr('The report is paused. Your answers are saved; resume whenever you want.')
              : tr('The report was canceled. Your answers are saved, and you can have it written at any time.')}
          </Notice>
          {interview.is_owner && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!acting} loading={acting === 'resume-report'} onClick={() => void control('resume-report')}>
                {interview.status === 'report_paused' ? tr('Resume the report') : tr('Write the report')}
              </Button>
              {interview.status === 'report_paused' && (
                <Button
                  variant="secondary"
                  disabled={!!acting}
                  loading={acting === 'cancel'}
                  onClick={() =>
                    void control('cancel', tr('Cancel the report? Your answers stay saved and you can write it later.'))
                  }
                >
                  {tr('Cancel the report')}
                </Button>
              )}
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} />}
        </section>
      )}

      {/* Error State */}
      {interview.status === 'error' && (
        <div className="space-y-4">
          <Notice tone="error">{interview.error || tr('This interview could not be completed.')}</Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>
            {tr('Start another interview')}
          </Link>
        </div>
      )}

      {/* Stage 02 & 03: Ready / In Progress Live Cockpit */}
      {(interview.status === 'ready' || interview.status === 'in_progress') &&
        (interview.is_owner ? (
          <InterviewRoom data={data} onChanged={reload} onLiveChange={setLiveActive} />
        ) : (
          <Notice>{tr('The candidate has not finished this interview yet.')}</Notice>
        ))}

      {/* Stage 04: Evaluating Transcript */}
      {interview.status === 'evaluating' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label={tr('Synthesizing your ownership score and pinning verbatim transcript evidence')} />
            <p className="text-[13px] text-muted">{tr('Usually completes in under a minute.')}</p>
          </div>
          {interview.error && <Notice tone="warn">{interview.error}</Notice>}
          {interview.is_owner && (
            <div className="flex justify-center gap-2">
              <Button variant="secondary" disabled={!!acting} loading={acting === 'pause-report'} onClick={() => void control('pause-report')}>
                {tr('Pause')}
              </Button>
              <Button
                variant="secondary"
                disabled={!!acting}
                loading={acting === 'cancel'}
                onClick={() =>
                  void control(
                    'cancel',
                    tr('Cancel the report? Your answers stay saved and you can write it later. This still counts as your interview on this commit.'),
                  )
                }
              >
                {tr('Cancel')}
              </Button>
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {/* Stage 05: Completed Verified Skills Report Dossier */}
      {interview.status === 'completed' && data.report && (
        <InterviewDossier data={data} me={me} publicUrl={publicUrl} />
      )}
    </div>
  );
}
