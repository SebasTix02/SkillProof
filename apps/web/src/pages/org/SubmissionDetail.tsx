import { weightedTotal, type ActivityEntry, type CommitProfile, type RepoMap, type Rubric } from '@skillproof/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../../components/AiActivity';
import { one } from '../../components/Report';
import { useToast } from '../../components/toast';
import { Badge, Button, Card, Notice, PageState, Select, Spinner, formatDate, scoreTone } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Feedback, ScoreView, VersionView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

interface DetailResponse {
  submission: {
    id: string;
    team_name: string;
    status: string;
    error: string | null;
    activity_json: ActivityEntry[] | null;
    models_used: string[] | null;
    locked_commit_sha: string | null;
    locked_at: string | null;
    next_attempt_at?: string | null;
    judge_attempts?: number;
    events: { id: string; name: string; rubric_json: Rubric; status: string };
    repo_analyses: Analysis | Analysis[] | null;
    submission_versions: VersionView[];
  };
  scores: ScoreView[];
  feedback: Feedback | null;
  interview: { id: string; status: string } | null;
}

function ScoreRow({ score, criterion, repoUrl, sha, canOverride, onSaved }: {
  score: ScoreView;
  criterion: Rubric[number] | undefined;
  repoUrl: string | null;
  sha: string | null;
  canOverride: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const effective = score.override_score ?? score.ai_score;

  async function save(value: string) {
    setBusy(true);
    try {
      await api(`/api/scores/${score.id}`, { method: 'PATCH', body: { override_score: value === '' ? null : Number(value) } });
      toast.success(value === '' ? 'Back to the AI score.' : `Score changed to ${value}. The total is updated.`);
      onSaved();
    } catch (err) {
      toast.error(`The score was not saved. ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{criterion?.name ?? score.criterion_key}</h3>
        {criterion && <span className="text-xs text-muted">weight {criterion.weight}</span>}
        <span className="ml-auto flex items-center gap-2">
          {score.override_score != null && <span className="text-xs text-muted">AI gave {score.ai_score ?? '–'}</span>}
          <Badge tone={scoreTone(effective)}>{effective ?? '–'}/10</Badge>
          {score.override_score != null && <Badge tone="accent">Changed by you</Badge>}
        </span>
      </div>
      <p className="mt-2 text-sm">{score.justification}</p>
      {score.evidence_json.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="text-muted">Evidence:</span>
          {score.evidence_json.map((path) =>
            repoUrl && sha ? (
              <a key={path} href={`${repoUrl}/blob/${sha}/${path}`} target="_blank" rel="noreferrer" className="font-mono text-accent hover:underline">{path}</a>
            ) : (
              <code key={path}>{path}</code>
            ),
          )}
        </p>
      )}
      {canOverride && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Your score</span>
          <Select className="w-auto" disabled={busy} value={score.override_score ?? ''} onChange={(e) => void save(e.target.value)}>
            <option value="">Keep the AI score</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </label>
      )}
    </li>
  );
}

export function SubmissionDetail() {
  const { id, sid } = useParams();
  const { org } = useAuth();
  const toast = useToast();
  const [rejudging, setRejudging] = useState(false);
  const { data, error, loading, reload } = useLoad<DetailResponse>(
    `/api/submissions/${sid}`,
    (d) => d.submission.status === 'queued' || d.submission.status === 'analyzing',
  );
  if (!data) return <PageState loading={loading} error={error} />;
  const { submission: sub, scores, feedback } = data;

  async function rejudge() {
    setRejudging(true);
    try {
      await api(`/api/submissions/${sub.id}/rejudge`, { method: 'POST' });
      toast.success('Judging again. The steps appear below as the AI works.');
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRejudging(false);
    }
  }
  const rubric = sub.events.rubric_json;
  const analysis = one(sub.repo_analyses);
  const versions = [...sub.submission_versions].sort((a, b) => b.version_no - a.version_no);
  const current = versions[0];
  const repoUrl = current?.repos.url ?? null;
  const sha = sub.locked_commit_sha;
  const total = weightedTotal(rubric, scores);
  const canOverride = !!org?.permissions.includes('score.override') && sub.events.status === 'review';
  const ordered = rubric.flatMap((c) => scores.filter((s) => s.criterion_key === c.key));
  const map = analysis?.map_json;
  const commits = analysis?.commit_profile_json;
  const activity = sub.activity_json ?? [];
  const working = sub.status === 'queued' || sub.status === 'analyzing';
  const models = sub.models_used?.length ? sub.models_used : analysis?.model ? [analysis.model] : [];

  return (
    <div className="space-y-6">
      <header>
        <Link to={`/org/events/${id}`} className="text-sm text-accent hover:underline">← {sub.events.name}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{sub.team_name}</h1>
          {total != null && <Badge tone={scoreTone(total, 100)}>{total.toFixed(1)} / 100</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {current && <a href={current.repos.url} target="_blank" rel="noreferrer" className="hover:underline">{current.repos.owner}/{current.repos.name}</a>}
          {sha && <> · frozen at <code>{sha.slice(0, 7)}</code>{sub.locked_at && ` on ${formatDate(sub.locked_at)}`}</>}
          {analysis && <> · {analysis.file_count} files read</>}
        </p>
      </header>

      {sub.status === 'error' && (
        <Notice tone="error">
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex-1">{sub.error || 'This submission could not be judged.'}</span>
            {sha && (
              <Button variant="secondary" disabled={rejudging} onClick={() => void rejudge()}>
                {rejudging ? 'Queuing…' : 'Judge again'}
              </Button>
            )}
          </span>
        </Notice>
      )}
      {!sha && <Notice>This submission is judged when the event closes. Until then the participant can still send new versions.</Notice>}
      {data.interview && (
        <Notice>
          This participant {data.interview.status === 'completed' ? 'completed' : 'started'} a voice interview about this code.{' '}
          <Link to={`/interview/${data.interview.id}`} className="font-medium underline">Open the interview</Link>
        </Notice>
      )}

      {(activity.length > 0 || working || models.length > 0) && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">How the AI judged it</h2>
            {working && <Spinner label={sub.status === 'queued' ? 'Waiting to start' : 'Working'} />}
          </div>
          {models.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Models used:</span>
              <ModelsUsed models={models} />
            </p>
          )}
          {sub.status === 'queued' && sub.next_attempt_at && sub.error && <Notice tone="warn">{sub.error}</Notice>}
          {activity.length > 0 ? (
            <AiActivity entries={activity} live={working} />
          ) : (
            working && <p className="text-sm text-muted">The steps appear here as the AI works. This page updates on its own.</p>
          )}
        </Card>
      )}

      {ordered.length > 0 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Scores</h2>
          <p className="mb-3 text-sm text-muted">
            {canOverride
              ? 'Each score comes with the reason and the files behind it. Change any score you disagree with. The total updates right away.'
              : sub.events.status === 'published'
                ? 'Results are published, so scores can no longer be changed.'
                : 'Each score comes with the reason and the files behind it.'}
          </p>
          <ul className="space-y-3">
            {ordered.map((s) => (
              <ScoreRow key={s.id} score={s} criterion={rubric.find((c) => c.key === s.criterion_key)} repoUrl={repoUrl} sha={sha} canOverride={canOverride} onSaved={reload} />
            ))}
          </ul>
        </Card>
      )}

      {map && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">What the project is</h2>
          <p className="text-sm">{map.summary}</p>
          <div className="flex flex-wrap gap-2">
            {[...map.stack.languages, ...map.stack.frameworks, ...map.stack.services].map((t) => <Badge key={t}>{t}</Badge>)}
            <Badge tone={map.complexity_signals.has_tests ? 'good' : 'neutral'}>{map.complexity_signals.has_tests ? 'Has tests' : 'No tests'}</Badge>
            <Badge tone={map.complexity_signals.has_ci ? 'good' : 'neutral'}>{map.complexity_signals.has_ci ? 'Has CI' : 'No CI'}</Badge>
          </div>
          {commits && (
            <p className="text-sm text-muted">
              {commits.total_commits} commits by {commits.authors.length} author{commits.authors.length === 1 ? '' : 's'}
              {commits.commits_before_start != null && commits.commits_before_start > 0 && (
                <>, <span className="font-medium text-warn">{commits.commits_before_start} of them before the event started</span></>
              )}
              .
            </p>
          )}
          {map.key_decisions.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Key decisions</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {map.key_decisions.map((d, i) => <li key={i}>{d.decision} <span className="text-muted">{d.rationale}</span></li>)}
              </ul>
            </div>
          )}
          {map.weaknesses.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Weak points</h3>
              <ul className="space-y-1 text-sm">
                {map.weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge tone={w.severity === 'high' ? 'bad' : w.severity === 'medium' ? 'warn' : 'neutral'}>{w.severity}</Badge>
                    <span>{w.issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {feedback && (
        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Feedback the team will receive</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {feedback.strengths_json.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          <ul className="space-y-2 text-sm">
            {feedback.improvements_json.map((f, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <p className="font-medium">{f.what}</p>
                <p className="text-muted">{f.where}</p>
                <p className="mt-1">Next step: {f.next_step}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Versions sent</h2>
        <ol className="space-y-3 text-sm">
          {versions.map((v, i) => (
            <li key={v.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Version {v.version_no}</span>
                {i === 0 && <Badge tone="accent">{sha ? 'Judged' : 'Latest'}</Badge>}
                <span className="text-muted">{formatDate(v.created_at)}</span>
              </div>
              {v.description && <p className="mt-2 whitespace-pre-line">{v.description}</p>}
              <p className="mt-2 flex flex-wrap gap-3">
                <a href={v.repos.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Repository</a>
                {v.video_url && <a href={v.video_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Demo video</a>}
                {v.slides_url && <a href={v.slides_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">Slides</a>}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
