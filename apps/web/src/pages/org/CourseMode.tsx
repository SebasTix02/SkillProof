import type { ActivityEntry, CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { one } from '../../components/Report';
import {
  Badge,
  Button,
  DossierPageHeader,
  Input,
  LedgerAnchorBanner,
  LiveDot,
  Notice,
  PageState,
  SUBMISSION_STATUS_LABEL,
  ScoreBar,
  Select,
  TabStrip,
  Textarea,
  TopAccentKpiCard,
  WaveformVisualizer,
  formatDate,
  linkButton,
  linkButtonSecondary,
  scoreTone,
  type SubmissionPipelineStatus,
} from '../../components/shared';
import { CoursePanel } from '../../components/CoursePanel';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL, type EventView, type RepoRef, type ScoreView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

type OrgEvent = EventView & { submission_count: number; participant_count: number };

interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: SubmissionPipelineStatus;
  error: string | null;
  activity: ActivityEntry[];
  step_count: number;
  models_used: string[] | null;
  versions_used: number;
  locked_commit_sha: string | null;
  current_version: { repos: RepoRef } | null;
  scores: ScoreView[];
  total: number | null;
  ownership: { score: number; confidence: string } | null;
}

interface Flag {
  id: string;
  submission_a: string;
  submission_b: string;
  signal: 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding';
  explanation: string;
}

interface ConsoleResponse {
  event: EventView;
  participant_count: number;
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}

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
    repo_analyses: Analysis | Analysis[] | null;
  };
  scores: ScoreView[];
  interview: { id: string; status: string } | null;
}

type CourseTab = 'roster' | 'plagiarism' | 'grading' | 'rubric';

const VERDICT_LABEL: Record<string, string> = {
  code_of_conduct: 'Referred to committee',
  live_defense: 'Live defense required',
  clear: 'Cleared',
};
type RosterFilter = 'all' | 'flagged' | 'incomplete_defense' | 'scored';
type SortKey = 'risk' | 'lowest_ownership' | 'highest_grade' | 'name';

export function CourseMode() {
  const { id: routeEventId } = useParams();
  const { org, me } = useAuth();
  const toast = useToast();

  const orgEvents = useLoad<{ events: OrgEvent[] }>(org ? `/api/orgs/${org.id}/events` : null);
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const allEvents = orgEvents.data?.events ?? [];
  // With a course picked, the selector lists only its assignments.
  const events = courseFilter ? allEvents.filter((e) => (e as OrgEvent & { course_id?: string | null }).course_id === courseFilter) : allEvents;

  const [selectedEventId, setSelectedEventId] = useState<string | null>(routeEventId ?? null);
  const activeEventId =
    selectedEventId ??
    routeEventId ??
    events.find((e) => e.kind === 'assignment')?.id ??
    events[0]?.id ??
    null;

  const consoleData = useLoad<ConsoleResponse>(activeEventId ? `/api/events/${activeEventId}/console` : null);

  const [activeTab, setActiveTab] = useState<CourseTab>('roster');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('risk');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [docketNote, setDocketNote] = useState('');
  const [verdictChoice, setVerdictChoice] = useState<'cod' | 'live_defense' | 'clear'>('live_defense');
  const [busyScoreId, setBusyScoreId] = useState<string | null>(null);
  const [savingVerdict, setSavingVerdict] = useState(false);
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const integrity = useLoad<{ decisions: { id: string; submission_id: string | null; verdict: string; note: string; created_at: string; profiles?: { display_name: string } | null }[] }>(
    activeEventId && (canDecide || org?.permissions.includes('event.manage')) ? `/api/events/${activeEventId}/integrity` : null,
  );

  const submissions = consoleData.data?.submissions ?? [];
  const flags = consoleData.data?.similarity_flags ?? [];
  const flaggedSet = useMemo(
    () => new Set(flags.flatMap((f) => [f.submission_a, f.submission_b])),
    [flags],
  );

  const metrics = useMemo(() => {
    const scored = submissions.filter((s) => s.total != null);
    const avgScore =
      scored.length > 0 ? scored.reduce((acc, s) => acc + (s.total ?? 0), 0) / scored.length : null;
    const withOwnership = submissions.filter((s) => s.ownership != null);
    const avgOwnership =
      withOwnership.length > 0
        ? withOwnership.reduce((acc, s) => acc + (s.ownership?.score ?? 0), 0) / withOwnership.length
        : null;
    const anomalyPct =
      submissions.length > 0 ? ((flaggedSet.size / submissions.length) * 100).toFixed(1) : '0.0';
    return {
      avgScore,
      scoredCount: scored.length,
      avgOwnership,
      withOwnershipCount: withOwnership.length,
      anomalyPct,
    };
  }, [submissions, flaggedSet]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = submissions.filter((s) => {
      if (filter === 'flagged' && !flaggedSet.has(s.id)) return false;
      if (filter === 'incomplete_defense' && s.ownership != null) return false;
      if (filter === 'scored' && s.status !== 'scored') return false;
      if (!q) return true;
      return (
        s.team_name.toLowerCase().includes(q) ||
        s.submitted_by_name.toLowerCase().includes(q) ||
        (s.locked_commit_sha?.toLowerCase().includes(q) ?? false) ||
        (s.current_version?.repos.name.toLowerCase().includes(q) ?? false)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'risk') {
        const fa = flaggedSet.has(a.id) ? 1 : 0;
        const fb = flaggedSet.has(b.id) ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return (a.ownership?.score ?? 101) - (b.ownership?.score ?? 101);
      }
      if (sortBy === 'lowest_ownership') {
        return (a.ownership?.score ?? 101) - (b.ownership?.score ?? 101);
      }
      if (sortBy === 'highest_grade') {
        return (b.total ?? -1) - (a.total ?? -1);
      }
      return (a.submitted_by_name || a.team_name).localeCompare(b.submitted_by_name || b.team_name);
    });
  }, [submissions, search, filter, sortBy, flaggedSet]);

  const effectiveSelectedId =
    selectedSubId && submissions.some((s) => s.id === selectedSubId)
      ? selectedSubId
      : (filteredRows[0]?.id ?? submissions[0]?.id ?? null);

  const selectedSummary = submissions.find((s) => s.id === effectiveSelectedId) ?? null;
  const selectedDetail = useLoad<DetailResponse>(
    effectiveSelectedId ? `/api/submissions/${effectiveSelectedId}` : null,
  );

  if (orgEvents.loading && !orgEvents.data) return <PageState loading error={null} kind="console" />;
  if (orgEvents.error) return <PageState loading={false} error={orgEvents.error} />;

  const event = consoleData.data?.event ?? events.find((e) => e.id === activeEventId) ?? null;
  const canOverride =
    !!org?.permissions.includes('score.override') && event?.status === 'review';

  function exportCanvasCsv() {
    if (!event || submissions.length === 0) {
      toast.error('No student submissions available to export.');
      return;
    }
    const header = [
      'Student',
      'Team',
      'Repository',
      'Commit_SHA',
      'Rubric_Score',
      'Oral_Ownership',
      'Similarity_Flagged',
      'Status',
    ];
    const rows = submissions.map((s) => [
      `"${(s.submitted_by_name || s.team_name).replace(/"/g, '""')}"`,
      `"${s.team_name.replace(/"/g, '""')}"`,
      s.current_version?.repos ? `${s.current_version.repos.owner}/${s.current_version.repos.name}` : '',
      s.locked_commit_sha ?? '',
      s.total != null ? s.total.toFixed(1) : '',
      s.ownership ? String(s.ownership.score) : '',
      flaggedSet.has(s.id) ? 'YES' : 'NO',
      s.status,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-course-gradebook.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Course gradebook exported as CSV.');
  }

  /** The faculty determination for one student, kept as history in integrity_decisions. */
  async function saveVerdict(submissionId: string, who: string) {
    setSavingVerdict(true);
    try {
      await api('/api/integrity-decisions', {
        body: { submission_id: submissionId, verdict: verdictChoice === 'cod' ? 'code_of_conduct' : verdictChoice, note: docketNote },
      });
      toast.success(`Determination saved for ${who}.`);
      setDocketNote('');
      await integrity.reload();
    } catch (err) {
      toast.error(`Could not save the determination. ${errorMessage(err)}`);
    } finally {
      setSavingVerdict(false);
    }
  }

  async function overrideScore(scoreId: string, value: number) {
    setBusyScoreId(scoreId);
    try {
      await api(`/api/scores/${scoreId}`, { method: 'PATCH', body: { override_score: value } });
      toast.success(`Criterion updated to ${value}/10.`);
      await Promise.all([consoleData.reload(), selectedDetail.reload()]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyScoreId(null);
    }
  }

  const selectedAnalysis = selectedDetail.data ? one(selectedDetail.data.submission.repo_analyses) : null;
  const selectedScores = selectedDetail.data?.scores ?? selectedSummary?.scores ?? [];
  const selectedRubric: Rubric = event?.rubric_json ?? [];

  return (
    <div className="space-y-6">
      <CoursePanel
        selectedId={courseFilter}
        onSelect={(cid) => {
          setCourseFilter(cid);
          setSelectedEventId(null);
          setSelectedSubId(null);
        }}
      />
      {/* 1. Faculty Portal Department Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-line bg-white px-5 py-2.5">
        <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-accent-soft px-2 py-0.5 font-bold text-accent-ink">
            <span className="material-symbols-outlined text-[14px]">school</span>
            <span>FACULTY PORTAL</span>
          </span>
          <span className="text-line">//</span>
          <span className="font-semibold text-ink">{org?.name?.toUpperCase() ?? 'DEPARTMENT'}</span>
          {event && (
            <>
              <span className="text-line">•</span>
              <span className="rounded-[3px] border border-line bg-paper px-2 py-0.5 font-bold text-ink">
                /e/{event.slug}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good-soft px-2.5 py-0.5 text-[10px] font-semibold text-good-ink">
            <LiveDot tone="good" />
            <span>GRADEBOOK SYNC READY</span>
          </span>
          {events.length > 0 && (
            <Select
              aria-label="Select Assignment / Event"
              value={activeEventId ?? ''}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setSelectedSubId(null);
              }}
              className="font-mono-code h-8 w-56 bg-paper text-[11px]"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} ({STATUS_LABEL[ev.status]})
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* 2. Course Context Header */}
      <section className="space-y-5 rounded-[6px] border border-line bg-white p-6">
        <DossierPageHeader
          eyebrow={
            <div className="flex flex-wrap items-center gap-2 text-muted">
              <Link to="/org/events" className="text-accent hover:underline">
                ← ORGANIZER CONSOLE
              </Link>
              <span>/</span>
              <span>FORENSIC GRADEBOOK &amp; INTEGRITY CONSOLE</span>
            </div>
          }
          title={event ? event.name : 'Teacher & Course Mode'}
          subtitle="Comprehensive cohort telemetry, similarity cluster inspection, and oral defense verification across student repository submissions."
          borderBottom={false}
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void consoleData.reload()}
                className={linkButtonSecondary}
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span>Refresh</span>
              </button>
              <button type="button" onClick={exportCanvasCsv} className={linkButtonSecondary}>
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>Export Gradebook CSV</span>
              </button>
              {event && (
                <Link to={`/org/events/${event.id}`} className={linkButton}>
                  <span className="material-symbols-outlined text-[16px]">gavel</span>
                  <span>Event Console</span>
                </Link>
              )}
            </div>
          }
        />

        {/* Metadata Chips Strip */}
        {event && (
          <div className="font-mono-code grid grid-cols-2 gap-4 border-t border-line pt-4 text-[12px] md:grid-cols-5">
            <div>
              <span className="block text-[10px] text-muted uppercase">Instructor</span>
              <span className="font-semibold text-ink">{me?.profile.display_name || 'Faculty Lead'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">Active Cohort</span>
              <span className="font-semibold text-ink">
                {consoleData.data?.participant_count ?? 0} Registered Students
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">Assignment Status</span>
              <span className="font-semibold text-accent uppercase">{STATUS_LABEL[event.status]}</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">Submissions</span>
              <span className="font-semibold text-ink">
                {submissions.length} / {consoleData.data?.participant_count ?? submissions.length}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-muted uppercase">Deadline</span>
              <span className="font-semibold text-good">{formatDate(event.submission_deadline)}</span>
            </div>
          </div>
        )}

        <TabStrip
          tabs={[
            {
              key: 'roster',
              label: '01. Assignment Roster',
              count: submissions.length,
              icon: 'group',
            },
            {
              key: 'plagiarism',
              label: '02. Similarity & Plagiarism Matrix',
              count: flags.length,
              icon: 'schema',
            },
            {
              key: 'grading',
              label: '03. Oral Defense & Review',
              count: metrics.withOwnershipCount,
              icon: 'record_voice_over',
            },
            {
              key: 'rubric',
              label: '04. Course Rubric Spec',
              count: selectedRubric.length,
              icon: 'fact_check',
            },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      </section>

      {events.length === 0 ? (
        <Notice tone="info">
          No events or course assignments exist yet in your organization.{' '}
          <Link to="/org/events/new" className="font-semibold text-accent underline">
            Create your first assignment →
          </Link>
        </Notice>
      ) : (
        <>
          {/* 3. 4-Column Metric Telemetry Cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TopAccentKpiCard
              accent="cobalt"
              eyebrow="Class Average Score"
              icon="analytics"
              value={metrics.avgScore != null ? metrics.avgScore.toFixed(1) : '—'}
              unit="/ 100"
              description={`${metrics.scoredCount} of ${submissions.length} submissions scored.`}
            />
            <TopAccentKpiCard
              accent="emerald"
              eyebrow="Authorship Confidence"
              icon="fingerprint"
              value={metrics.avgOwnership != null ? `${metrics.avgOwnership.toFixed(1)}%` : '—'}
              unit="Mean"
              description={`${metrics.withOwnershipCount} students completed 3-min voice defense.`}
            />
            <TopAccentKpiCard
              accent="amber"
              eyebrow="Similarity Anomalies"
              icon="schema"
              value={`${metrics.anomalyPct}%`}
              unit={`(${flags.length} pairs)`}
              description="Shared repositories, common forks, or structural matches."
            />
            <TopAccentKpiCard
              accent="neutral"
              eyebrow="Oral Defense Status"
              icon="mic"
              value={metrics.withOwnershipCount}
              unit="Completed"
              description={
                event?.interviews_enabled
                  ? 'Gemini Live 3-minute repository cross-exam enabled.'
                  : 'Oral defense disabled for this assignment.'
              }
            />
          </section>

          {/* Tab 04: Course Rubric View */}
          {activeTab === 'rubric' && selectedRubric.length > 0 && (
            <section className="space-y-4 rounded-[6px] border border-line bg-white p-6">
              <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                Course Rubric &amp; Auto-Grader Criteria
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {selectedRubric.map((c, idx) => (
                  <div key={c.key} className="space-y-1.5 rounded-[4px] border border-line bg-paper/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono-code text-[11px] font-bold text-accent uppercase">
                        Criterion {String(idx + 1).padStart(2, '0')}
                      </span>
                      <Badge tone="neutral">WEIGHT: {c.weight}%</Badge>
                    </div>
                    <div className="font-serif-heading text-[18px] font-medium text-ink">{c.name}</div>
                    {c.description && <p className="text-[13px] text-muted">{c.description}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tab 02: Similarity Flags Quick Matrix */}
          {activeTab === 'plagiarism' && (
            <section className="space-y-4 rounded-[6px] border border-line bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif-heading text-[22px] font-medium text-ink">
                    Plagiarism &amp; Similarity Cluster Matrix
                  </h2>
                  <p className="text-[13px] text-muted">
                    Inspect flagged submission pairs side-by-side in the Forensic Comparison Console.
                  </p>
                </div>
                {event && flags[0] && (
                  <Link
                    to={`/org/events/${event.id}/compare?a=${flags[0].submission_a}&b=${flags[0].submission_b}&flag=${flags[0].id}`}
                    className={linkButton}
                  >
                    Open Forensic Comparison →
                  </Link>
                )}
              </div>

              {flags.length === 0 ? (
                <Notice tone="good">Zero similarity anomalies detected across the current cohort.</Notice>
              ) : (
                <ul className="space-y-2.5">
                  {flags.map((f) => {
                    const nameA = submissions.find((s) => s.id === f.submission_a)?.team_name ?? 'Team A';
                    const nameB = submissions.find((s) => s.id === f.submission_b)?.team_name ?? 'Team B';
                    return (
                      <li
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-warn/35 bg-warn-soft/35 p-3.5 text-[13px]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="warn">{f.signal.replace('_', ' ')}</Badge>
                          <strong className="text-ink">{nameA}</strong>
                          <span className="text-muted">↔</span>
                          <strong className="text-ink">{nameB}</strong>
                          {f.explanation && <span className="font-mono-code text-[12px] text-muted">· {f.explanation}</span>}
                        </div>
                        {event && (
                          <Link
                            to={`/org/events/${event.id}/compare?a=${f.submission_a}&b=${f.submission_b}&flag=${f.id}`}
                            className="font-mono-code text-[11px] font-semibold text-accent hover:underline"
                          >
                            Compare Side-by-Side →
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* 4. Filter & Operational Toolbar + High-Density Roster Matrix */}
          <section className="space-y-3">
            <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-line bg-white p-3.5 md:flex-row md:items-center">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative max-w-md flex-1">
                  <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[17px] text-muted">
                    search
                  </span>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search student, team, commit SHA, or repo..."
                    className="h-9 bg-paper pl-8 text-[12px]"
                  />
                </div>

                <div className="font-mono-code flex flex-wrap items-center divide-x divide-line overflow-hidden rounded-[4px] border border-line text-[11px]">
                  {(
                    [
                      { key: 'all', label: `All (${submissions.length})` },
                      { key: 'flagged', label: `Flagged (${flaggedSet.size})` },
                      {
                        key: 'incomplete_defense',
                        label: `No Defense (${submissions.length - metrics.withOwnershipCount})`,
                      },
                      { key: 'scored', label: `Scored (${metrics.scoredCount})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`cursor-pointer px-2.5 py-1.5 transition-colors ${
                        filter === f.key
                          ? 'bg-accent-soft font-bold text-accent-ink'
                          : 'bg-white text-muted hover:bg-paper hover:text-ink'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono-code text-[11px] text-muted">SORT:</span>
                <Select
                  aria-label="Sort submissions"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  className="font-mono-code h-9 w-48 bg-paper text-[11px]"
                >
                  <option value="risk">Similarity &amp; Risk (Desc)</option>
                  <option value="lowest_ownership">Lowest Ownership Score</option>
                  <option value="highest_grade">Highest Composite Grade</option>
                  <option value="name">Student Name (A–Z)</option>
                </Select>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[6px] border border-line bg-white">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Student / Team</th>
                    <th className="px-3 py-3 font-semibold">Repository &amp; Commit</th>
                    <th className="px-3 py-3 text-right font-semibold">Oral Probe</th>
                    <th className="px-3 py-3 font-semibold">Integrity Signal</th>
                    <th className="px-3 py-3 text-right font-semibold">Composite</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Inspection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted">
                        No student submissions match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((s) => {
                      const repo = s.current_version?.repos;
                      const isFlagged = flaggedSet.has(s.id);
                      const isSelected = s.id === effectiveSelectedId;
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedSubId(s.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-accent-soft/45'
                              : isFlagged
                                ? 'bg-bad-soft/25 hover:bg-bad-soft/40'
                                : 'hover:bg-paper/60'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  isFlagged ? 'bg-bad' : s.status === 'scored' ? 'bg-good' : 'bg-muted'
                                }`}
                              />
                              <div>
                                <div className="font-semibold text-ink">{s.submitted_by_name || s.team_name}</div>
                                <div className="font-mono-code text-[11px] text-muted">{s.team_name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="font-mono-code px-3 py-3 text-[12px]">
                            {repo ? (
                              <a
                                href={repo.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-accent hover:underline"
                              >
                                {repo.owner}/{repo.name}
                              </a>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                            {s.locked_commit_sha && (
                              <div className="text-[10px] text-muted">commit @{s.locked_commit_sha.slice(0, 7)}</div>
                            )}
                          </td>
                          <td className="font-mono-code px-3 py-3 text-right">
                            {s.ownership ? (
                              <span
                                className={`font-bold ${
                                  s.ownership.score >= 70 ? 'text-good' : 'text-bad'
                                }`}
                              >
                                {s.ownership.score}/100
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {isFlagged ? (
                              <Badge tone="bad" dot>
                                Similarity Flag
                              </Badge>
                            ) : (
                              <Badge tone="good">Unique Tree</Badge>
                            )}
                          </td>
                          <td className="font-mono-code px-3 py-3 text-right text-[14px] font-bold text-ink">
                            {s.total != null ? `${s.total.toFixed(1)}` : '—'}
                            <span className="text-[11px] font-normal text-muted"> / 100</span>
                          </td>
                          <td className="px-3 py-3">
                            <Badge tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}>
                              {SUBMISSION_STATUS_LABEL[s.status]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {event && (
                              <Link
                                to={`/org/events/${event.id}/s/${s.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-accent hover:border-accent"
                              >
                                <span>Inspect</span>
                                <span>→</span>
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 5. TA & Professor Forensic Review Workbench (Split Forensic Drawer) */}
          {selectedSummary && (
            <section className="overflow-hidden rounded-[6px] border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      flaggedSet.has(selectedSummary.id) ? 'bg-bad' : 'bg-good'
                    }`}
                  />
                  <h2 className="font-serif-heading text-[20px] font-medium text-ink">
                    Forensic Cross-Examination: {selectedSummary.submitted_by_name || selectedSummary.team_name}
                  </h2>
                  {flaggedSet.has(selectedSummary.id) && <Badge tone="bad">FLAGGED FOR REVIEW</Badge>}
                </div>
                <div className="font-mono-code flex items-center gap-2 text-[11px] text-muted">
                  <span>TEAM: {selectedSummary.team_name}</span>
                  {selectedSummary.locked_commit_sha && (
                    <>
                      <span>•</span>
                      <span>COMMIT: @{selectedSummary.locked_commit_sha.slice(0, 7)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
                {/* Left 7 Cols: Audio Defense Telemetry & Repo Map Summary */}
                <div className="space-y-5 p-6 lg:col-span-7">
                  <div className="space-y-2">
                    <div className="font-mono-code flex items-center justify-between text-[11px] text-muted uppercase">
                      <span>AI Oral Defense Telemetry</span>
                      <span className="font-semibold text-ink">
                        {selectedSummary.ownership
                          ? `OWNERSHIP: ${selectedSummary.ownership.score}/100 (${selectedSummary.ownership.confidence})`
                          : 'NO ORAL DEFENSE RECORDED'}
                      </span>
                    </div>
                    <div className="rounded-[4px] border border-line bg-paper p-3.5">
                      <WaveformVisualizer active={Boolean(selectedSummary.ownership)} />
                      {selectedDetail.data?.interview && (
                        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-[12px]">
                          <span className="font-mono-code text-muted">
                            Session Status: {selectedDetail.data.interview.status.toUpperCase()}
                          </span>
                          <Link
                            to={`/interview/${selectedDetail.data.interview.id}`}
                            className="font-mono-code font-semibold text-accent hover:underline"
                          >
                            Open Full Voice Transcript →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedAnalysis && (
                    <div className="space-y-2 rounded-[4px] border border-line bg-paper/50 p-4">
                      <div className="font-mono-code flex items-center justify-between text-[11px] text-muted uppercase">
                        <span>Repository Analysis Summary</span>
                        <span>{selectedAnalysis.file_count} files inspected</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink">{selectedAnalysis.map_json.summary}</p>
                    </div>
                  )}

                  {selectedScores.length > 0 && (
                    <div className="space-y-2">
                      <span className="font-mono-code block text-[11px] font-bold text-muted uppercase">
                        Criterion Breakdown
                      </span>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {selectedScores.map((sc) => {
                          const crit = selectedRubric.find((c) => c.key === sc.criterion_key);
                          const val = sc.override_score ?? sc.ai_score ?? null;
                          return (
                            <div key={sc.id} className="rounded-[4px] border border-line bg-paper/45 p-3 text-[12px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-ink">{crit?.name ?? sc.criterion_key}</span>
                                <Badge tone={scoreTone(val)}>{val ?? '–'}/10</Badge>
                              </div>
                              <ScoreBar value={(val ?? 0) * 10} max={100} tone={scoreTone(val) === 'bad' ? 'bad' : 'accent'} heightClass="h-1" />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 5 Cols: Faculty Grading & Determination */}
                <div className="flex flex-col justify-between space-y-5 bg-white p-6 lg:col-span-5">
                  <div className="space-y-4">
                    <div className="font-mono-code flex items-center justify-between border-b border-line pb-2 text-[11px] text-muted uppercase">
                      <span>Faculty Grade Override &amp; Determination</span>
                      <span>{canOverride ? 'OVERRIDE ACTIVE' : STATUS_LABEL[event?.status ?? 'open']}</span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold text-ink">Composite Assignment Grade</span>
                      <div className="font-mono-code">
                        <span className="text-[24px] font-bold text-ink">
                          {selectedSummary.total != null ? selectedSummary.total.toFixed(1) : '—'}
                        </span>
                        <span className="text-[12px] text-muted"> / 100</span>
                      </div>
                    </div>

                    {canOverride && selectedScores[0] && (
                      <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3">
                        <label className="font-mono-code block text-[11px] font-semibold text-ink">
                          Quick Adjust First Criterion ({selectedRubric[0]?.name ?? selectedScores[0].criterion_key})
                        </label>
                        <div className="flex items-center gap-2">
                          <Select
                            disabled={busyScoreId === selectedScores[0].id}
                            value={selectedScores[0].override_score ?? ''}
                            onChange={(e) => {
                              if (e.target.value) void overrideScore(selectedScores[0]!.id, Number(e.target.value));
                            }}
                            className="font-mono-code h-8 bg-white text-[12px]"
                          >
                            <option value="">Keep AI ({selectedScores[0].ai_score ?? '–'})</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                              <option key={n} value={n}>
                                {n} / 10
                              </option>
                            ))}
                          </Select>
                          {event && (
                            <Link
                              to={`/org/events/${event.id}/s/${selectedSummary.id}`}
                              className="font-mono-code shrink-0 text-[11px] font-semibold text-accent hover:underline"
                            >
                              All Criteria →
                            </Link>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <span className="font-mono-code block text-[11px] font-bold text-ink uppercase">
                        Integrity Verdict
                      </span>
                      {(
                        [
                          {
                            key: 'cod',
                            title: 'Refer to Committee on Discipline',
                            desc: 'Unexplained similarity + failed oral defense.',
                          },
                          {
                            key: 'live_defense',
                            title: 'Mandate Live In-Person Defense',
                            desc: 'Schedule 15-minute whiteboard walk with TA/instructor.',
                          },
                          {
                            key: 'clear',
                            title: 'Clear Flag (Verified Authorship)',
                            desc: 'Approve grade for final roster publication.',
                          },
                        ] as const
                      ).map((v) => (
                        <label
                          key={v.key}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-[4px] border p-2.5 text-[12px] ${
                            verdictChoice === v.key ? 'border-accent bg-accent-soft/40' : 'border-line bg-paper/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="faculty_verdict"
                            checked={verdictChoice === v.key}
                            onChange={() => setVerdictChoice(v.key)}
                            className="mt-0.5 accent-accent"
                          />
                          <div>
                            <div className="font-semibold text-ink">{v.title}</div>
                            <div className="text-[11px] text-muted">{v.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <label className="font-mono-code block text-[11px] font-semibold text-ink uppercase">
                        Official Docket Notes
                      </label>
                      <Textarea
                        rows={3}
                        value={docketNote}
                        onChange={(e) => setDocketNote(e.target.value)}
                        placeholder="Document TA/faculty review notes prior to publishing grades..."
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
                    <Button
                      type="button"
                      variant={verdictChoice === 'cod' ? 'danger' : 'primary'}
                      className="flex-1"
                      disabled={!canDecide || savingVerdict}
                      onClick={() => void saveVerdict(selectedSummary.id, selectedSummary.submitted_by_name || selectedSummary.team_name)}
                    >
                      {savingVerdict ? 'Saving…' : 'Save Determination'}
                    </Button>
                    {event && (
                      <Link to={`/org/events/${event.id}/s/${selectedSummary.id}`} className={linkButtonSecondary}>
                        Full Judge View
                      </Link>
                    )}
                  </div>
                  {!canDecide && <p className="text-[11px] text-muted">Your role cannot record integrity determinations.</p>}
                  {(() => {
                    const history = (integrity.data?.decisions ?? []).filter((d) => d.submission_id === selectedSummary.id);
                    if (history.length === 0) return <p className="text-[11px] text-muted">No determination recorded for this student yet.</p>;
                    return (
                      <ul className="space-y-1 border-t border-line pt-3 text-[11px]">
                        {history.map((d) => (
                          <li key={d.id}>
                            <span className="font-mono-code font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                            <span className="text-muted"> · {d.profiles?.display_name || 'reviewer'} · {formatDate(d.created_at)}</span>
                            {d.note && <span className="block text-muted">{d.note}</span>}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <LedgerAnchorBanner
        badge="FACULTY GRADEBOOK"
        meta="FROZEN COMMITS // CSV EXPORT"
        title="Every grading change is in the audit log"
        description="Scores are judged on the commit frozen at the deadline. Faculty overrides and integrity determinations are recorded with who made them and when."
      />
    </div>
  );
}
