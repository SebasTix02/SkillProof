import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Field, Input, Notice, PageState, formatDate, scoreTone } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useLoad } from '../lib/useLoad';

interface InterviewRow {
  id: string;
  status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error';
  submission_id: string | null;
  created_at: string;
  repos: { owner: string; name: string } | null;
  interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null;
}

const LABEL: Record<InterviewRow['status'], string> = {
  preparing: 'Reading your code',
  ready: 'Ready to start',
  in_progress: 'In progress',
  evaluating: 'Writing the report',
  completed: 'Completed',
  error: 'Failed',
};

export function InterviewHome() {
  const navigate = useNavigate();
  const list = useLoad<{ interviews: InterviewRow[] }>('/api/me/interviews');
  const [repoUrl, setRepoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', { body: { repo_url: repoUrl.trim() } });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prove you understand your code</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Paste a public GitHub repository you wrote. SkillProof reads it, then asks you about it out loud for three minutes.
          You get a skills report you can share.
        </p>
      </div>

      <Card>
        <form onSubmit={start} className="space-y-4">
          <Field label="Repository URL" hint="Public GitHub repositories only. Reading the code takes about a minute.">
            <Input
              type="url"
              required
              placeholder="https://github.com/you/your-project"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Prepare my interview'}</Button>
        </form>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">My interviews</h2>
        <PageState loading={list.loading} error={list.error} />
        {list.data && list.data.interviews.length === 0 && <p className="text-sm text-muted">You have not taken an interview yet.</p>}
        {list.data && list.data.interviews.length > 0 && (
          <ul className="space-y-2">
            {list.data.interviews.map((i) => {
              const report = Array.isArray(i.interview_reports) ? i.interview_reports[0] : i.interview_reports;
              return (
                <li key={i.id}>
                  <Link to={`/interview/${i.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4 hover:border-accent">
                    <span className="font-medium">{i.repos ? `${i.repos.owner}/${i.repos.name}` : 'Repository'}</span>
                    {i.submission_id && <Badge tone="accent">Event</Badge>}
                    <Badge tone={i.status === 'completed' ? 'good' : i.status === 'error' ? 'bad' : 'neutral'}>{LABEL[i.status]}</Badge>
                    <span className="ml-auto text-sm text-muted">{formatDate(i.created_at)}</span>
                    {report && <Badge tone={scoreTone(report.ownership_score, 100)}>Ownership {report.ownership_score}/100</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
