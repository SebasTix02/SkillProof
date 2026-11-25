import { Link } from 'react-router-dom';
import {
  Button,
  LiveDot,
  ScoreBar,
  Spinner,
  formatDate,
  linkButtonSecondary,
} from '../../../components/shared';
import { tr, trn } from '../../../i18n';
import { rich } from '../../../i18n/rich';
import type { EventView } from '../../../lib/types';

export function EventLifecycleBanner({
  event,
  submissionsCount,
  firstSubmissionId,
  done,
  failed,
  progressPct,
  canManage,
  busy,
  confirmClose,
  onConfirmCloseChange,
  act,
}: {
  event: EventView;
  submissionsCount: number;
  firstSubmissionId: string | undefined;
  done: number;
  failed: number;
  progressPct: number;
  canManage: boolean;
  busy: string | null;
  confirmClose: boolean;
  onConfirmCloseChange: (open: boolean) => void;
  act: (key: string, path: string, success: string, confirmText?: string) => void;
}) {
  return (
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
            disabled={!!busy}
            loading={busy === 'open'}
            onClick={() =>
              act(
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
            <Button variant="secondary" onClick={() => onConfirmCloseChange(true)}>
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
                disabled={!!busy}
                loading={busy === 'close'}
                onClick={() =>
                  act(
                    'close',
                    `/api/events/${event.id}/close`,
                    tr('Submissions are closed. Judging has started.'),
                  )
                }
              >
                {busy === 'close' ? tr('Closing…') : tr('Yes, close and judge')}
              </Button>
              <Button variant="secondary" disabled={!!busy} onClick={() => onConfirmCloseChange(false)}>
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
                {rich(tr('{done} of {total} submissions judged. This page updates automatically every 5 seconds.'), {
                  done: <strong>{done}</strong>,
                  total: <strong>{submissionsCount}</strong>,
                })}
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
                  <Button disabled={!!busy} loading={busy === 'resume-all'} onClick={() => act('resume-all', `/api/events/${event.id}/judging/resume`, tr('Judging resumed.'))}>
                    {tr('Resume judging')}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" disabled={!!busy} loading={busy === 'pause-all'} onClick={() => act('pause-all', `/api/events/${event.id}/judging/pause`, tr('Judging paused. Running submissions stop at their next checkpoint.'))}>
                  {tr('Pause judging')}
                </Button>
              )}
              <Button
                variant="danger"
                disabled={!!busy}
                loading={busy === 'cancel-all'}
                onClick={() =>
                  act(
                    'cancel-all',
                    `/api/events/${event.id}/judging/cancel`,
                    tr('Judging canceled. The event moved to review; canceled submissions can be judged again.'),
                    tr('Cancel judging for every submission not judged yet ({n})? The event moves to review and you can judge them again later.', { n: submissionsCount - done }),
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
              {failed > 0
                ? trn('AI judging has finished ({count} failed) — Ready for score review', 'AI judging has finished ({count} failed) — Ready for score review', failed)
                : tr('AI judging has finished — Ready for score review')}
            </h2>
            <p className="max-w-2xl text-[13px] text-muted">
              {tr('Click any team below to open the Judge Workspace, inspect the cited files, override any criterion score you disagree with, and then publish the final standings. Participants see nothing until you publish.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {firstSubmissionId && (
              <Link to={`/org/events/${event.id}/s/${firstSubmissionId}`} className={linkButtonSecondary}>
                <span className="material-symbols-outlined text-[16px]">gavel</span>
                <span>{tr('Calibrate in Judge Workspace')}</span>
              </Link>
            )}
            <Button
              disabled={!!busy}
              loading={busy === 'publish'}
              onClick={() =>
                act(
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
  );
}
