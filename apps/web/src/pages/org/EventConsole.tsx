import { useState, type ChangeEvent } from 'react';
import type { ActivityEntry } from '@skillproof/shared';
import { Link, useParams } from 'react-router-dom';
import { modelName } from '../../components/AiActivity';
import { useToast } from '../../components/toast';
import { Badge, Button, Card, Notice, PageState, Spinner, Textarea, formatDate, scoreTone } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView, type RepoRef, type ScoreView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error';
  error: string | null;
  last_activity: ActivityEntry | null;
  models_used: string[] | null;
  versions_used: number;
  locked_commit_sha: string | null;
  current_version: { repos: RepoRef } | null;
  scores: ScoreView[];
  total: number | null;
  ownership: { score: number; confidence: string } | null;
}

interface Flag {
  id: string;
  submission_a: string;
  submission_b: string;
  signal: 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding';
  explanation: string;
}

interface ConsoleResponse {
  event: EventView;
  participant_count: number;
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}

const SUB_LABEL: Record<ConsoleSubmission['status'], string> = {
  submitted: 'Submitted',
  queued: 'Queued',
  analyzing: 'Being judged',
  scored: 'Scored',
  error: 'Failed',
};

const SIGNAL_LABEL: Record<Flag['signal'], string> = {
  same_repo: 'Same repository',
  same_fork_parent: 'Forks of the same project',
  identical_files: 'Identical files',
  embedding: 'Very similar code',
};

const EMAIL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g;

function Allowlist({ eventId }: { eventId: string }) {
  const list = useLoad<{ allowlist: { email: string; claimed_by: string | null }[] }>(`/api/events/${eventId}/allowlist`);
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
      for (let i = 0; i < emails.length; i += 2000) await api(`/api/events/${eventId}/allowlist`, { body: { emails: emails.slice(i, i + 2000) } });
      setMessage({ tone: 'good', text: `${emails.length} emails are now on the list.` });
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
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Invited emails</h2>
      <p className="text-sm text-muted">
        Only people who sign up with one of these emails, and confirm it, can join.
        {list.data && <> {list.data.allowlist.length} invited, {joined} joined.</>}
      </p>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste emails, one per line or separated by commas" aria-label="Emails to invite" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer text-sm font-medium text-accent hover:underline">
          Upload a CSV file
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e)} />
        </label>
        <Button className="ml-auto" disabled={busy || emails.length === 0} onClick={() => void add()}>
          {busy ? 'Adding…' : `Add ${emails.length} emails`}
        </Button>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {list.data && list.data.allowlist.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Show the list</summary>
          <ul className="mt-2 max-h-60 space-y-1 overflow-auto text-sm">
            {list.data.allowlist.map((a) => (
              <li key={a.email} className="flex items-center gap-2">
                <span>{a.email}</span>
                {a.claimed_by && <Badge tone="good">Joined</Badge>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function EventConsole() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad<ConsoleResponse>(`/api/events/${id}/console`, (d) => d.event.status === 'judging' || d.event.status === 'open' || d.submissions.some((s) => s.status === 'queued' || s.status === 'analyzing'), 5000);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!data) return <PageState loading={loading} error={error} />;
  const { event, submissions } = data;

  async function act(key: string, path: string, success: string) {
    setBusy(key);
    try {
      await api(path, { method: 'POST' });
      setConfirmClose(false);
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const link = `${window.location.origin}/e/${event.slug}`;
  const done = submissions.filter((s) => s.status === 'scored' || s.status === 'error').length;
  const failed = submissions.filter((s) => s.status === 'error').length;
  const teamName = (sid: string) => submissions.find((s) => s.id === sid)?.team_name ?? 'Unknown team';
  const flagged = new Set(data.similarity_flags.flatMap((f) => [f.submission_a, f.submission_b]));
  const ranked = event.status !== 'open' && event.status !== 'draft';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <Badge tone={event.status === 'open' ? 'good' : event.status === 'review' ? 'warn' : 'neutral'}>{STATUS_LABEL[event.status]}</Badge>
          <Badge>{VISIBILITY_LABEL[event.visibility]}</Badge>
        </div>
        <p className="text-sm text-muted">
          {data.participant_count} participants · {submissions.length} submissions · deadline {formatDate(event.submission_deadline)} ·{' '}
          {event.max_submissions == null ? 'unlimited submissions' : `${event.max_submissions} submissions per participant`}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Link for participants:</span>
          <code className="rounded bg-paper px-2 py-1">{link}</code>
          <button
            className="font-medium text-accent hover:underline"
            onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </header>

      <Card className="space-y-3">
        {event.status === 'draft' && (
          <>
            <p className="text-sm">This event is a draft. Participants cannot see it yet.</p>
            <Button disabled={!!busy} onClick={() => void act('open', `/api/events/${event.id}/open`, 'The event is open. Share the link with participants.')}>Open the event</Button>
          </>
        )}
        {event.status === 'open' && (
          <>
            <p className="text-sm">
              Submissions are open. At the deadline SkillProof records the last commit of every repository and judges exactly that code.
              Later commits are ignored.
            </p>
            {!confirmClose ? (
              <Button variant="secondary" onClick={() => setConfirmClose(true)}>Close and judge now</Button>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">Close submissions now? This cannot be undone.</span>
                <Button variant="danger" disabled={!!busy} onClick={() => void act('close', `/api/events/${event.id}/close`, 'Submissions are closed. Judging has started.')}>
                  {busy === 'close' ? 'Closing…' : 'Yes, close and judge'}
                </Button>
                <Button variant="secondary" disabled={!!busy} onClick={() => setConfirmClose(false)}>Cancel</Button>
              </div>
            )}
          </>
        )}
        {event.status === 'judging' && (
          <div className="flex flex-wrap items-center gap-3">
            <Spinner label="Judging" />
            <span className="text-sm">{done} of {submissions.length} submissions judged. This page updates on its own.</span>
          </div>
        )}
        {event.status === 'review' && (
          <>
            <p className="text-sm">
              Judging is finished{failed > 0 && `, and ${failed} submission${failed === 1 ? '' : 's'} failed`}. Review the scores, change any you disagree with, then publish.
              Participants see nothing until you do.
            </p>
            <Button disabled={!!busy} onClick={() => void act('publish', `/api/events/${event.id}/publish`, 'Results are published. Participants can see them now.')}>
              {busy === 'publish' ? 'Publishing…' : 'Publish results'}
            </Button>
          </>
        )}
        {event.status === 'published' && <p className="text-sm">Results were published {event.published_at && formatDate(event.published_at)}.</p>}
      </Card>

      {event.visibility === 'invite' && <Allowlist eventId={event.id} />}

      {data.similarity_flags.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Possible duplicates</h2>
          <p className="mb-3 text-sm text-muted">These are signals for you to check, not verdicts.</p>
          <ul className="space-y-2 text-sm">
            {data.similarity_flags.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">{SIGNAL_LABEL[f.signal]}</Badge>
                <Link to={`/org/events/${event.id}/s/${f.submission_a}`} className="font-medium hover:underline">{teamName(f.submission_a)}</Link>
                <span className="text-muted">and</span>
                <Link to={`/org/events/${event.id}/s/${f.submission_b}`} className="font-medium hover:underline">{teamName(f.submission_b)}</Link>
                {f.explanation && <span className="text-muted">· {f.explanation}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">{ranked ? 'Leaderboard' : 'Submissions'}</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted">No submissions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  {ranked && <th className="px-4 py-2">#</th>}
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2">Repository</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Score</th>
                  {event.interviews_enabled && <th className="px-4 py-2 text-right">Ownership</th>}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s, i) => {
                  const repo = s.current_version?.repos;
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      {ranked && <td className="px-4 py-3 tabular-nums text-muted">{s.total != null ? i + 1 : ''}</td>}
                      <td className="px-4 py-3">
                        <Link to={`/org/events/${event.id}/s/${s.id}`} className="font-medium hover:underline">{s.team_name}</Link>
                        <div className="text-xs text-muted">{s.submitted_by_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        {repo && <a href={repo.url} target="_blank" rel="noreferrer" className="hover:underline">{repo.owner}/{repo.name}</a>}
                        {s.locked_commit_sha && <code className="ml-2 text-xs text-muted">{s.locked_commit_sha.slice(0, 7)}</code>}
                        {flagged.has(s.id) && <span className="ml-2"><Badge tone="warn">Check</Badge></span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}>{SUB_LABEL[s.status]}</Badge>
                        {s.status === 'error' && s.error && <div className="mt-1 max-w-xs text-xs text-bad">{s.error}</div>}
                        {(s.status === 'queued' || s.status === 'analyzing') && s.last_activity && (
                          <div className="mt-1 max-w-xs text-xs text-muted">{s.last_activity.text}</div>
                        )}
                        {s.status === 'scored' && s.models_used && s.models_used.length > 0 && (
                          <div className="mt-1 text-xs text-muted">{s.models_used.map(modelName).join(', ')}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.total != null ? <Badge tone={scoreTone(s.total, 100)}>{s.total.toFixed(1)}</Badge> : <span className="text-muted">–</span>}
                      </td>
                      {event.interviews_enabled && (
                        <td className="px-4 py-3 text-right">
                          {s.ownership ? <Badge tone={scoreTone(s.ownership.score, 100)}>{s.ownership.score}</Badge> : <span className="text-muted">–</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        {s.status === 'error' && s.locked_commit_sha && (
                          <Button variant="secondary" disabled={!!busy} onClick={() => void act(`re-${s.id}`, `/api/submissions/${s.id}/rejudge`, `Judging ${s.team_name} again.`)}>
                            {busy === `re-${s.id}` ? 'Queuing…' : 'Judge again'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
