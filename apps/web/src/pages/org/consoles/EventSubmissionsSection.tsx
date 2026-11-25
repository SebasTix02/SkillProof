import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { AiActivity, latestStep, modelName } from '../../../components/AiActivity';
import { SubmissionJudgingControls } from '../../../components/JudgingControls';
import {
  Badge,
  CopyLinkButton,
  Input,
  NumberedSectionCard,
  SIMILARITY_SIGNAL_LABEL,
  SUBMISSION_STATUS_LABEL,
  SectionHeader,
  scoreTone,
  type SubmissionPipelineStatus,
} from '../../../components/shared';
import { tr } from '../../../i18n';
import type { EventView } from '../../../lib/types';
import type { ConsoleSubmission, Flag } from './eventConsoleTypes';

export function EventSubmissionsSection({
  event,
  link,
  submissions,
  filteredSubmissions,
  similarityFlags,
  flaggedSet,
  ranked,
  search,
  onSearchChange,
  openSteps,
  onToggleSteps,
  canManage,
  busy,
  act,
}: {
  event: EventView;
  link: string;
  submissions: readonly ConsoleSubmission[];
  filteredSubmissions: readonly ConsoleSubmission[];
  similarityFlags: readonly Flag[];
  flaggedSet: ReadonlySet<string>;
  ranked: boolean;
  search: string;
  onSearchChange: (q: string) => void;
  openSteps: ReadonlySet<string>;
  onToggleSteps: (sid: string) => void;
  canManage: boolean;
  busy: string | null;
  act: (key: string, path: string, success: string, confirmText?: string) => void;
}) {
  const teamName = (sid: string) => submissions.find((s) => s.id === sid)?.team_name ?? tr('Unknown team');

  return (
    <>
      {/* 5. Possible Duplicates / Forensic Similarity Signals */}
      {similarityFlags.length > 0 && (
        <NumberedSectionCard
          number="FS"
          icon="warning"
          title={tr('Forensic Similarity & Duplicate Signals')}
          subtitle={tr('These are automated signals for human judges to inspect, not automatic disqualifications.')}
          sectionTag={tr('{n} SIGNALS DETECTED', { n: similarityFlags.length })}
          theme="warn"
        >
          <ul className="space-y-2.5">
            {similarityFlags.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-warn/30 bg-warn-soft/35 p-3 text-[13px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">{SIMILARITY_SIGNAL_LABEL[f.signal]}</Badge>
                  <Link
                    to={`/org/events/${event.id}/s/${f.submission_a}`}
                    className="font-semibold text-ink hover:text-accent hover:underline"
                  >
                    {teamName(f.submission_a)}
                  </Link>
                  <span className="text-muted">↔</span>
                  <Link
                    to={`/org/events/${event.id}/s/${f.submission_b}`}
                    className="font-semibold text-ink hover:text-accent hover:underline"
                  >
                    {teamName(f.submission_b)}
                  </Link>
                  {f.explanation && <span className="font-mono-code text-[12px] text-muted">· {f.explanation}</span>}
                </div>
                <div className="flex items-center gap-2.5">
                  <Link
                    to={`/org/events/${event.id}/compare?a=${f.submission_a}&b=${f.submission_b}&flag=${f.id}`}
                    className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-warn/40 bg-surface px-2.5 py-1 text-[11px] font-semibold text-warn hover:bg-warn hover:text-on-warn"
                  >
                    <span>{tr('Compare Side-by-Side')}</span>
                    <span>→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </NumberedSectionCard>
      )}

      {/* 6. Submissions & Official Leaderboard Table */}
      <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
        <SectionHeader
          eyebrow={ranked ? tr('RANKED RESULTS') : tr('LIVE SUBMISSIONS')}
          eyebrowTone="accent"
          title={ranked ? tr('Leaderboard & Adjudication Docket') : tr('Cohort Submissions')}
          subtitle={tr('Click any team to open the 3-column Judge Workspace with full repository analysis, rubric sliders, and voice defense evidence.')}
          rightSlot={
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[16px] text-muted">
                search
              </span>
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={tr('Filter team, author, SHA…')}
                className="h-9 w-56 bg-paper pl-8 text-[12px]"
              />
            </div>
          }
        />

        {filteredSubmissions.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-[14px] font-semibold text-ink">{submissions.length === 0 ? tr('No submissions yet') : tr('No submissions match your search')}</p>
            <p className="mx-auto max-w-md text-[13px] text-muted">
              {submissions.length === 0
                ? event.status === 'draft'
                  ? tr('Open the event so participants can join and submit their repositories.')
                  : tr('Share the event link: participants join and submit a GitHub repository before the deadline.')
                : tr('Clear the search to see every submission.')}
            </p>
            {submissions.length === 0 && event.status !== 'draft' && (
              <div className="flex justify-center">
                <CopyLinkButton value={link} label={tr('Copy event link')} />
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[4px] border border-line">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                <tr>
                  {ranked && <th className="px-4 py-3">#</th>}
                  <th className="px-4 py-3">{tr('Team & Author')}</th>
                  <th className="px-4 py-3">{tr('Repository & Commit')}</th>
                  <th className="px-4 py-3">{tr('Pipeline Status')}</th>
                  <th className="px-4 py-3 text-right">{tr('Rubric Score')}</th>
                  {event.interviews_enabled && <th className="px-4 py-3 text-right">{tr('Ownership')}</th>}
                  <th className="px-4 py-3 text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((s, i) => {
                  const repo = s.current_version?.repos;
                  const working = s.status === 'queued' || s.status === 'analyzing';
                  const latest = latestStep(s.activity);
                  const expanded = openSteps.has(s.id);
                  const waitingRetry = s.status === 'queued' && !!s.next_attempt_at;

                  return (
                    <Fragment key={s.id}>
                      <tr
                        className={`audit-table-row transition-colors ${
                          expanded ? 'border-b-0 bg-paper/40' : 'border-b border-line last:border-0'
                        }`}
                      >
                        {ranked && (
                          <td className="font-serif-heading px-4 py-3.5 text-[18px] font-bold text-ink tabular-nums">
                            {s.total != null ? `#${String(i + 1).padStart(2, '0')}` : '—'}
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <Link
                            to={`/org/events/${event.id}/s/${s.id}`}
                            className="font-semibold text-ink hover:text-accent hover:underline"
                          >
                            {s.team_name}
                          </Link>
                          <div className="font-mono-code text-[11px] text-muted">{s.submitted_by_name}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {repo && (
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-mono-code text-[12px] text-accent hover:underline"
                              >
                                {repo.owner}/{repo.name}
                              </a>
                            )}
                            {s.locked_commit_sha && (
                              <code className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink">
                                @{s.locked_commit_sha.slice(0, 7)}
                              </code>
                            )}
                            {flaggedSet.has(s.id) && <Badge tone="warn">{tr('Check')}</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}
                              dot={working}
                            >
                              {SUBMISSION_STATUS_LABEL[s.status as SubmissionPipelineStatus]}
                            </Badge>
                            {s.step_count > 0 && (
                              <button
                                type="button"
                                className="font-mono-code cursor-pointer text-[11px] font-semibold text-accent hover:underline"
                                aria-expanded={expanded}
                                onClick={() => onToggleSteps(s.id)}
                              >
                                {expanded ? tr('Hide steps') : tr('View {n} steps', { n: s.step_count })}
                              </button>
                            )}
                          </div>
                          {s.status === 'error' && s.error && (
                            <div className="mt-1 max-w-xs text-[12px] text-bad">{s.error}</div>
                          )}
                          {waitingRetry && s.error && (
                            <div className="mt-1 max-w-xs text-[12px] text-warn">{s.error}</div>
                          )}
                          {working && !waitingRetry && (
                            <div className="font-mono-code mt-1 max-w-xs text-[11px] text-muted">
                              {latest ? (
                                <>
                                  {tr('Step')}{' '}{s.step_count}: {latest.text}
                                </>
                              ) : s.status === 'queued' ? (
                                tr('Waiting for a free slot. Submissions are judged a few at a time.')
                              ) : (
                                tr('Starting…')
                              )}
                            </div>
                          )}
                          {s.status === 'scored' && s.models_used && s.models_used.length > 0 && (
                            <div className="font-mono-code mt-1 text-[11px] text-muted">
                              {s.models_used.map(modelName).join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {s.total != null ? (
                            <Badge tone={scoreTone(s.total, 100)}>{s.total.toFixed(1)}</Badge>
                          ) : (
                            <span className="font-mono-code text-muted">–</span>
                          )}
                        </td>
                        {event.interviews_enabled && (
                          <td className="px-4 py-3.5 text-right">
                            {s.ownership ? (
                              <Badge tone={scoreTone(s.ownership.score, 100)}>{s.ownership.score}</Badge>
                            ) : (
                              <span className="font-mono-code text-muted">–</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {canManage && (
                              <SubmissionJudgingControls
                                id={s.id}
                                name={s.team_name}
                                status={s.status}
                                frozen={!!s.locked_commit_sha}
                                busy={busy}
                                act={act}
                                compact
                              />
                            )}
                            <Link
                              to={`/org/events/${event.id}/s/${s.id}`}
                              className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[4px] border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                            >
                              <span>{tr('Judge')}</span>
                              <span>→</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-line bg-paper/30 last:border-0">
                          <td
                            colSpan={5 + (ranked ? 1 : 0) + (event.interviews_enabled ? 1 : 0)}
                            className="px-4 pb-4"
                          >
                            <AiActivity entries={s.activity} live={working} maxHeight="18rem" />
                            <Link
                              to={`/org/events/${event.id}/s/${s.id}`}
                              className="font-mono-code mt-2 inline-block text-[11px] font-semibold text-accent hover:underline"
                            >
                              {tr("Open the Judge Workspace for the full history and the AI's reasoning →")}
                            </Link>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
