import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { one, type ReportView } from '../components/Report';
import {
  ARTIFACT_THEME_CYCLE,
  Badge,
  CopyLinkButton,
  DarkBanner,
  EditorialQuoteBlock,
  LiveDot,
  MetricTile,
  PageState,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_TONE,
  ScoreBar,
  formatAudioDuration,
  formatDate,
  scoreTone,
} from '../components/shared';
import { PrintMasthead } from '../components/PrintMasthead';
import { useToast } from '../components/toast';
import { useLoad } from '../lib/useLoad';

interface ProfileInterview {
  id: string;
  created_at: string;
  duration_s: number | null;
  submission_id: string | null;
  repos: { owner: string; name: string; url: string } | null;
  repo_analyses: { commit_sha: string } | { commit_sha: string }[] | null;
  interview_reports: ReportView | ReportView[] | null;
}

interface ProfileResponse {
  profile: {
    slug: string;
    headline: string;
    display_name: string;
    github_login: string | null;
    avatar_url: string | null;
  };
  interviews: ProfileInterview[];
}

export function PublicProfile() {
  const { slug } = useParams();
  const toast = useToast();
  const { data, error, loading } = useLoad<ProfileResponse>(`/api/profiles/${slug}`);
  const [sortBy, setSortBy] = useState<'recent' | 'score'>('recent');

  const verified = useMemo(
    () => (data?.interviews ?? []).filter((i) => one(i.interview_reports) !== null),
    [data?.interviews],
  );

  const sortedVerified = useMemo(() => {
    return [...verified].sort((a, b) => {
      if (sortBy === 'score') {
        const sa = one(a.interview_reports)?.ownership_score ?? 0;
        const sb = one(b.interview_reports)?.ownership_score ?? 0;
        return sb - sa;
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [verified, sortBy]);

  if (!data) return <PageState loading={loading} error={error} kind="profile" />;
  const { profile } = data;

  const scores = verified
    .map((i) => one(i.interview_reports)?.ownership_score)
    .filter((n): n is number => typeof n === 'number');
  const avgScore =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  const githubHandle = profile.github_login || verified[0]?.repos?.owner || null;
  const latestReport = verified[0] ? one(verified[0].interview_reports) : null;

  function exportJsonAttestation() {
    const payload = {
      schema: 'skillproof.public_dossier.v1',
      exported_at: new Date().toISOString(),
      candidate: {
        display_name: profile.display_name,
        slug: profile.slug,
        headline: profile.headline,
        github_login: githubHandle,
      },
      aggregate_ownership_score: avgScore,
      verified_interviews_count: verified.length,
      artifacts: verified.map((i) => ({
        id: i.id,
        created_at: i.created_at,
        duration_s: i.duration_s,
        repository: i.repos,
        commit_sha: one(i.repo_analyses)?.commit_sha ?? null,
        report: one(i.interview_reports),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.slug}-skillproof-dossier.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported the dossier as JSON.');
  }

  return (
    <div className="space-y-8">
      <PrintMasthead
        kind="Public candidate dossier"
        name={profile.display_name || profile.slug}
        repo={profile.github_login ? `github.com/${profile.github_login}` : null}
        date={new Date().toISOString()}
        url={`${window.location.origin}/p/${profile.slug}`}
      />
      {/* 1. Recruiter Access Header Bar */}
      <DarkBanner className="no-print flex flex-col justify-between gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-mono-code flex items-center gap-2 rounded-[4px] border border-accent/40 bg-accent/20 px-3 py-1.5 text-[11px] font-bold tracking-wider text-accent-soft">
            <span className="material-symbols-outlined text-[16px] text-accent">verified_user</span>
            <span>PUBLIC DOSSIER // /P/{profile.slug.toUpperCase()}</span>
          </div>
          <span className="hidden text-white/30 sm:inline">|</span>
          <div className="flex items-center gap-2">
            <LiveDot tone="mint" />
            <span className="text-[12px] font-medium text-dark-ink sm:text-[13px]">
              Public Candidate Verification Dossier • Read-Only Recruiter Access
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-tactile font-mono-code flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-white/20"
          >
            <span className="material-symbols-outlined text-[15px] text-accent-soft">picture_as_pdf</span>
            <span>Print / Save PDF</span>
          </button>

          <CopyLinkButton
            value={window.location.href}
            label="Copy Dossier Link"
            copiedLabel="Copied Link!"
            icon="link"
            variant="dark"
            onCopied={() => toast.success('Dossier link copied to clipboard.')}
          />

          <a
            href="#ledger-audit"
            className="btn-tactile font-mono-code flex items-center gap-1.5 rounded-[4px] border border-accent bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent hover:bg-accent-hover"
          >
            <span className="material-symbols-outlined text-[15px]">token</span>
            <span>Verification Standard</span>
          </a>
        </div>
      </DarkBanner>

      {/* 2. Candidate Hero & Executive Summary Section (Split 7 / 5) */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[6px] border border-line border-t-[3px] border-t-accent bg-surface p-6 sm:p-8 lg:col-span-7">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="good" dot>
                INTERVIEWED BY SKILLPROOF
              </Badge>
              <Badge>HANDLE: /p/{profile.slug}</Badge>
              <Badge tone="accent">COMMIT-ANCHORED EVIDENCE</Badge>
            </div>

            <div className="mt-1 flex items-center gap-2.5">
              <h1 className="font-serif-heading text-[32px] leading-tight font-medium tracking-tight text-ink sm:text-[38px]">
                {profile.display_name}
              </h1>
              <span className="material-symbols-outlined text-[26px] text-accent" title="Verified SkillProof Candidate">
                verified
              </span>
            </div>

            <p className="mt-1.5 text-[15px] leading-[23px] text-muted sm:text-[16px]">
              {profile.headline || 'Software Engineering Candidate • Verified Repository & Oral Defense Dossier'}
            </p>

            {/* Candidate Metadata Grid Strip */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricTile
                label="Dossier Slug"
                value={profile.slug}
                valueClassName="font-mono-code truncate text-[12px] font-semibold text-ink"
              />
              <MetricTile
                label="GitHub Origin"
                value={
                  githubHandle ? (
                    <a
                      href={`https://github.com/${githubHandle}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      @{githubHandle}
                    </a>
                  ) : (
                    'Verified Author'
                  )
                }
                valueClassName="font-mono-code truncate text-[12px] font-semibold text-ink"
              />
              <MetricTile
                label="Oral Exams"
                value={`${verified.length} ${verified.length === 1 ? 'Session' : 'Sessions'}`}
                valueClassName="font-mono-code text-[12px] font-semibold text-ink"
              />
              <MetricTile
                label="Latest Audit"
                value={verified[0] ? new Date(verified[0].created_at).toLocaleDateString() : '—'}
                valueClassName="font-mono-code truncate text-[12px] font-semibold text-ink"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-between gap-2 rounded-[4px] border border-good/30 bg-good-soft/65 px-4 py-2.5 sm:flex-row sm:items-center">
            <span className="font-mono-code flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-good uppercase">
              <span className="material-symbols-outlined text-[16px]">shield_lock</span>
              RECRUITER DISCLOSURE STATUS
            </span>
            <span className="font-mono-code flex items-center gap-1.5 text-[11px] font-bold text-good">
              <LiveDot tone="good" />
              Quotes from the candidate's own interview
            </span>
          </div>
        </div>

        {/* Right 5 Cols: Executive Credential Summary Card */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-[6px] border border-line border-t-[3px] border-t-good bg-surface p-6 sm:p-8 lg:col-span-5">
          <div>
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                Aggregate Verification Score
              </span>
              <Badge tone={avgScore != null ? scoreTone(avgScore, 100) : 'neutral'} dot>
                {latestReport ? `${latestReport.confidence.toUpperCase()} CONFIDENCE` : 'AWAITING RUNS'}
              </Badge>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif-heading text-[48px] leading-none font-bold tracking-tight text-ink sm:text-[54px]">
                  {avgScore != null ? avgScore : '—'}
                </span>
                <span className="font-serif-heading text-[22px] font-normal text-muted">/ 100</span>
              </div>
              <span className="font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-good/30 bg-good-soft px-2 py-1 text-[11px] font-bold text-good-ink">
                <span className="material-symbols-outlined text-[14px]">psychology</span>
                CODE + VOICE
              </span>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="font-mono-code flex justify-between text-[11px]">
                <span className="text-muted">Ownership from interviews</span>
                <span className="font-bold text-good">
                  {avgScore != null && avgScore >= 75 ? 'High Distinction' : 'Interview record'}
                </span>
              </div>
              <ScoreBar value={avgScore} max={100} tone="good" heightClass="h-2" />
            </div>

            <div className="mt-5 rounded-[4px] border border-line bg-paper p-4 text-[13px] leading-relaxed text-ink">
              <div className="font-mono-code mb-1 flex items-center gap-1.5 text-[11px] font-bold text-good uppercase">
                <span className="material-symbols-outlined text-[15px]">gavel</span>
                Examiner Consensus
              </div>
              <p className="text-[12px] leading-[19px] text-muted">
                {latestReport?.summary ||
                  'Each report below comes from a three-minute live voice interview about the author’s own repository at the frozen commit shown.'}
              </p>
            </div>
          </div>

          <div className="font-mono-code mt-5 flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <LiveDot tone="accent" pulse={false} />
              3:00 Oral Defense Protocol
            </span>
            <span className="flex items-center gap-1.5">
              <LiveDot tone="good" pulse={false} />
              Judged on a fixed commit
            </span>
          </div>
        </div>
      </section>

      {/* 3. Chronological Verification Ledger Subheader & Sort Bar */}
      <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-accent/25 bg-accent-soft text-accent-ink">
            <span className="material-symbols-outlined text-[18px]">account_tree</span>
          </div>
          <div>
            <h2 className="font-serif-heading text-[20px] leading-none font-medium text-ink">
              Interview history
            </h2>
            <span className="mt-1 inline-block text-[12px] text-muted">
              Audited GitHub repositories with verbatim oral defense citations
            </span>
          </div>
          <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2.5 py-1 text-[11px] font-semibold text-ink">
            {verified.length} {verified.length === 1 ? 'Frozen Artifact' : 'Frozen Artifacts'}
          </span>
        </div>

        <div className="font-mono-code flex items-center gap-2.5 text-[11px]">
          <button
            type="button"
            onClick={() => setSortBy((prev) => (prev === 'recent' ? 'score' : 'recent'))}
            className="btn-tactile cursor-pointer rounded-[4px] border border-line bg-paper px-3 py-1.5 font-semibold text-ink hover:border-accent"
          >
            {sortBy === 'recent' ? 'Sort: Recency (Desc) ↕' : 'Sort: Ownership Score (Desc) ↕'}
          </button>
          <span className="hidden items-center gap-1 rounded-[3px] border border-good/30 bg-good-soft px-2.5 py-1.5 font-semibold text-good-ink sm:flex">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            From transcripts
          </span>
        </div>
      </div>

      {/* 4. Repository Artifact Stack */}
      {sortedVerified.length === 0 ? (
        <div className="rounded-[6px] border border-line bg-surface p-10 text-center">
          <div className="font-serif-heading text-[20px] font-medium text-ink">No verified interviews published yet</div>
          <p className="mt-1 text-[13px] text-muted">
            Completed 3-minute voice interviews will appear here automatically once evaluated.
          </p>
        </div>
      ) : (
        <section className="space-y-6">
          {sortedVerified.map((i, idx) => {
            const report = one(i.interview_reports)!;
            const sha = one(i.repo_analyses)?.commit_sha;
            const theme = ARTIFACT_THEME_CYCLE[idx % ARTIFACT_THEME_CYCLE.length]!;

            return (
              <article
                key={i.id}
                className={`overflow-hidden rounded-[6px] border-2 bg-surface transition-colors ${theme.cardBorder}`}
              >
                <div className={`flex flex-col justify-between gap-4 p-5 sm:px-6 md:flex-row md:items-center ${theme.headerBg}`}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-[4px] ${theme.iconBg}`}>
                      <span className="material-symbols-outlined text-[16px]">{theme.icon}</span>
                    </span>
                    {i.repos ? (
                      <a
                        href={i.repos.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono-code text-[15px] font-bold text-ink hover:text-accent hover:underline"
                      >
                        {i.repos.owner}/{i.repos.name}
                      </a>
                    ) : (
                      <span className="font-mono-code text-[15px] font-bold text-ink">Verified Repository</span>
                    )}
                    {sha && (
                      <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
                        commit @{sha.slice(0, 7)}
                      </span>
                    )}
                    <span className="font-mono-code rounded-[3px] border border-line bg-surface px-2 py-0.5 text-[11px] text-muted">
                      {formatAudioDuration(i.duration_s, 'voice interview', '03:00 voice interview')}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono-code text-[11px] text-muted">Frozen: {formatDate(i.created_at)}</span>
                    <span className={`font-mono-code rounded-[4px] px-3 py-1 text-[11px] font-bold ${theme.badgeBg}`}>
                      {report.ownership_score} / 100 OWNERSHIP • {report.confidence.toUpperCase()} CONFIDENCE
                    </span>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  {report.skills_json.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-code mr-1 text-[11px] font-bold tracking-wider text-muted uppercase">
                        Evaluated Dimensions:
                      </span>
                      {report.skills_json.map((s) => (
                        <span
                          key={s.skill}
                          className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-paper px-2.5 py-1 text-[11px] font-medium text-ink"
                        >
                          <span>{s.skill}</span>
                          <span className="text-muted">·</span>
                          <span
                            className={
                              s.level === 'strong' || s.level === 'solid'
                                ? 'font-bold text-good'
                                : s.level === 'basic'
                                  ? 'font-bold text-warn'
                                  : 'text-muted'
                            }
                          >
                            {SKILL_LEVEL_LABEL[s.level]}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={`rounded-r-[4px] border border-line border-l-[4px] p-4 text-[13px] leading-relaxed text-ink ${theme.noteBorder}`}>
                    <strong className={`font-mono-code mr-2 text-[11px] font-bold tracking-wider uppercase ${theme.noteTitle}`}>
                      Examiner Synthesis:
                    </strong>
                    <span>{report.summary}</span>
                  </div>

                  {report.skills_json.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {report.skills_json.map((s, sIdx) => (
                        <div
                          key={s.skill}
                          className="flex flex-col justify-between space-y-3 rounded-[4px] border border-line bg-surface p-4"
                        >
                          <div className="flex items-center justify-between gap-2 border-b border-line pb-2.5">
                            <span className="font-serif-heading text-[16px] font-medium text-ink">
                              {sIdx + 1}. {s.skill}
                            </span>
                            <Badge tone={SKILL_LEVEL_TONE[s.level]} dot>
                              {SKILL_LEVEL_LABEL[s.level]}
                            </Badge>
                          </div>

                          {s.evidence_quote ? (
                            <EditorialQuoteBlock
                              quote={s.evidence_quote}
                              attribution="Verbatim Oral Defense Excerpt • Confirmed"
                              theme={theme.key}
                            />
                          ) : (
                            <p className="text-[12px] text-muted italic">
                              No direct quote pinned for this dimension during the session.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="font-mono-code flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-muted">
                    <span>ARTIFACT ID: #{i.id.slice(0, 8).toUpperCase()}</span>
                    {i.repos && (
                      <a
                        href={i.repos.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-accent hover:underline"
                      >
                        Inspect Source Repository on GitHub ↗
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* 5. Recruiter Verification Protocol & Cryptographic Trust Seal Footer */}
      <DarkBanner id="ledger-audit">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-warn-on-dark">verified</span>
              <span className="font-mono-code text-[11px] font-bold tracking-widest text-warn-on-dark uppercase">
                How SkillProof checks
              </span>
              <span className="font-mono-code rounded-[3px] border border-warn-on-dark/30 bg-warn-on-dark/15 px-2 py-0.5 text-[10px] text-warn-on-dark">
                COMMIT-LOCKED
              </span>
            </div>

            <h3 className="font-serif-heading text-[24px] font-medium text-white sm:text-[28px]">
              Code Reading &amp; Voice Interview
            </h3>

            <p className="max-w-2xl text-[13px] leading-relaxed text-dark-muted sm:text-[14px]">
              Every report on this dossier is produced by selective Git tree analysis and a live 3-minute Gemini voice
              interview about the candidate&apos;s own repository. The question plan and expected points never leave the
              server, and every skill rating is backed by the candidate&apos;s verbatim spoken words.
            </p>

            <div className="font-mono-code flex flex-wrap items-center gap-3 pt-1 text-[11px] text-dark-muted">
              <div className="rounded-[4px] border border-dark-hairline bg-dark-surface px-3 py-1.5">
                Dossier Slug: <code className="font-semibold text-warn-on-dark">/p/{profile.slug}</code>
              </div>
              <div className="rounded-[4px] border border-dark-hairline bg-dark-surface px-3 py-1.5">
                Completed interviews: <code className="font-semibold text-accent-soft">{verified.length}</code>
              </div>
              <span className="flex items-center gap-1.5 rounded-[4px] border border-good/40 bg-good/20 px-3 py-1.5 font-semibold text-good-on-dark">
                <span className="material-symbols-outlined text-[14px]">lock</span>
                Answer key stays on the server
              </span>
            </div>
          </div>

          <div className="no-print flex flex-col gap-3.5 rounded-[6px] border border-line bg-surface p-6 text-ink lg:col-span-5">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <span className="font-mono-code text-[11px] font-bold tracking-wider text-muted uppercase">
                Recruiter Actions for {profile.display_name}
              </span>
              <Badge tone="accent">READ-ONLY</Badge>
            </div>

            <CopyLinkButton
              value={window.location.href}
              label="Copy Direct Candidate Dossier Link"
              copiedLabel="Copied Dossier URL!"
              icon="link"
              variant="primary"
              className="w-full py-2.5 text-[12px]"
              onCopied={() => toast.success('Dossier link copied to clipboard.')}
            />

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={exportJsonAttestation}
                className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-line bg-paper px-3 py-2 text-center text-[11px] font-semibold text-ink hover:border-muted hover:bg-surface"
              >
                Export JSON Payload
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-line bg-paper px-3 py-2 text-center text-[11px] font-semibold text-ink hover:border-muted hover:bg-surface"
              >
                Print / Export PDF
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 border-t border-line pt-2.5">
              <LiveDot tone="good" pulse={false} />
              <p className="font-mono-code text-[11px] text-muted">
                Verified by <span className="font-semibold text-ink">SkillProof Audit Engine</span>
              </p>
            </div>
          </div>
        </div>
      </DarkBanner>
    </div>
  );
}
