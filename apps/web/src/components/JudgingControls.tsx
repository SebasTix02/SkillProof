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
        <Button variant="secondary" className={cls} disabled={!!busy} loading={busy === `pause-${id}`} onClick={() => act(`pause-${id}`, `${basePath}/${id}/pause`, `Judging of ${name} paused. It stops at the next checkpoint.`)}>
          {busy === `pause-${id}` ? 'Pausing…' : 'Pause'}
        </Button>
      )}
      {status === 'paused' && (
        <Button className={cls} disabled={!!busy} loading={busy === `resume-${id}`} onClick={() => act(`resume-${id}`, `${basePath}/${id}/resume`, `Judging of ${name} resumed.`)}>
          {busy === `resume-${id}` ? 'Resuming…' : 'Resume'}
        </Button>
      )}
      {(running || status === 'paused') && (
        <Button
          variant="danger"
          className={cls}
          disabled={!!busy} loading={busy === `cancel-${id}`}
          onClick={() =>
            act(`cancel-${id}`, `${basePath}/${id}/cancel`, `Judging of ${name} canceled.`, `Cancel judging ${name}? No new scores are written. You can start over with "Judge again".`)
          }
        >
          {busy === `cancel-${id}` ? 'Canceling…' : 'Cancel'}
        </Button>
      )}
      {(status === 'error' || status === 'canceled') && frozen && (
        <Button variant="secondary" className={cls} disabled={!!busy} loading={busy === `re-${id}`} onClick={() => act(`re-${id}`, `${basePath}/${id}/rejudge`, `Judging ${name} again.`)}>
          {busy === `re-${id}` ? 'Queuing…' : 'Judge again'}
        </Button>
      )}
    </>
  );
}
