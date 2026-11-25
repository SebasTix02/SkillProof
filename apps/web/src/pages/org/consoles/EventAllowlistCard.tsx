import { useState, type ChangeEvent } from 'react';
import { Badge, Button, Notice, NumberedSectionCard, Textarea } from '../../../components/shared';
import { tr, trn } from '../../../i18n';
import { rich } from '../../../i18n/rich';
import { api, errorMessage } from '../../../lib/api';
import { useLoad } from '../../../lib/useLoad';

const EMAIL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g;

export function Allowlist({ eventId }: { eventId: string }) {
  const list = useLoad<{ allowlist: { email: string; claimed_by: string | null }[] }>(
    `/api/events/${eventId}/allowlist`,
  );
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'good' | 'error'; text: string } | null>(null);
  const emails = [...new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
    e.target.value = '';
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      for (let i = 0; i < emails.length; i += 2000) {
        await api(`/api/events/${eventId}/allowlist`, { body: { emails: emails.slice(i, i + 2000) } });
      }
      setMessage({ tone: 'good', text: tr('{n} emails are now on the list.', { n: emails.length }) });
      setText('');
      await list.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const joined = list.data?.allowlist.filter((a) => a.claimed_by).length ?? 0;

  return (
    <NumberedSectionCard
      number="AL"
      icon="mail_lock"
      title={tr('Invited Participant Allowlist')}
      subtitle={
        <>
          {tr('Only people who sign up with one of these emails and confirm it can join.')}
          {list.data && (
            <>
              {' '}
              {rich(tr('{invited} invited, {joined} joined.'), {
                invited: <strong>{list.data.allowlist.length}</strong>,
                joined: <strong>{joined}</strong>,
              })}
            </>
          )}
        </>
      }
      sectionTag={tr('INVITE-ONLY ACCESS')}
      theme="accent"
    >
      <div className="space-y-4">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={tr('Paste emails, one per line or separated by commas...')}
          aria-label={tr('Emails to invite')}
          className="font-mono-code text-[12px]"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="btn-tactile font-mono-code inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-paper px-3 py-1.5 text-[11px] font-semibold text-accent hover:border-accent">
            <span className="material-symbols-outlined text-[15px]">upload_file</span>
            <span>{tr('Upload CSV / TXT File')}</span>
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => void onFile(e)}
            />
          </label>
          <Button disabled={busy || emails.length === 0} loading={busy} onClick={() => void add()}>
            {busy ? tr('Adding…') : trn('Add {count} email', 'Add {count} emails', emails.length)}
          </Button>
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {list.data && list.data.allowlist.length > 0 && (
          <details className="rounded-[4px] border border-line bg-paper/60 p-3">
            <summary className="font-mono-code cursor-pointer text-[11px] font-semibold tracking-wider text-ink uppercase">
              {tr('Inspect Allowlist Roster (')}{list.data.allowlist.length}{' '}{tr('emails)')}
            </summary>
            <ul className="font-mono-code mt-2.5 max-h-56 space-y-1.5 overflow-auto border-t border-line pt-2.5 text-[12px]">
              {list.data.allowlist.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2">
                  <span className="text-ink">{a.email}</span>
                  {a.claimed_by ? <Badge tone="good">{tr('Joined')}</Badge> : <Badge>{tr('Invited')}</Badge>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </NumberedSectionCard>
  );
}
