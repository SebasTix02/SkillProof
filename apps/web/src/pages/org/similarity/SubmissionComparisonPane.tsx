import type { Rubric } from '@skillproof/shared';
import { Link } from 'react-router-dom';
import { one } from '../../../components/Report';
import { Badge, EditorialQuoteBlock, formatDate, scoreTone } from '../../../components/shared';
import { tr } from '../../../i18n';
import { evidenceLink, evidenceTitle } from '../../../lib/evidence';
import type { ConsoleSubmission, SubmissionDetailPayload } from './types';

export function SubmissionComparisonPane({
  side,
  summary,
  detail,
  rubric,
}: {
  side: 'A' | 'B';
  summary: ConsoleSubmission;
  detail: SubmissionDetailPayload | null;
  rubric: Rubric;
}) {
  const isA = side === 'A';
  const analysis = detail ? one(detail.submission.repo_analyses) : null;
  const map = analysis?.map_json;
  const commits = analysis?.commit_profile_json;
  const versions = detail
    ? [...detail.submission.submission_versions].sort((a, b) => b.version_no - a.version_no)
    : [];
  const current = versions[0];
  const repo = current?.repos ?? summary.current_version?.repos ?? null;
  const sha = summary.locked_commit_sha;

  return (
    <div className="flex flex-col overflow-hidden rounded-[6px] border border-line bg-surface">
      {/* Colored Header */}
      <div
        className={`space-y-2 border-b p-4 ${
          isA ? 'border-good/25 bg-good-soft/55' : 'border-bad/25 bg-bad-soft/55'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`font-mono-code rounded-[3px] px-2 py-0.5 text-[10px] font-bold tracking-wider text-on-good uppercase ${
                isA ? 'bg-good' : 'bg-bad'
              }`}
            >
              {isA ? tr('SUBMISSION {side} (REFERENCE)', { side }) : tr('SUBMISSION {side} (COMPARED)', { side })}
            </span>
            {sha && (
              <span className="font-mono-code text-[11px] text-muted">
                {tr('SHA:')}{' '}<code className="font-bold text-ink">{sha.slice(0, 8)}</code>
              </span>
            )}
          </div>
          {summary.ownership ? (
            <Badge tone={summary.ownership.score >= 70 ? 'good' : 'bad'} dot>
              {tr('ORAL OWNERSHIP:')}{' '}{summary.ownership.score}%
            </Badge>
          ) : (
            <Badge tone="neutral">{tr('NO VOICE DEFENSE')}</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Link
              to={`/org/events/${detail?.submission.events.id ?? ''}/s/${summary.id}`}
              className="font-serif-heading text-[20px] font-medium text-ink hover:text-accent hover:underline"
            >
              {summary.team_name}
            </Link>
            <span className="ml-2 text-[12px] text-muted">({summary.submitted_by_name})</span>
          </div>
          {summary.total != null && (
            <Badge tone={scoreTone(summary.total, 100)}>{summary.total.toFixed(1)} / 100</Badge>
          )}
        </div>

        <div className="font-mono-code flex flex-wrap items-center gap-2 border-t border-line/70 pt-2 text-[11px] text-muted">
          {repo && (
            <a href={repo.url} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">
              {repo.owner}/{repo.name} ↗
            </a>
          )}
          {detail?.submission.locked_at && (
            <>
              <span>•</span>
              <span>{tr('Frozen:')}{' '}{formatDate(detail.submission.locked_at)}</span>
            </>
          )}
          {analysis && (
            <>
              <span>•</span>
              <span>{analysis.file_count}{' '}{tr('files read')}</span>
            </>
          )}
        </div>
      </div>

      {/* Repo Map & Stack Comparison */}
      <div className="flex-1 space-y-4 p-5">
        {map ? (
          <>
            <div className="space-y-1.5">
              <span className="font-mono-code text-[10px] font-bold tracking-wider text-muted uppercase">
                {tr('Repository Architecture Summary')}
              </span>
              <p className="text-[13px] leading-relaxed text-ink">{map.summary}</p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[...map.stack.languages, ...map.stack.frameworks, ...map.stack.services].map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>

            {commits && (
              <div className="font-mono-code grid grid-cols-3 gap-2 rounded-[4px] border border-line bg-paper p-3 text-[11px]">
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Commits')}</span>
                  <span className="font-bold text-ink">{commits.total_commits}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Authors')}</span>
                  <span className="font-bold text-ink">{commits.authors.length}</span>
                </div>
                <div>
                  <span className="block text-[10px] text-muted uppercase">{tr('Pre-Event')}</span>
                  <span className={`font-bold ${(commits.commits_before_start ?? 0) > 0 ? 'text-warn' : 'text-good'}`}>
                    {commits.commits_before_start ?? 0}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-[13px] text-muted">
            {tr('Detailed repository analysis is not available yet for this submission.')}
          </p>
        )}

        {/* Cited Evidence Files per Criterion */}
        {rubric.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <span className="font-mono-code block text-[10px] font-bold tracking-wider text-muted uppercase">
              {tr('Rubric Scores & Cited Files')}
            </span>
            <ul className="space-y-2">
              {rubric.map((c) => {
                const s = (detail?.scores ?? summary.scores).find((x) => x.criterion_key === c.key);
                const val = s?.override_score ?? s?.ai_score ?? null;
                return (
                  <li key={c.key} className="rounded-[4px] border border-line bg-paper/55 p-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{c.name}</span>
                      <Badge tone={scoreTone(val)}>{val ?? '–'}/10</Badge>
                    </div>
                    {s?.evidence_json && s.evidence_json.length > 0 && (
                      <div className="font-mono-code mt-1.5 flex flex-wrap gap-1 text-[10px]">
                        {s.evidence_json.map((item) => {
                          const ev = evidenceLink(item, { repoUrl: repo?.url ?? null, sha, videoUrl: current?.video_url ?? null });
                          return ev.href ? (
                            <a
                              key={item}
                              href={ev.href}
                              target="_blank"
                              rel="noreferrer"
                              title={evidenceTitle(ev)}
                              className="rounded border border-line bg-surface px-1.5 py-0.5 text-accent hover:underline"
                            >
                              {ev.kind === 'video' ? '▶ ' : ''}
                              {ev.label}
                            </a>
                          ) : (
                            <code key={item} title={evidenceTitle(ev)} className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink">
                              {ev.kind === 'video' ? '▶ ' : ''}
                              {ev.label}
                            </code>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* Oral Defense Cross-Exam Footer */}
      <div className="border-t border-line bg-paper/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono-code flex items-center gap-2 text-[11px] font-semibold text-ink">
            <span className={`material-symbols-outlined text-[17px] ${isA ? 'text-good' : 'text-bad'}`}>
              {detail?.interview ? 'graphic_eq' : 'mic_off'}
            </span>
            <span>
              {detail?.interview
                ? tr('Oral Defense ({status})', { status: detail.interview.status.toUpperCase() })
                : tr('No Oral Defense Recorded')}
            </span>
          </div>
          {detail?.interview && (
            <Link
              to={`/interview/${detail.interview.id}`}
              className="font-mono-code text-[11px] font-semibold text-accent hover:underline"
            >
              {tr('Inspect Transcript →')}
            </Link>
          )}
        </div>
        {summary.ownership && (
          <div className="mt-2.5">
            <EditorialQuoteBlock
              theme={isA ? 'accent' : 'neutral'}
              quote={tr('Ownership score {score}/100 ({level} confidence).', { score: summary.ownership.score, level: summary.ownership.confidence })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
