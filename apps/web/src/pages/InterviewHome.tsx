import { lazy, tr, trn, useI18n, type Locale } from '../i18n';
import { InterviewLanguageField } from '../components/LanguageControl';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  DossierPageHeader,
  KpiCell,
  KpiGrid,
  LiveDot,
  Notice,
  PageState,
  ScoreBar,
  Tabs,
  VerificationProtocolCard,
  formatAudioDuration,
  formatDate,
  scoreTone,
  linkButton,
  Select,
} from '../components/shared';
import { api, errorMessage, existingInterviewId } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLoad } from '../lib/useLoad';
import { NONE } from '../lib/empty';

const COCKPIT_ASSET = '/images/interview-cockpit.webp';

interface InterviewReportSummary {
  ownership_score: number;
  confidence: string;
}

interface InterviewRow {
  id: string;
  status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error' | 'canceled' | 'report_paused' | 'report_canceled';
  error?: string | null;
  submission_id: string | null;
  created_at: string;
  duration_s?: number | null;
  repos: { owner: string; name: string; url?: string } | null;
  interview_reports: InterviewReportSummary | InterviewReportSummary[] | null;
}

const STATUS_BADGE: Record<
  InterviewRow['status'],
  { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; dot: boolean }
> = lazy(() => ({
  preparing: { label: tr('READING THE REPO'), tone: 'warn', dot: true },
  ready: { label: tr('READY FOR ROOM'), tone: 'accent', dot: true },
  in_progress: { label: tr('IN PROGRESS'), tone: 'accent', dot: true },
  evaluating: { label: tr('EVALUATING'), tone: 'warn', dot: true },
  completed: { label: tr('SCORED'), tone: 'good', dot: true },
  error: { label: tr('FAILED'), tone: 'bad', dot: true },
  canceled: { label: tr('CANCELED'), tone: 'neutral', dot: false },
  report_paused: { label: tr('REPORT PAUSED'), tone: 'warn', dot: false },
  report_canceled: { label: tr('REPORT CANCELED'), tone: 'neutral', dot: false },
}));

function getReport(row: InterviewRow): InterviewReportSummary | null {
  if (!row.interview_reports) return null;
  return Array.isArray(row.interview_reports) ? (row.interview_reports[0] ?? null) : row.interview_reports;
}

export function InterviewHome() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const list = useLoad<{ interviews: InterviewRow[] }>('/api/me/interviews');

  const [repoUrl, setRepoUrl] = useState('');
  const { locale: uiLocale } = useI18n();
  const [interviewLocale, setInterviewLocale] = useState<Locale>(uiLocale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [tab, setTab] = useState<'all' | 'event' | 'personal'>('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'score' | 'repo'>('recent');

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setExistingId(null);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', {
        body: { repo_url: repoUrl.trim(), locale: interviewLocale },
      });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setExistingId(existingInterviewId(err));
      setBusy(false);
    }
  }

  const allInterviews = list.data?.interviews ?? NONE;

  const stats = useMemo(() => {
    const total = allInterviews.length;
    const completed = allInterviews.filter((i) => i.status === 'completed');
    const active = allInterviews.filter((i) =>
      ['preparing', 'ready', 'in_progress', 'evaluating'].includes(i.status),
    ).length;
    const failed = allInterviews.filter((i) => i.status === 'error').length;
    const eventCount = allInterviews.filter((i) => i.submission_id !== null).length;
    const personalCount = allInterviews.filter((i) => i.submission_id === null).length;

    const scores = completed
      .map((i) => getReport(i)?.ownership_score)
      .filter((s): s is number => typeof s === 'number');

    const avgScore =
      scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    const latest = allInterviews[0] ?? null;
    const latestReport = latest ? getReport(latest) : null;

    return {
      total,
      completedCount: completed.length,
      active,
      failed,
      eventCount,
      personalCount,
      avgScore,
      latest,
      latestReport,
    };
  }, [allInterviews]);

  const filteredInterviews = useMemo(() => {
    const q = query.trim().toLowerCase();
    const subset = allInterviews.filter((i) => {
      if (tab === 'event' && !i.submission_id) return false;
      if (tab === 'personal' && i.submission_id) return false;
      if (!q) return true;
      const repoName = i.repos ? `${i.repos.owner}/${i.repos.name}`.toLowerCase() : '';
      const statusText = STATUS_BADGE[i.status].label.toLowerCase();
      return repoName.includes(q) || statusText.includes(q);
    });

    return [...subset].sort((a, b) => {
      if (sortBy === 'score') {
        const sa = getReport(a)?.ownership_score ?? -1;
        const sb = getReport(b)?.ownership_score ?? -1;
        return sb - sa;
      }
      if (sortBy === 'repo') {
        const ra = a.repos ? `${a.repos.owner}/${a.repos.name}` : '';
        const rb = b.repos ? `${b.repos.owner}/${b.repos.name}` : '';
        return ra.localeCompare(rb);
      }
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });
  }, [allInterviews, tab, query, sortBy]);

  const publicProfileUrl =
    me?.public_profile?.is_public && me.public_profile.slug ? `/p/${me.public_profile.slug}` : null;

  return (
    <div className="space-y-8">
      {/* 1. Header & Context Meta */}
      <DossierPageHeader
        borderBottom={false}
        eyebrow={
          <>
            <Badge tone="accent">{tr('ORAL VERIFICATION DISPATCH')}</Badge>
            <span className="text-line">•</span>
            <span className="text-muted uppercase">{tr('REPOSITORY MAP & VOICE INTERVIEW')}</span>
            <span className="text-line">•</span>
            <span className="flex items-center gap-1.5 font-medium text-good">
              <LiveDot tone="good" />
              {publicProfileUrl ? tr('PUBLIC DOSSIER ACTIVE') : tr('GEMINI LIVE VOICE READY')}
            </span>
          </>
        }
        title={tr('My Interviews & Verification Runs')}
        subtitle={tr('Paste a public GitHub repository you authored. SkillProof reads the codebase, prepares targeted questions tied to your actual files, and conducts a 3-minute live voice interview to generate a shareable ownership report.')}
        rightSlot={
          <div className="font-mono-code flex items-center gap-2 text-[11px] text-muted">
            <span>{tr('VERIFIED CREDENTIALS:')}</span>
            <span className="rounded-[3px] border border-line bg-surface px-2 py-0.5 font-semibold text-ink">
              {stats.completedCount}{' '}{tr('COMPLETED')}
            </span>
            {publicProfileUrl && (
              <Link
                to={publicProfileUrl}
                className="rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 font-semibold text-accent-ink hover:underline"
              >
                {tr('VIEW PUBLIC PROFILE ↗')}
              </Link>
            )}
          </div>
        }
      />

      {/* 2. Hero Visual Cockpit Launch Section (Split 7 / 5 Grid) */}
      <section className="overflow-hidden rounded-[6px] border border-line bg-surface">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="flex flex-col justify-between space-y-5 border-b border-line p-6 sm:p-7 lg:col-span-7 lg:border-r lg:border-b-0">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <LiveDot tone="accent" />
                  <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
                    {tr('Trigger New 3-Min AI Voice Interview')}
                  </span>
                </div>
                <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] text-muted">
                  {tr('QUOTA: 5 PERSONAL / 24H')}
                </span>
              </div>

              <form onSubmit={start} className="space-y-3.5">
                <div className="space-y-1.5">
                  <label
                    htmlFor="target-repo-url"
                    className="font-mono-code block text-[11px] font-semibold tracking-wider text-ink uppercase"
                  >
                    {tr('Target Public GitHub Repository URL')}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-accent">
                      <span className="material-symbols-outlined text-[17px]">folder_open</span>
                    </span>
                    <input
                      id="target-repo-url"
                      type="url"
                      required
                      placeholder={tr('https://github.com/you/your-project')}
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="font-mono-code w-full rounded-[4px] border border-line-strong bg-paper py-2.5 pr-3 pl-9 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-accent focus:bg-surface focus:outline-none"
                    />
                  </div>
                </div>

                <InterviewLanguageField value={interviewLocale} onChange={setInterviewLocale} hint={tr('The questions, the interviewer and the report use it.')} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="flex items-center rounded-[4px] border border-line bg-paper px-3 py-2 sm:col-span-7">
                    <div className="font-mono-code text-[11px] text-muted">
                      <span className="font-semibold text-ink">{tr('BRANCH TARGET:')}</span>{' '}{tr('Default branch HEAD commit SHA (frozen on start)')}
                    </div>
                  </div>
                  <div className="flex items-end sm:col-span-5">
                    <button
                      type="submit"
                      disabled={busy}
                      className="btn-tactile inline-flex h-[42px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border border-accent bg-accent px-4 text-[13px] font-medium whitespace-nowrap text-on-accent hover:border-accent-hover hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[17px]">mic</span>
                      <span>{busy ? tr('Preparing Repository…') : tr('Prepare 3-Min Interview')}</span>
                      {!busy && <span className="arrow-nudge font-mono-code text-[12px]">→</span>}
                    </button>
                  </div>
                </div>

                {error && (
                  <Notice tone="error">
                    {error}{' '}
                    {existingId && (
                      <Link to={`/interview/${existingId}`} className="font-semibold underline">
                        {tr('Open your interview')}
                      </Link>
                    )}
                  </Notice>
                )}
                <p className="text-[11px] text-muted">
                  {tr('One interview per commit: once you take it, interviewing again needs new commits in the repository.')}
                </p>
              </form>
            </div>

            <div className="space-y-2 border-t border-line pt-3">
              <div className="font-mono-code flex flex-wrap items-center gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1 text-good">
                  <span className="material-symbols-outlined text-[14px]">lock_open</span>
                  {tr('Public GitHub repositories')}
                </span>
                <span className="text-line">•</span>
                <span>{tr('Selective Git Tree & File Summary Cache')}</span>
                <span className="text-line">•</span>
                <span className="text-accent">{tr('180s Gemini Live Voice Exam')}</span>
              </div>
              <p className="text-[12px] leading-snug text-muted">
                {tr('Reading the repository takes about a minute. Once ready, enter the live audio room to answer questions about your implementation and architecture.')}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-4 bg-dark-inset p-5 text-white lg:col-span-5">
            <div className="flex items-center justify-between border-b border-dark-hairline pb-2.5">
              <div className="flex items-center gap-2">
                <LiveDot tone="mint" />
                <span className="font-mono-code text-[11px] font-semibold tracking-wider text-good-on-dark uppercase">
                  {tr('AI INTERVIEWER // READY')}
                </span>
              </div>
              <span className="font-mono-code rounded-[3px] border border-dark-hairline bg-dark-canvas px-2 py-0.5 text-[10px] text-dark-ink">
                {tr('180s Live Audio')}
              </span>
            </div>

            <div className="relative overflow-hidden rounded-[4px] border border-dark-hairline bg-dark-canvas">
              <img
                src={COCKPIT_ASSET}
                alt={tr('SkillProof AI software engineering oral interview cockpit')}
                className="block h-auto w-full object-cover"
              />
              <div className="font-mono-code flex items-center justify-between border-t border-dark-hairline bg-dark-inset px-3 py-1.5 text-[11px]">
                <span className="flex items-center gap-1.5 text-good-on-dark">
                  <span className="material-symbols-outlined text-[14px]">graphic_eq</span>
                  {tr('Acoustic Stream Ready')}
                </span>
                <span className="text-dark-muted">{tr('Answer Key Server-Sealed')}</span>
              </div>
            </div>

            <div className="font-mono-code flex items-center justify-between text-[11px] text-dark-muted">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[14px] text-accent-on-dark">verified_user</span>
                {tr('Commit-Anchored Questions')}
              </span>
              <span className="font-semibold text-good-on-dark">{tr('OWNERSHIP VERIFIED')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* With no interviews yet, one tr('Get started') card replaces the empty metrics, filters and table. */}
      {!list.loading && !list.error && allInterviews.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-surface p-6 sm:p-8" aria-labelledby="get-started-title">
          <p className="font-mono-code text-[11px] font-semibold tracking-wider text-accent-ink uppercase">{tr('Get started')}</p>
          <h2 id="get-started-title" className="font-serif-heading mt-1 text-[24px] leading-[30px] text-ink">
            {tr('Your first interview takes about five minutes')}
          </h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              ['1', tr('Pick a public repository you wrote'), tr('Paste its GitHub link above. SkillProof reads the code and prepares up to 4 questions about it.')],
              ['2', tr('Talk for 3 minutes'), tr('Answer out loud in a full-screen room. You can pause twice and skip a question.')],
              ['3', tr('Get your report'), tr('A score with quotes from what you said, which you can share on your public profile.')],
            ].map(([n, title, text]) => (
              <li key={n} className="flex gap-3 rounded-[6px] border border-line bg-paper p-4">
                <span className="font-mono-code flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-accent text-[12px] font-semibold text-on-accent">
                  {n}
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{title}</p>
                  <p className="mt-1 text-[13px] leading-[19px] text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById('target-repo-url');
              input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              input?.focus({ preventScroll: true });
            }}
            className={`${linkButton} mt-6 cursor-pointer`}
          >
            <span className="material-symbols-outlined text-[17px]">mic</span>
            <span>{tr('Start with a repository')}</span>
          </button>
        </section>
      ) : (
        <>
      {/* 3. High-Impact KPI Telemetry Strip (4 Columns) */}
        <KpiGrid>
          <KpiCell
            label={tr('Total Interviews')}
            icon="fact_check"
            footer={tr('Completion Ratio: {ratio}', { ratio: stats.total > 0 ? `${Math.round((stats.completedCount / stats.total) * 100)}%` : '—' })}
          >
            <div className="font-mono-code text-[26px] font-semibold tracking-tight text-ink">
              {stats.total} {stats.total === 1 ? tr('Audit') : tr('Audits')}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="good">{stats.completedCount}{' '}{tr('Scored')}</Badge>
              <Badge tone="warn">{stats.active}{' '}{tr('Active')}</Badge>
              <Badge tone="bad">{stats.failed}{' '}{tr('Failed')}</Badge>
            </div>
          </KpiCell>
  
          <KpiCell
            label={tr('Avg Ownership Score')}
            tinted
            badge={
              <Badge tone={stats.avgScore != null && stats.avgScore >= 70 ? 'good' : 'neutral'}>
                {stats.avgScore != null ? (stats.avgScore >= 70 ? tr('VERIFIED HIGH') : tr('RECORDED')) : tr('NO RUNS YET')}
              </Badge>
            }
            footer={<ScoreBar value={stats.avgScore} max={100} tone="good" />}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="font-serif-heading text-[32px] leading-none font-semibold text-good">
                {stats.avgScore != null ? stats.avgScore : '—'}
              </span>
              <span className="font-mono-code text-[13px] text-muted">/ 100</span>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {stats.completedCount > 0
                ? trn('Computed across {count} completed oral defense', 'Computed across {count} completed oral defenses', stats.completedCount)
                : tr('Complete a 3-minute voice interview to compute')}
            </p>
          </KpiCell>
  
          <KpiCell
            label={tr('Latest Audited Repo')}
            icon="verified"
            footer={
              <span className="font-medium text-good">
                {stats.latestReport
                  ? tr('Confidence: {level}', { level: stats.latestReport.confidence.toUpperCase() })
                  : tr('Awaiting completed evaluation')}
              </span>
            }
          >
            <div className="font-mono-code truncate rounded-[3px] border border-line bg-paper px-2 py-1 text-[12px] font-semibold text-ink">
              {stats.latest?.repos ? `${stats.latest.repos.owner}/${stats.latest.repos.name}` : tr('No repositories yet')}
            </div>
            <p className="font-mono-code mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <LiveDot tone="accent" pulse={false} />
              <span>{stats.latest ? STATUS_BADGE[stats.latest.status].label : tr('Paste a GitHub URL above to begin')}</span>
            </p>
          </KpiCell>
  
          <KpiCell label={tr('Protocol Spec')} icon="account_tree" footer={tr('Commit-Locked Code Hooks')}>
            <div className="font-serif-heading text-[24px] leading-tight font-semibold text-ink">{tr('3:00 Oral Exam')}</div>
            <p className="font-mono-code mt-1 text-[11px] text-muted">
              <span className="font-semibold text-accent">180s</span>{' '}{tr('live voice cross-examination')}
            </p>
          </KpiCell>
        </KpiGrid>
  
        {/* 4. Filter & Tab Controls */}
        <Tabs
          ariaLabel={tr('Filter interviews')}
          active={tab}
          onChange={setTab}
          tabs={[
            { key: 'all', label: tr('All Interviews'), count: stats.total },
            { key: 'event', label: tr('Hackathon Submissions'), count: stats.eventCount },
            { key: 'personal', label: tr('Independent Audits'), count: stats.personalCount },
          ]}
          rightSlot={
            <>
              <div className="relative w-full sm:w-[240px]">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-muted">
                  <span className="material-symbols-outlined text-[15px]">search</span>
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr('Filter by repository or status...')}
                  className="w-full rounded-[4px] border border-line-strong bg-surface py-1.5 pr-2.5 pl-8 text-[12px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                />
              </div>
  
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'recent' | 'score' | 'repo')}
                aria-label={tr('Sort interviews')}
                className="font-mono-code w-auto py-1.5 pl-2.5 text-[11px]"
              >
                <option value="recent">{tr('SORT: MOST RECENT')}</option>
                <option value="score">{tr('SORT: HIGHEST SCORE')}</option>
                <option value="repo">{tr('SORT: REPO NAME (A-Z)')}</option>
              </Select>
            </>
          }
        />
  
        {/* 5. Structured Interviews Data Table */}
        <section className="overflow-hidden rounded-[6px] border border-line bg-surface">
          <PageState loading={list.loading} error={list.error} kind="table" />
  
          {!list.loading && !list.error && filteredInterviews.length === 0 && (
            <div className="space-y-2 p-10 text-center">
              <div className="font-serif-heading text-[20px] font-medium text-ink">
                {allInterviews.length === 0 ? tr('No verification runs recorded yet') : tr('No interviews match your filter')}
              </div>
              <p className="mx-auto max-w-md text-[13px] text-muted">
                {allInterviews.length === 0
                  ? tr('Paste any public GitHub repository you authored in the launch console above to prepare your first 3-minute voice interview.')
                  : tr('Try clearing your search query or switching back to All Interviews.')}
              </p>
            </div>
          )}
  
          {!list.loading && !list.error && filteredInterviews.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase select-none">
                    <th className="px-4 py-3 font-semibold">{tr('Repository')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('Context / Source')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('Date & Duration')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('Status')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('Ownership Score')}</th>
                    <th className="px-4 py-3 font-semibold">{tr('Verification State')}</th>
                    <th className="px-4 py-3 text-right font-semibold">{tr('Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-[13px]">
                  {filteredInterviews.map((i) => {
                    const report = getReport(i);
                    const badge = STATUS_BADGE[i.status];
                    const repoLabel = i.repos ? `${i.repos.owner}/${i.repos.name}` : tr('Repository');
                    const tone = report ? scoreTone(report.ownership_score, 100) : 'neutral';
  
                    return (
                      <tr key={i.id} className="audit-table-row group hover:bg-paper/75">
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col space-y-0.5">
                            <Link
                              to={`/interview/${i.id}`}
                              className="font-mono-code flex items-center gap-1.5 text-[13px] font-semibold text-ink transition-colors group-hover:text-accent"
                            >
                              <span className="material-symbols-outlined text-[16px] text-accent">code</span>
                              <span>{repoLabel}</span>
                            </Link>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.2 text-[10px] text-muted">
                                {tr('run {id}', { id: i.id.slice(0, 8) })}
                              </span>
                            </div>
                          </div>
                        </td>
  
                        <td className="px-4 py-3.5">
                          {i.submission_id ? (
                            <div>
                              <div className="font-medium text-ink">{tr('Hackathon Submission')}</div>
                              <div className="font-mono-code text-[11px] text-accent">{tr('Event-Linked Defense')}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-ink">{tr('Independent Audit')}</div>
                              <div className="font-mono-code text-[11px] text-muted">{tr('Personal Credential Run')}</div>
                            </div>
                          )}
                        </td>
  
                        <td className="font-mono-code px-4 py-3.5 text-[12px] whitespace-nowrap text-muted">
                          <div className="font-medium text-ink">{formatDate(i.created_at)}</div>
                          <div className="text-[11px] text-muted">{formatAudioDuration(i.duration_s)}</div>
                        </td>
  
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Badge tone={badge.tone} dot={badge.dot}>
                            {badge.label}
                          </Badge>
                        </td>
  
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {report ? (
                            <div className="inline-flex items-baseline gap-1">
                              <span
                                className={`font-serif-heading text-[20px] font-bold ${
                                  tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-bad'
                                }`}
                              >
                                {report.ownership_score}
                              </span>
                              <span className="font-mono-code text-[11px] text-muted">/ 100</span>
                            </div>
                          ) : (
                            <span className="font-mono-code text-[11px] text-muted">— / 100</span>
                          )}
                        </td>
  
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {report ? (
                            <div className="font-mono-code flex items-center gap-1.5 text-[12px] font-medium text-ink">
                              <span className="material-symbols-outlined text-[16px] text-good">graphic_eq</span>
                              <span>{tr('Confidence:')}{' '}{report.confidence}</span>
                            </div>
                          ) : i.status === 'error' ? (
                            <span className="font-mono-code text-[11px] font-medium text-bad">
                              {i.error || tr('Preparation or evaluation failed')}
                            </span>
                          ) : (
                            <span className="font-mono-code text-[11px] text-muted">
                              {i.status === 'ready'
                                ? tr('Questions prepared • Ready to join')
                                : tr('Processing repository & transcript…')}
                            </span>
                          )}
                        </td>
  
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <Link
                            to={`/interview/${i.id}`}
                            className={`btn-tactile font-mono-code inline-flex items-center justify-center rounded-[4px] border px-3 py-1.5 text-[11px] font-semibold ${
                              i.status === 'completed'
                                ? 'border-accent bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent'
                                : i.status === 'ready' || i.status === 'in_progress'
                                  ? 'border-ink bg-ink text-on-accent hover:border-accent hover:bg-accent'
                                  : i.status === 'error'
                                    ? 'border-bad bg-bad-soft text-bad hover:bg-bad hover:text-on-bad'
                                    : 'border-line bg-surface text-ink hover:border-accent hover:bg-paper'
                            }`}
                          >
                            {i.status === 'completed'
                              ? tr('View Dossier Report ↗')
                              : i.status === 'ready' || i.status === 'in_progress'
                                ? tr('Join Live Room ↗')
                                : tr('Inspect Run ↗')}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
  
          <div className="font-mono-code flex flex-col items-center justify-between border-t border-line bg-paper px-4 py-2.5 text-[11px] text-muted sm:flex-row">
            <div>
              {tr('SHOWING {shown} OF {total} AUDIT RECORDS', { shown: filteredInterviews.length, total: allInterviews.length })}
            </div>
            <div className="mt-1 flex items-center gap-3 sm:mt-0">
              <span className="font-semibold text-ink">{tr('ENGINE: GEMINI SELECTIVE REPO READER + GEMINI LIVE')}</span>
              <span>•</span>
              <span>{tr('MAX 5 PERSONAL / DAY')}</span>
            </div>
          </div>
        </section>
        </>
      )}

      {/* 6. Verification Protocol Guidance & Security Footer */}
      <VerificationProtocolCard />
    </div>
  );
}
