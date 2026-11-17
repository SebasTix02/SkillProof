import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Field, Input, Notice, PageState, Textarea, formatDate, linkButton, scoreTone } from '../components/ui';
import { useToast } from '../components/toast';
import { api, errorMessage } from '../lib/api';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView, type Feedback, type ScoreView, type VersionView } from '../lib/types';
import { useLoad } from '../lib/useLoad';

interface EventResponse {
  event: EventView;
  is_participant: boolean;
  is_manager: boolean;
}

interface MySubmission {
  submission: { id: string; team_name: string; status: string; versions_used: number; current_version_id: string; locked_commit_sha: string | null; submission_versions: VersionView[] } | null;
  max_submissions: number | null;
  submissions_left: number | null;
  accepting: boolean;
}

interface Results {
  published: boolean;
  status: EventView['status'];
  leaderboard?: { rank: number; team_name: string; total: number; mine: boolean }[];
  mine?: { id: string; team_name: string; total: number | null; scores: ScoreView[]; note: string | null; ownership: { score: number; confidence: string } | null } | null;
  feedback?: Feedback | null;
  interview?: { id: string; status: string } | null;
}

export function EventPage() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useLoad<EventResponse>(`/api/events/by-slug/${slug}`);
  if (!data) return <PageState loading={loading} error={error} />;
  const { event } = data;
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          <Badge tone={event.status === 'open' ? 'good' : 'neutral'}>{STATUS_LABEL[event.status]}</Badge>
          <Badge>{VISIBILITY_LABEL[event.visibility]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {event.organization?.name} · Submissions close {formatDate(event.submission_deadline)}
        </p>
        {event.description && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm">{event.description}</p>}
        {data.is_manager && <p className="mt-3"><Link to={`/org/events/${event.id}`} className="text-sm font-medium text-accent hover:underline">Open the organizer console</Link></p>}
      </header>

      {!data.is_participant ? <Join event={event} onJoined={reload} /> : <Participant event={event} />}

      {event.rubric_json.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">How projects are scored</h2>
          <ul className="space-y-2 text-sm">
            {event.rubric_json.map((c) => (
              <li key={c.key} className="flex gap-3">
                <span className="w-12 shrink-0 text-right font-medium tabular-nums">{c.weight}%</span>
                <span><strong>{c.name}.</strong> <span className="text-muted">{c.description}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Join({ event, onJoined }: { event: EventView; onJoined: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const open = event.status === 'open' && Date.parse(event.submission_deadline) > Date.now();

  async function join(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${event.id}/join`, { body: { access_code: code || undefined } });
      toast.success(`You joined ${event.name}.`);
      await onJoined();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Notice>This event is not accepting new participants.</Notice>;
  return (
    <Card>
      <h2 className="text-lg font-semibold">Join this event</h2>
      <form onSubmit={join} className="mt-3 max-w-sm space-y-3">
        {event.visibility === 'code' && (
          <Field label="Access code" hint="The organizer shared it with participants.">
            <Input required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </Field>
        )}
        {event.visibility === 'invite' && <p className="text-sm text-muted">This event is invite-only. You can join if the organizer added the email of this account.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join event'}</Button>
      </form>
    </Card>
  );
}

function Participant({ event }: { event: EventView }) {
  const mine = useLoad<MySubmission>(`/api/events/${event.id}/my-submission`);
  const results = useLoad<Results>(`/api/events/${event.id}/results`, (r) => r.status === 'judging' || r.status === 'review');
  if (!mine.data) return <PageState loading={mine.loading} error={mine.error} />;
  const closed = !mine.data.accepting;
  return (
    <>
      {closed && results.data && !results.data.published && (
        <Notice>
          {results.data.status === 'judging'
            ? 'Submissions are closed and the projects are being evaluated.'
            : results.data.status === 'review'
              ? 'The organizer is reviewing the scores. Results appear here once they are published.'
              : 'Submissions are closed.'}
        </Notice>
      )}
      {results.data?.published && <ResultsView event={event} results={results.data} />}
      <SubmissionCard event={event} mine={mine.data} onSubmitted={mine.reload} />
    </>
  );
}

function SubmissionCard({ event, mine, onSubmitted }: { event: EventView; mine: MySubmission; onSubmitted: () => Promise<void> }) {
  const versions = [...(mine.submission?.submission_versions ?? [])].sort((a, b) => b.version_no - a.version_no);
  const current = versions[0];
  const [team, setTeam] = useState(mine.submission?.team_name ?? '');
  const [repo, setRepo] = useState(current?.repos.url ?? '');
  const [video, setVideo] = useState(current?.video_url ?? '');
  const [slides, setSlides] = useState(current?.slides_url ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const left = mine.submissions_left;
  const canSubmit = mine.accepting && (left === null || left > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/events/${event.id}/submissions`, {
        body: { team_name: team, repo_url: repo.trim(), description, video_url: video.trim() || null, slides_url: slides.trim() || null },
      });
      setDone(true);
      await onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">My submission</h2>
        {mine.accepting && (
          <Badge tone={left === 0 ? 'bad' : 'accent'}>
            {left === null ? 'Unlimited submissions' : `${left} of ${mine.max_submissions} submissions left`}
          </Badge>
        )}
      </div>

      {current && (
        <p className="mt-2 text-sm text-muted">
          Current: version {current.version_no}, <a className="text-accent hover:underline" href={current.repos.url} target="_blank" rel="noreferrer">{current.repos.owner}/{current.repos.name}</a>, sent {formatDate(current.created_at)}.
          {mine.submission?.locked_commit_sha && <> Judged at commit <code className="font-mono">{mine.submission.locked_commit_sha.slice(0, 7)}</code>.</>}
        </p>
      )}

      {canSubmit ? (
        <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Team name"><Input required maxLength={80} value={team} onChange={(e) => setTeam(e.target.value)} /></Field>
          <Field label="GitHub repository" hint="Must be public. The last commit at the deadline is the one that counts.">
            <Input required type="url" placeholder="https://github.com/owner/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </Field>
          <Field label="Demo and pitch video" hint="A public YouTube link. Without it, demo and pitch are not scored.">
            <Input type="url" placeholder="https://youtu.be/…" value={video} onChange={(e) => setVideo(e.target.value)} />
          </Field>
          <Field label="Slides (optional)"><Input type="url" placeholder="https://…" value={slides} onChange={(e) => setSlides(e.target.value)} /></Field>
          <div className="md:col-span-2">
            <Field label="What did you build?"><Textarea rows={4} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          <div className="space-y-3 md:col-span-2">
            {error && <Notice tone="error">{error}</Notice>}
            {done && <Notice tone="good">Submission received. You can keep pushing commits until the deadline.</Notice>}
            <Button type="submit" disabled={busy}>{busy ? 'Checking repository…' : current ? 'Send a new version' : 'Submit project'}</Button>
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {mine.accepting ? 'You have used all your submissions for this event.' : current ? 'Submissions are closed.' : 'Submissions are closed and you did not submit a project.'}
        </p>
      )}

      {versions.length > 1 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">Version history ({versions.length})</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {versions.map((v) => <li key={v.id}>Version {v.version_no} · {v.repos.owner}/{v.repos.name} · {formatDate(v.created_at)}</li>)}
          </ul>
        </details>
      )}
    </Card>
  );
}

function ResultsView({ event, results }: { event: EventView; results: Results }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = results.mine;

  async function startInterview() {
    if (!mine) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', { body: { submission_id: mine.id } });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Leaderboard</h2>
        <ol className="divide-y divide-line text-sm">
          {results.leaderboard?.map((row) => (
            <li key={row.rank} className={`flex items-center gap-3 py-2 ${row.mine ? 'font-semibold' : ''}`}>
              <span className="w-6 text-right tabular-nums text-muted">{row.rank}</span>
              <span className="flex-1">{row.team_name}{row.mine && <span className="ml-2 text-xs font-medium text-accent">You</span>}</span>
              <span className="tabular-nums">{row.total.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      </Card>

      {mine && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Your scores</h2>
            {mine.total != null && <span className="text-2xl font-semibold tabular-nums">{mine.total.toFixed(1)}<span className="text-sm font-normal text-muted"> / 100</span></span>}
          </div>
          {mine.note && <div className="mt-3"><Notice tone="warn">{mine.note}</Notice></div>}
          <ul className="mt-3 space-y-3">
            {event.rubric_json.map((c) => {
              const s = mine.scores.find((x) => x.criterion_key === c.key);
              const value = s?.override_score ?? s?.ai_score ?? null;
              return (
                <li key={c.key} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={scoreTone(value)}>{value ?? '–'} / 10</Badge>
                    <strong>{c.name}</strong>
                    {s?.override_score != null && <span className="text-xs text-muted">adjusted by a judge</span>}
                  </div>
                  {s?.justification && <p className="mt-1 text-muted">{s.justification}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {results.feedback && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Feedback</h2>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <h3 className="mb-1 font-medium">Strengths</h3>
              <ul className="list-disc space-y-1 pl-5 text-muted">{results.feedback.strengths_json.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <h3 className="mb-1 font-medium">What to improve</h3>
              <ul className="space-y-2 text-muted">
                {results.feedback.improvements_json.map((s, i) => (
                  <li key={i}><span className="text-ink">{s.what}</span> <code className="font-mono text-xs">{s.where}</code><br />Next step: {s.next_step}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {mine && event.interviews_enabled && (
        <Card>
          <h2 className="text-lg font-semibold">Ownership interview</h2>
          {mine.ownership ? (
            <p className="mt-2 text-sm">Your ownership score is <strong>{mine.ownership.score} / 100</strong>. <Link className="text-accent hover:underline" to={`/interview/${results.interview?.id}`}>See the report</Link></p>
          ) : results.interview ? (
            <p className="mt-2 text-sm"><Link className={linkButton} to={`/interview/${results.interview.id}`}>Continue your interview</Link></p>
          ) : (
            <>
              <p className="mt-2 max-w-xl text-sm text-muted">A three-minute voice conversation about the code you submitted. It shows the organizer that you understand what you built. You get one attempt.</p>
              {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
              <Button className="mt-3" onClick={() => void startInterview()} disabled={busy}>{busy ? 'Preparing…' : 'Prepare my interview'}</Button>
            </>
          )}
        </Card>
      )}
    </>
  );
}
