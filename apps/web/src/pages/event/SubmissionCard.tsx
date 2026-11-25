import { tr, trn } from '../../i18n';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Field,
  Input,
  LiveDot,
  Notice,
  ScoreBar,
  Textarea,
  formatDate,
} from '../../components/shared';
import { api, errorMessage } from '../../lib/api';
import { type EventView } from '../../lib/types';
import { type MySubmission } from './types';

export function SubmissionCard({
  event,
  mine,
  onSubmitted,
}: {
  event: EventView;
  mine: MySubmission;
  onSubmitted: () => Promise<void>;
}) {
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
  const used = mine.submission?.versions_used ?? 0;
  const max = mine.max_submissions;
  const canSubmit = mine.accepting && (left === null || left > 0);
  const quotaScale = max ? Math.min(1, used / max) : used > 0 ? 0.5 : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api(`/api/events/${event.id}/submissions`, {
        body: {
          team_name: team,
          repo_url: repo.trim(),
          description,
          video_url: video.trim() || null,
          slides_url: slides.trim() || null,
        },
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
    <div className="space-y-5">
      {/* Workspace Status Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-line bg-surface p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          {mine.accepting ? <LiveDot tone="good" /> : <span className="h-2 w-2 rounded-full bg-muted" />}
          <span className="font-mono-code text-[12px] font-semibold text-ink">
            {mine.accepting
              ? tr('Workspace Active: Commit Freeze at {date}', { date: formatDate(event.submission_deadline) })
              : tr('Submission Window Closed')}
          </span>
        </div>
        <div className="font-mono-code rounded-[3px] border border-line bg-paper px-3 py-1 text-[11px] text-muted">
          {tr('TEAM:')}{' '}<span className="font-bold text-ink">{mine.submission?.team_name || tr('NOT SUBMITTED YET')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Submission Dossier Formulation */}
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <h2 className="font-serif-heading text-[22px] font-medium text-ink">{tr('Submission Dossier Formulation')}</h2>
            <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {current ? tr('ACTIVE VERSION #{n}', { n: current.version_no }) : tr('INITIAL SUBMISSION')}
            </span>
          </div>

          {current && (
            <div className="font-mono-code flex flex-wrap items-center justify-between gap-2 rounded-[4px] border border-line bg-paper px-3.5 py-2.5 text-[12px]">
              <div>
                <span className="text-muted">{tr('CURRENT REPO:')}{' '}</span>
                <a
                  className="font-semibold text-accent hover:underline"
                  href={current.repos.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {current.repos.owner}/{current.repos.name}
                </a>
                <span className="text-muted"> · v{current.version_no} ({formatDate(current.created_at)})</span>
              </div>
              {mine.submission?.locked_commit_sha && (
                <span className="rounded-[2px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                  {tr('FROZEN @')}{mine.submission.locked_commit_sha.slice(0, 7)}
                </span>
              )}
            </div>
          )}

          {canSubmit ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={tr('Registered Team Identifier')}>
                  <Input
                    required
                    maxLength={80}
                    placeholder={tr('Team Nova Consensus')}
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                  />
                </Field>

                <Field
                  label={tr('Git Ingestion Target (Public GitHub URL)')}
                  hint={tr('The latest commit at the deadline is frozen for evaluation.')}
                >
                  <Input
                    required
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://github.com/owner/repo')}
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                  />
                </Field>
              </div>

              <Field label={tr('Technical Abstract & Architectural Summary (What did you build?)')}>
                <Textarea
                  rows={4}
                  maxLength={4000}
                  placeholder={tr('Describe your architecture, key modules, and engineering trade-offs...')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={tr('Walkthrough Demo Video (Public YouTube)')}
                  hint={tr('Required if the rubric scores demo & pitch.')}
                >
                  <Input
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://youtu.be/…')}
                    value={video}
                    onChange={(e) => setVideo(e.target.value)}
                  />
                </Field>

                <Field label={tr('Slides or Technical Spec URL (Optional)')}>
                  <Input
                    type="url"
                    className="font-mono-code"
                    placeholder={tr('https://…')}
                    value={slides}
                    onChange={(e) => setSlides(e.target.value)}
                  />
                </Field>
              </div>

              {error && <Notice tone="error">{error}</Notice>}
              {done && (
                <Notice tone="good">
                  {tr('Submission received and verified. You can continue pushing commits until the deadline cutoff.')}
                </Notice>
              )}

              <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-4 sm:flex-row">
                <Button type="submit" disabled={busy} loading={busy} className="w-full sm:w-auto">
                  <span className="material-symbols-outlined text-[17px]">lock</span>
                  <span>
                    {busy ? tr('Checking Repository…') : current ? tr('Save & Send New Version') : tr('Submit Project Dossier')}
                  </span>
                </Button>
                <span className="font-mono-code text-[11px] text-muted">
                  {tr('Public GitHub repo verified before consuming quota')}
                </span>
              </div>
            </form>
          ) : (
            <p className="text-[13px] text-muted">
              {mine.accepting
                ? tr('You have used all allowed submission versions for this event.')
                : current
                  ? tr('Submissions are closed. Your latest version above is locked for evaluation.')
                  : tr('Submissions are closed and you did not submit a project.')}
            </p>
          )}
        </section>

        {/* Right 4 Cols: Ingestion Quota & Version Timeline */}
        <div className="space-y-6 lg:col-span-4">
          <section className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                {tr('Ingestion Quota')}
              </span>
              <span
                className={`font-mono-code text-[11px] font-bold ${
                  left === 0 ? 'text-bad' : 'text-good'
                }`}
              >
                {left === null ? tr('UNLIMITED VERSIONS') : tr('{left} OF {max} REMAINING', { left, max })}
              </span>
            </div>

            <ScoreBar value={quotaScale * 100} max={100} tone="accent" heightClass="h-2" />

            <p className="text-[12px] leading-relaxed text-muted">
              {max
                ? tr('{used} of {max} submission versions used.', { used, max })
                : trn('{count} submission version recorded.', '{count} submission versions recorded.', used)}{' '}
              {tr('At the deadline, SkillProof freezes the HEAD commit of your current version.')}
            </p>
          </section>

          <section className="space-y-4 rounded-[6px] border border-line bg-surface p-5">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Submission Timeline')}</h3>
              <span className="font-mono-code text-[11px] text-muted">
                {trn('{count} SNAPSHOT', '{count} SNAPSHOTS', versions.length)}
              </span>
            </div>

            {versions.length === 0 ? (
              <p className="text-[12px] text-muted">
                {tr('No versions submitted yet. Submit your repository on the left to record v1.')}
              </p>
            ) : (
              <ol className="space-y-3.5 pl-1">
                {versions.map((v, idx) => (
                  <li key={v.id} className="space-y-1 border-l-2 border-line pl-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-code text-[12px] font-bold text-ink">
                        v{v.version_no} {idx === 0 ? tr('(Active)') : ''}
                      </span>
                      <span
                        className={`font-mono-code rounded-[2px] px-1.5 py-0.5 text-[10px] font-semibold ${
                          idx === 0 ? 'bg-accent-soft text-accent-ink' : 'bg-paper text-muted'
                        }`}
                      >
                        {v.repos.owner}/{v.repos.name}
                      </span>
                    </div>
                    {v.description && <p className="line-clamp-2 text-[12px] text-muted">{v.description}</p>}
                    <span className="font-mono-code block text-[10px] text-muted">{formatDate(v.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
