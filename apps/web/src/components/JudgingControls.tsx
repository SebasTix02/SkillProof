import { tr } from '../i18n';
import { Button } from './shared';

type Status = 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';

/**
 * Pause, resume, cancel and "Judge again" for one submission, depending on where its judging is.
 * `act(key, path, success, confirm?)` runs the request; the parent shows toasts and reloads.
 */
export function SubmissionJudgingControls({
  id,
  name,
  status,
  frozen,
  busy,
  act,
  compact = false,
  basePath = '/api/submissions',
}: {
  id: string;
  name: string;
  status: Status;
  frozen: boolean;
  busy: string | null;
  act: (key: string, path: string, success: string, confirm?: string) => void;
  compact?: boolean;
  /** /api/submissions for events, /api/assignment-submissions for course assignments. */
  basePath?: string;
}) {
  const cls = compact ? 'px-2.5 py-1 text-[11px]' : '';
  const running = status === 'queued' || status === 'analyzing';
  return (
    <>
      {running && (
        <Button variant="secondary" className={cls} disabled={!!busy} loading={busy === `pause-${id}`} onClick={() => act(`pause-${id}`, `${basePath}/${id}/pause`, tr('Judging of {name} paused. It stops at the next checkpoint.', { name }))}>
          {busy === `pause-${id}` ? tr('Pausing…') : tr('Pause')}
        </Button>
      )}
      {status === 'paused' && (
        <Button className={cls} disabled={!!busy} loading={busy === `resume-${id}`} onClick={() => act(`resume-${id}`, `${basePath}/${id}/resume`, tr('Judging of {name} resumed.', { name }))}>
          {busy === `resume-${id}` ? tr('Resuming…') : tr('Resume')}
        </Button>
      )}
      {(running || status === 'paused') && (
        <Button
          variant="danger"
          className={cls}
          disabled={!!busy} loading={busy === `cancel-${id}`}
          onClick={() =>
            act(`cancel-${id}`, `${basePath}/${id}/cancel`, tr('Judging of {name} canceled.', { name }), tr('Cancel judging {name}? No new scores are written. You can start over with "Judge again".', { name }))
          }
        >
          {busy === `cancel-${id}` ? tr('Canceling…') : tr('Cancel')}
        </Button>
      )}
      {(status === 'error' || status === 'canceled') && frozen && (
        <Button variant="secondary" className={cls} disabled={!!busy} loading={busy === `re-${id}`} onClick={() => act(`re-${id}`, `${basePath}/${id}/rejudge`, tr('Judging {name} again.', { name }))}>
          {busy === `re-${id}` ? tr('Queuing…') : tr('Judge again')}
        </Button>
      )}
    </>
  );
}
