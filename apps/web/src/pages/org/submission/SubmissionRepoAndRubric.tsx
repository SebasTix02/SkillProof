import type { CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import { Badge, Tabs, formatDate } from '../../../components/shared';
import { tr, trn } from '../../../i18n';
import { evidenceLink, evidenceTitle, timestampSeconds } from '../../../lib/evidence';
import type { ScoreView, VersionView } from '../../../lib/types';
import type { Analysis } from './types';

export function SubmissionRepoAndRubric({
  submissionId,
  teamName,
  status,
  working,
  lockedAt,
  sha,
  current,
  analysis,
  map,
  commits,
  rubric,
  orderedScores,
  activeCriterionIdx,
  onActiveCriterionChange,
  activeCriterion,
  activeScore,
  repoUrl,
}: {
  submissionId: string;
  teamName: string;
  status: string;
  working: boolean;
  lockedAt: string | null;
  sha: string | null;
  current: VersionView | undefined;
  analysis: Analysis | null;
  map: RepoMap | undefined;
  commits: CommitProfile | null | undefined;
  rubric: Rubric;
  orderedScores: readonly ScoreView[];
  activeCriterionIdx: number;
  onActiveCriterionChange: (idx: number) => void;
  activeCriterion: Rubric[number] | undefined;
  activeScore: ScoreView | undefined;
  repoUrl: string | null;
}) {
  return (
    <>
      {/* Submission Profile & Repo Map Card */}
      <div className="space-y-4 rounded-[6px] border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
              {tr('Submission ID: #')}{submissionId.slice(0, 8).toUpperCase()}
            </span>
            <h2 className="font-serif-heading text-[24px] leading-tight font-medium text-ink">
              {teamName}
            </h2>
            {lockedAt && (
              <span className="font-mono-code text-[11px] text-muted">
                {tr('Frozen on')}{' '}{formatDate(lockedAt)}
              </span>
            )}
          </div>
          <Badge tone={status === 'scored' ? 'good' : status === 'error' ? 'bad' : 'accent'} dot={working}>
            {status.toUpperCase()}
          </Badge>
        </div>

        <div className="font-mono-code grid grid-cols-1 gap-2.5 border-t border-line pt-3 text-[12px] sm:grid-cols-2">
          <div className="rounded-[4px] border border-line bg-paper p-2.5">
            <span className="block text-[10px] font-semibold text-muted uppercase">{tr('Repository Tree')}</span>
            {current ? (
              <a
                href={current.repos.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 block truncate font-semibold text-accent hover:underline"
              >
                {current.repos.owner}/{current.repos.name}
              </a>
            ) : (
              <span className="mt-0.5 block text-muted">—</span>
            )}
          </div>
          <div className="rounded-[4px] border border-line bg-paper p-2.5">
            <span className="block text-[10px] font-semibold text-muted uppercase">{tr('Audited Commit')}</span>
            <span className="mt-0.5 block font-semibold text-ink">
              {sha ? sha.slice(0, 12) : tr('Pending freeze')}
              {analysis ? ` (${trn('{count} file', '{count} files', analysis.file_count)})` : ''}
            </span>
          </div>
        </div>

        {/* Architecture & Complexity Signals */}
        {map && (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-1.5">
              {[...map.stack.languages, ...map.stack.frameworks, ...map.stack.services].map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
              <Badge tone={map.complexity_signals.has_tests ? 'good' : 'neutral'}>
                {map.complexity_signals.has_tests ? tr('Has tests') : tr('No tests')}
              </Badge>
              <Badge tone={map.complexity_signals.has_ci ? 'good' : 'neutral'}>
                {map.complexity_signals.has_ci ? tr('Has CI') : tr('No CI')}
              </Badge>
            </div>

            {/* Forensic Pre-Screening Summary Box */}
            <div className="space-y-1.5 rounded-[4px] border border-good/30 bg-good-soft/45 p-3.5">
              <div className="font-mono-code flex items-center justify-between text-[11px] font-bold text-good">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">security</span>
                  <span>{tr('What the Project Is (AI Repo Map)')}</span>
                </span>
                {commits && (
                  <span className="rounded-[2px] border border-good/30 bg-surface px-1.5 py-0.2 text-[10px]">
                    {trn('{count} commit', '{count} commits', commits.total_commits)} · {trn('{count} author', '{count} authors', commits.authors.length)}
                  </span>
                )}
              </div>
              <p className="text-[12px] leading-relaxed text-ink">{map.summary}</p>
              {commits?.commits_before_start != null && commits.commits_before_start > 0 && (
                <p className="font-mono-code text-[11px] font-semibold text-warn">
                  ⚠ {trn('{count} commit authored before the event started.', '{count} commits authored before the event started.', commits.commits_before_start)}
                </p>
              )}
            </div>

            {map.key_decisions.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
                  {tr('Key Architectural Decisions')}
                </h3>
                <ul className="space-y-1.5 text-[12px]">
                  {map.key_decisions.map((d, i) => (
                    <li key={i} className="rounded-[4px] border border-line bg-paper/60 p-2.5">
                      <span className="font-semibold text-ink">{d.decision}</span>{' '}
                      <span className="text-muted">— {d.rationale}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {map.weaknesses.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
                  {tr('Weak Points & Risks')}
                </h3>
                <ul className="space-y-1.5 text-[12px]">
                  {map.weaknesses.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-[4px] border border-line bg-paper/40 p-2">
                      <Badge
                        tone={w.severity === 'high' ? 'bad' : w.severity === 'medium' ? 'warn' : 'neutral'}
                      >
                        {w.severity}
                      </Badge>
                      <span className="text-ink">{w.issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Syntactic Rubric Evidence Explorer */}
      {rubric.length > 0 && orderedScores.length > 0 && (
        <div className="overflow-hidden rounded-[6px] border border-line bg-surface">
          <Tabs
            size="sm"
            ariaLabel={tr('Rubric criteria')}
            className="bg-paper px-2 pt-1"
            tabs={rubric.map((c, idx) => ({ key: String(idx), label: `${String(idx + 1).padStart(2, '0')}. ${c.name}`, count: `${c.weight}%` }))}
            active={String(activeCriterionIdx)}
            onChange={(k) => onActiveCriterionChange(Number(k))}
          />

          <div className="font-mono-code flex items-center justify-between bg-dark-inset px-4 py-2 text-[11px] text-white/80">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[15px] text-accent-on-dark">
                {activeScore?.evidence_json[0] && timestampSeconds(activeScore.evidence_json[0]) != null ? 'play_circle' : 'code'}
              </span>
              <span className="font-semibold text-white">
                {activeScore?.evidence_json[0] ?? activeCriterion?.name ?? tr('Criterion Evidence')}
              </span>
            </div>
            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-good-on-dark">
              {tr('SCORE:')}{' '}{activeScore?.override_score ?? activeScore?.ai_score ?? '–'} / 10
            </span>
          </div>

          <div className="space-y-3 bg-dark-canvas p-4 text-[12px] text-white/85">
            <p className="leading-relaxed text-white/90">
              {activeScore?.justification || tr('No justification recorded for this criterion.')}
            </p>
            {activeScore && activeScore.evidence_json.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                <span className="font-mono-code block text-[10px] text-white/50 uppercase">
                  {tr('Cited Repository Files (Click to inspect at frozen commit):')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activeScore.evidence_json.map((item) => {
                    const ev = evidenceLink(item, { repoUrl, sha, videoUrl: current?.video_url ?? null });
                    return ev.href ? (
                      <a
                        key={item}
                        href={ev.href}
                        target="_blank"
                        rel="noreferrer"
                        title={evidenceTitle(ev)}
                        className="font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-white/15 bg-white/10 px-2 py-1 text-[11px] text-accent-on-dark hover:bg-white/20 hover:underline"
                      >
                        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">{ev.kind === 'video' ? 'play_circle' : 'open_in_new'}</span>
                        <span>{ev.label}</span>
                      </a>
                    ) : (
                      <code
                        key={item}
                        title={evidenceTitle(ev)}
                        className="font-mono-code rounded-[3px] border border-white/15 bg-white/10 px-2 py-1 text-[11px] text-white"
                      >
                        {ev.label}
                      </code>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
