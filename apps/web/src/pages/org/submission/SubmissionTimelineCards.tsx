import type { ActivityEntry } from '@skillproof/shared';
import { Link } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../../../components/AiActivity';
import { Badge, Notice, Spinner, formatDate, linkButtonSecondary } from '../../../components/shared';
import { tr } from '../../../i18n';
import type { Feedback, VersionView } from '../../../lib/types';

export function SubmissionTimelineCards({
  interview,
  activity,
  working,
  status,
  nextAttemptAt,
  error,
  models,
  primaryModels,
  feedback,
  versions,
  sha,
}: {
  interview: { id: string; status: string } | null;
  activity: ActivityEntry[];
  working: boolean;
  status: string;
  nextAttemptAt: string | null | undefined;
  error: string | null;
  models: string[];
  primaryModels: string[] | undefined;
  feedback: Feedback | null;
  versions: readonly VersionView[];
  sha: string | null;
}) {
  return (
    <>
      {/* Oral Verification Evidence Card */}
      {interview && (
        <div className="space-y-3 rounded-[6px] border border-accent/30 bg-accent-soft/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono-code flex items-center gap-2 text-[11px] font-bold text-accent-ink uppercase">
              <span className="material-symbols-outlined text-[18px] text-accent">record_voice_over</span>
              <span>{tr('Oral Verification Defense')}</span>
            </div>
            <Badge tone={interview.status === 'completed' ? 'good' : 'accent'}>
              {interview.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-[13px] text-ink">
            {interview.status === 'completed'
              ? tr('This participant completed a 3-minute voice interview defending this repository.')
              : tr('This participant started a 3-minute voice interview defending this repository.')}
          </p>
          <div>
            <Link to={`/interview/${interview.id}`} className={linkButtonSecondary}>
              <span className="material-symbols-outlined text-[16px]">description</span>
              <span>{tr('Open Oral Defense Dossier →')}</span>
            </Link>
          </div>
        </div>
      )}

      {/* How the AI Judged It (Activity & Reasoning) */}
      {(activity.length > 0 || working || models.length > 0) && (
        <div className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <h2 className="font-serif-heading text-[20px] font-medium text-ink">{tr('How the AI Judged It')}</h2>
            {working && <Spinner label={status === 'queued' ? tr('Waiting to start') : tr('Working')} />}
          </div>
          {models.length > 0 && (
            <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>{tr('MODELS USED:')}</span>
              <ModelsUsed models={models} primary={primaryModels} />
            </div>
          )}
          {status === 'queued' && nextAttemptAt && error && (
            <Notice tone="warn">{error}</Notice>
          )}
          {activity.length > 0 ? (
            <AiActivity entries={activity} live={working} />
          ) : (
            working && (
              <p className="text-[13px] text-muted">
                {tr('The steps appear here as the AI works. This page updates on its own.')}
              </p>
            )
          )}
        </div>
      )}

      {/* Feedback the Team Will Receive */}
      {feedback && (
        <div className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
          <h2 className="font-serif-heading text-[20px] font-medium text-ink">
            {tr('Feedback the Team Will Receive')}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink">
            {feedback.strengths_json.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <ul className="space-y-2 text-[13px]">
            {feedback.improvements_json.map((f, i) => (
              <li key={i} className="rounded-[4px] border border-line bg-paper/60 p-3">
                <p className="font-medium text-ink">{f.what}</p>
                <p className="font-mono-code text-[11px] text-accent">{f.where}</p>
                <p className="mt-1 text-[12px] text-muted">{tr('Next step:')}{' '}{f.next_step}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Versions Sent */}
      <div className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
        <h2 className="font-serif-heading text-[20px] font-medium text-ink">{tr('Versions Sent')}</h2>
        <ol className="space-y-2.5 text-[13px]">
          {versions.map((v, i) => (
            <li key={v.id} className="rounded-[4px] border border-line bg-paper/45 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono-code font-semibold text-ink">{tr('Version')}{' '}{v.version_no}</span>
                {i === 0 && <Badge tone="accent">{sha ? tr('Judged') : tr('Latest')}</Badge>}
                <span className="font-mono-code text-[11px] text-muted">{formatDate(v.created_at)}</span>
              </div>
              {v.description && <p className="mt-2 whitespace-pre-line text-muted">{v.description}</p>}
              <p className="font-mono-code mt-2 flex flex-wrap gap-3 text-[12px]">
                <a
                  href={v.repos.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-accent hover:underline"
                >
                  {tr('Repository ↗')}
                </a>
                {v.video_url && (
                  <a
                    href={v.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent hover:underline"
                  >
                    {tr('Demo video ↗')}
                  </a>
                )}
                {v.slides_url && (
                  <a
                    href={v.slides_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent hover:underline"
                  >
                    {tr('Slides ↗')}
                  </a>
                )}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
