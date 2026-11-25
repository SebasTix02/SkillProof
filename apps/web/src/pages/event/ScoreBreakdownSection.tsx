import { tr } from '../../i18n';
import { Badge, SectionHeader, scoreTone } from '../../components/shared';
import { evidenceLink, evidenceTitle } from '../../lib/evidence';
import { type EventView, type Feedback, type VersionView } from '../../lib/types';
import { AuditDossierPanel } from './AuditDossierPanel';
import { LeaderboardSection } from './LeaderboardSection';
import { type Results } from './types';

export function ScoreBreakdownSection({
  event,
  mine,
  feedback,
  lockedSha,
  version,
}: {
  event: EventView;
  mine: NonNullable<Results['mine']>;
  feedback: Feedback | null | undefined;
  lockedSha: string | null;
  version: VersionView | null;
}) {
  return (
    <section className="space-y-6 rounded-[6px] border border-line bg-surface p-6">
      <SectionHeader
        title={tr('Comprehensive Rubric Vector Breakdown')}
        subtitle={tr('Criterion-by-criterion evaluation with cited repository files and judge overrides.')}
        rightSlot={
          mine.total != null ? (
            <span className="font-mono-code rounded-[3px] border border-line bg-paper px-3 py-1.5 text-[12px] font-bold text-ink">
              {tr('COMPOSITE SCORE:')}{' '}{mine.total.toFixed(1)} / 100
            </span>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {event.rubric_json.map((c) => {
          const s = mine.scores.find((x) => x.criterion_key === c.key);
          const value = s?.override_score ?? s?.ai_score ?? null;
          const tone = scoreTone(value, 10);
          return (
            <div key={c.key} className="space-y-3 rounded-[4px] border border-line bg-paper/70 p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-ink">
                  {c.weight}{tr('% WEIGHT')}
                </span>
                <div className="flex items-center gap-2">
                  {s?.override_score != null && (
                    <span className="font-mono-code text-[10px] text-warn uppercase">{tr('Judge Adjusted')}</span>
                  )}
                  <Badge tone={tone}>{value ?? '–'} / 10</Badge>
                </div>
              </div>

              <div>
                <h4 className="font-serif-heading text-[18px] font-medium text-ink">{c.name}</h4>
                {s?.justification && (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.justification}</p>
                )}
              </div>

              {s?.evidence_json && s.evidence_json.length > 0 && (
                <div className="pt-1">
                  <span className="font-mono-code mb-1 block text-[10px] text-muted uppercase">
                    {tr('Audited Evidence Files:')}
                  </span>
                  <div className="font-mono-code flex flex-wrap gap-1.5 text-[11px]">
                    {s.evidence_json.map((item, idx) => {
                      const ev = evidenceLink(item, { repoUrl: version?.repos.url ?? null, sha: lockedSha, videoUrl: version?.video_url ?? null });
                      const body = (
                        <>
                          {ev.kind === 'video' && <span className="material-symbols-outlined text-[13px]" aria-hidden="true">play_circle</span>}
                          {ev.label}
                        </>
                      );
                      const cls = 'inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface px-2 py-0.5 text-accent';
                      return ev.href ? (
                        <a key={idx} href={ev.href} target="_blank" rel="noreferrer" title={evidenceTitle(ev)} className={`${cls} hover:underline`}>
                          {body}
                        </a>
                      ) : (
                        <span key={idx} title={evidenceTitle(ev)} className={cls}>
                          {body}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {feedback && (
        <div className="grid grid-cols-1 gap-6 border-t border-line pt-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-good">
              <span className="material-symbols-outlined text-[19px]">thumb_up</span>
              <h4 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Forensic Strengths')}</h4>
            </div>
            <ul className="space-y-2 text-[13px] text-muted">
              {feedback.strengths_json.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-good">
                    check_circle
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-accent">
              <span className="material-symbols-outlined text-[19px]">tune</span>
              <h4 className="font-serif-heading text-[18px] font-medium text-ink">
                {tr('Recommendations & Next Steps')}
              </h4>
            </div>
            <ul className="space-y-2.5 text-[13px] text-muted">
              {feedback.improvements_json.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-accent">
                    arrow_forward
                  </span>
                  <div>
                    <span className="font-medium text-ink">{s.what}</span>{' '}
                    {s.where && (
                      <code className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[11px] text-accent">
                        {s.where}
                      </code>
                    )}
                    <div className="mt-0.5 text-[12px] text-muted">{tr('Next step:')}{' '}{s.next_step}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

export function ResultsView({
  event,
  results,
  lockedSha,
  version,
}: {
  event: EventView;
  results: Results;
  lockedSha: string | null;
  /** The judged version: its repository and demo video are what the evidence points to. */
  version: VersionView | null;
}) {
  const mine = results.mine;
  const myRank = results.leaderboard?.find((r) => r.mine)?.rank ?? null;
  const totalTeams = results.leaderboard?.length ?? 0;

  return (
    <div className="space-y-8">
      {/* 1. Split Certified Audit Dossier & Oral Defense Module */}
      {mine && (
        <AuditDossierPanel
          event={event}
          mine={mine}
          interview={results.interview}
          lockedSha={lockedSha}
          myRank={myRank}
          totalTeams={totalTeams}
        />
      )}

      {/* 2. Comprehensive Rubric Breakdown & Feedback */}
      {mine && (
        <ScoreBreakdownSection
          event={event}
          mine={mine}
          feedback={results.feedback}
          lockedSha={lockedSha}
          version={version}
        />
      )}

      {/* 3. Official Leaderboard Table */}
      <LeaderboardSection leaderboard={results.leaderboard} totalTeams={totalTeams} />
    </div>
  );
}
