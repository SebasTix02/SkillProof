import { tr } from '../../i18n';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice, formatDate } from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { VISIBILITY_LABEL, type EventView } from '../../lib/types';

export function JoinPanel({ event, onJoined }: { event: EventView; onJoined: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const toast = useToast();
  const open = event.status === 'open' && Date.parse(event.submission_deadline) > now;

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${event.id}/join`, { body: { access_code: code || undefined } });
      toast.success(tr('You joined {name}.', { name: event.name }));
      await onJoined();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Notice tone="warn">{tr('This event is not accepting new participants.')}</Notice>;
  }

  return (
    <div className="space-y-5">
      {event.visibility !== 'public' && (
        <Notice tone="warn">
          <strong className="font-semibold">{tr('Restricted Event Access:')}{' '}</strong>
          {event.visibility === 'code'
            ? tr('This event requires an organizer access code to claim a participant workspace.')
            : tr('This event is invite-only. You can join if the organizer added your account email to the allowlist.')}
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <div className="flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 sm:p-8 md:col-span-7">
          <div className="space-y-4">
            <span className="font-mono-code inline-block rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink uppercase">
              {tr('STAGE 01 // CANDIDATE REGISTRATION')}
            </span>
            <h2 className="font-serif-heading text-[26px] leading-tight font-medium text-ink">
              {tr('Join')}{' '}{event.name}
            </h2>
            <p className="text-[14px] leading-relaxed text-muted">
              {tr('Register as a participant to unlock the repository submission console. You can push commits and update your submission until the deadline cutoff.')}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-[4px] border border-line bg-paper p-3.5">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Access Mode')}</span>
                <span className="font-serif-heading mt-0.5 block text-[20px] font-semibold text-ink">
                  {VISIBILITY_LABEL[event.visibility]}
                </span>
              </div>
              <div className="rounded-[4px] border border-line bg-paper p-3.5">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Submission Quota')}</span>
                <span className="font-serif-heading mt-0.5 block text-[20px] font-semibold text-ink">
                  {event.max_submissions ? tr('{n} Versions', { n: event.max_submissions }) : tr('Unlimited')}
                </span>
              </div>
            </div>
          </div>

          {event.visibility !== 'code' && (
            <form onSubmit={join} className="space-y-3">
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" disabled={busy} loading={busy} className="px-6 py-2.5">
                <span className="material-symbols-outlined text-[17px]">key</span>
                <span>{busy ? tr('Joining Event…') : tr('Join Event as Candidate')}</span>
                <span className="arrow-nudge font-mono-code text-[12px]">→</span>
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-col justify-between space-y-6 rounded-[6px] border border-line bg-surface p-6 sm:p-8 md:col-span-5">
          {event.visibility === 'code' ? (
            <form onSubmit={join} className="flex h-full flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Redeem Access Code')}</h3>
                <p className="text-[13px] leading-relaxed text-muted">
                  {tr('Enter the access code shared by the event organizer to unlock your submission workspace.')}
                </p>
              </div>

              <div className="space-y-3">
                <Field label={tr('Organizer Access Code')}>
                  <Input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={tr('ENTER ACCESS CODE')}
                    autoComplete="off"
                    className="font-mono-code bg-paper text-center text-[14px] tracking-widest uppercase"
                  />
                </Field>
                {error && <Notice tone="error">{error}</Notice>}
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-tactile w-full cursor-pointer rounded-[4px] border border-ink bg-ink py-2.5 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent disabled:opacity-50"
                >
                  {busy ? tr('Verifying Code…') : tr('Submit Code & Claim Workspace')}
                </button>
              </div>

              <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
                <span className="material-symbols-outlined text-[15px]">lock_clock</span>
                <span>{tr('Closes')}{' '}{formatDate(event.submission_deadline)}</span>
              </div>
            </form>
          ) : (
            <div className="flex h-full flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Verification Protocol')}</h3>
                <p className="text-[13px] leading-relaxed text-muted">
                  {event.visibility === 'invite'
                    ? tr('Your account email is checked against the organizer allowlist when you click Join Event.')
                    : tr('This event is open to all registered SkillProof accounts.')}
                </p>
              </div>
              <div className="space-y-2 rounded-[4px] border border-line bg-paper p-4">
                <div className="font-mono-code text-[11px] font-semibold text-ink uppercase">{tr('What Happens Next')}</div>
                <p className="text-[12px] text-muted">
                  {tr('1. Submit your public GitHub repository URL and team name.')}<br />
                  {tr('2. At the deadline, the latest commit SHA is frozen and scored.')}<br />
                  {event.interviews_enabled && tr('3. Defend your code in a 3-minute voice interview.')}
                </p>
              </div>
              <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
                <span className="material-symbols-outlined text-[15px]">lock_clock</span>
                <span>{tr('Closes')}{' '}{formatDate(event.submission_deadline)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
