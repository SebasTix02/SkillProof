import { tr } from '../../i18n';
import type { Rubric } from '@skillproof/shared';
import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { one } from '../../components/Report';
import { LedgerAnchorBanner, Notice, PageState } from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AssignmentConsoleResponse } from '../../lib/courses';
import { NONE } from '../../lib/empty';
import { useLoad } from '../../lib/useLoad';
import { ForensicWorkbench } from './course-mode/ForensicWorkbench';
import { IntegrityHeader } from './course-mode/IntegrityHeader';
import { IntegrityRosterTable } from './course-mode/IntegrityRosterTable';
import { IntegrityTabPanels } from './course-mode/IntegrityTabPanels';
import {
  fromAssignment,
  type CohortMetrics,
  type ConsoleResponse,
  type CourseTab,
  type DetailResponse,
  type IntegrityDecision,
  type OrgAssignment,
  type OrgEvent,
  type RosterFilter,
  type SortKey,
  type Source,
  type Target,
  type VerdictChoice,
} from './course-mode/types';
import { csvQuote, downloadCsv } from './download';

/**
 * Integrity review: similarity signals, oral defense and verdicts per submission, for one event or one course
 * assignment at a time (a selector switches between events and courses).
 */
export function IntegrityReview() {
  const { id: routeEventId } = useParams();
  const [search0] = useSearchParams();
  const routeAssignmentId = search0.get('assignment');
  const { org, me } = useAuth();
  const toast = useToast();

  const [source, setSource] = useState<Source>(routeAssignmentId ? 'courses' : 'events');
  const orgEvents = useLoad<{ events: OrgEvent[] }>(org ? `/api/orgs/${org.id}/events` : null);
  const orgAssignments = useLoad<{ assignments: OrgAssignment[] }>(org ? `/api/orgs/${org.id}/assignments` : null);
  const events = orgEvents.data?.events ?? NONE;
  const assignments = orgAssignments.data?.assignments ?? [];

  const [selectedEventId, setSelectedEventId] = useState<string | null>(routeEventId ?? null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(routeAssignmentId);
  const activeEventId = source === 'events' ? (selectedEventId ?? events[0]?.id ?? null) : null;
  const activeAssignmentId = source === 'courses' ? (selectedAssignmentId ?? assignments[0]?.id ?? null) : null;

  const eventConsole = useLoad<ConsoleResponse>(activeEventId ? `/api/events/${activeEventId}/console` : null);
  const assignmentConsole = useLoad<AssignmentConsoleResponse>(activeAssignmentId ? `/api/assignments/${activeAssignmentId}/console` : null);
  const consoleData = source === 'events'
    ? eventConsole
    : { ...assignmentConsole, data: assignmentConsole.data ? fromAssignment(assignmentConsole.data) : null };

  const [activeTab, setActiveTab] = useState<CourseTab>('roster');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RosterFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('risk');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [docketNote, setDocketNote] = useState('');
  const [verdictChoice, setVerdictChoice] = useState<VerdictChoice>('live_defense');
  const [busyScoreId, setBusyScoreId] = useState<string | null>(null);
  const [savingVerdict, setSavingVerdict] = useState(false);
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const integrity = useLoad<{ decisions: IntegrityDecision[] }>(
    activeEventId && (canDecide || org?.permissions.includes('event.manage'))
      ? `/api/events/${activeEventId}/integrity`
      : activeAssignmentId && (canDecide || org?.permissions.includes('course.manage'))
        ? `/api/assignments/${activeAssignmentId}/integrity`
        : null,
  );

  const submissions = consoleData.data?.submissions ?? NONE;
  const flags = consoleData.data?.similarity_flags ?? NONE;
  const flaggedSet = useMemo(
    () => new Set(flags.flatMap((f) => [f.submission_a, f.submission_b])),
    [flags],
  );

  const metrics = useMemo<CohortMetrics>(() => {
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
  const rawDetail = useLoad<DetailResponse & { interviews?: { id: string; status: string }[] }>(
    effectiveSelectedId ? (source === 'events' ? `/api/submissions/${effectiveSelectedId}` : `/api/assignment-submissions/${effectiveSelectedId}`) : null,
  );
  const selectedDetail = {
    ...rawDetail,
    data: rawDetail.data ? { ...rawDetail.data, interview: rawDetail.data.interview ?? rawDetail.data.interviews?.[0] ?? null } : null,
  };

  const lists = source === 'events' ? orgEvents : orgAssignments;
  if (lists.loading && !lists.data) return <PageState loading error={null} kind="console" />;
  if (lists.error) return <PageState loading={false} error={lists.error} />;

  const ev = source === 'events' ? (eventConsole.data?.event ?? events.find((e) => e.id === activeEventId) ?? null) : null;
  const asg = source === 'courses' ? (assignmentConsole.data?.assignment ?? assignments.find((x) => x.id === activeAssignmentId) ?? null) : null;
  const event: Target | null = ev
    ? {
        kind: 'event',
        id: ev.id,
        name: ev.name,
        tag: `/e/${ev.slug}`,
        status: ev.status,
        deadline: ev.submission_deadline,
        interviews_enabled: ev.interviews_enabled,
        rubric: ev.rubric_json,
        consoleLink: `/org/events/${ev.id}`,
        submissionLink: (sid) => `/org/events/${ev.id}/s/${sid}`,
        compareLink: (x, y, flag) => `/org/events/${ev.id}/compare?a=${x}&b=${y}&flag=${flag}`,
      }
    : asg
      ? {
          kind: 'assignment',
          id: asg.id,
          name: asg.title,
          tag: assignments.find((x) => x.id === asg.id)?.course_name ?? assignmentConsole.data?.course.name ?? tr('Course'),
          status: asg.status,
          deadline: asg.due_at,
          interviews_enabled: asg.interviews_enabled,
          rubric: asg.rubric_json,
          consoleLink: `/org/courses/${asg.course_id}/assignments/${asg.id}`,
          submissionLink: (sid) => `/org/courses/${asg.course_id}/assignments/${asg.id}/s/${sid}`,
          compareLink: (_x, _y, flag) => `/org/courses/${asg.course_id}/assignments/${asg.id}/compare?flag=${flag}`,
        }
      : null;
  const canOverride =
    event?.status === 'review' &&
    (event.kind === 'event' ? !!org?.permissions.includes('score.override') : !!org?.permissions.includes('course.manage'));
  const empty = source === 'events' ? events.length === 0 : assignments.length === 0;

  function exportCanvasCsv() {
    if (!event || submissions.length === 0) {
      toast.error(tr('No student submissions available to export.'));
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
      csvQuote(s.submitted_by_name || s.team_name),
      csvQuote(s.team_name),
      s.current_version?.repos ? `${s.current_version.repos.owner}/${s.current_version.repos.name}` : '',
      s.locked_commit_sha ?? '',
      s.total != null ? s.total.toFixed(1) : '',
      s.ownership ? String(s.ownership.score) : '',
      flaggedSet.has(s.id) ? 'YES' : 'NO',
      s.status,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    downloadCsv(`${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-integrity.csv`, csv);
    toast.success(tr('Exported as CSV.'));
  }

  /** The faculty determination for one student, kept as history in integrity_decisions. */
  async function saveVerdict(submissionId: string, who: string) {
    setSavingVerdict(true);
    try {
      await api('/api/integrity-decisions', {
        body: {
          [event?.kind === 'assignment' ? 'assignment_submission_id' : 'submission_id']: submissionId,
          verdict: verdictChoice === 'cod' ? 'code_of_conduct' : verdictChoice,
          note: docketNote,
        },
      });
      toast.success(tr('Determination saved for {name}.', { name: who }));
      setDocketNote('');
      await integrity.reload();
    } catch (err) {
      toast.error(tr('Could not save the determination. {error}', { error: errorMessage(err) }));
    } finally {
      setSavingVerdict(false);
    }
  }

  async function overrideScore(scoreId: string, value: number) {
    setBusyScoreId(scoreId);
    try {
      await api(`${event?.kind === 'assignment' ? '/api/assignment-scores' : '/api/scores'}/${scoreId}`, { method: 'PATCH', body: { override_score: value } });
      toast.success(tr('Criterion updated to {value}/10.', { value }));
      await Promise.all([consoleData.reload(), selectedDetail.reload()]);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyScoreId(null);
    }
  }

  const selectedAnalysis = selectedDetail.data ? one(selectedDetail.data.submission.repo_analyses) : null;
  const selectedScores = selectedDetail.data?.scores ?? selectedSummary?.scores ?? [];
  const selectedRubric: Rubric = event?.rubric ?? [];

  return (
    <div className="space-y-6">
      <IntegrityHeader
        orgName={org?.name}
        reviewerName={me?.profile.display_name}
        source={source}
        onSourceChange={(k) => {
          setSource(k);
          setSelectedSubId(null);
        }}
        events={events}
        assignments={assignments}
        activeEventId={activeEventId}
        onSelectEvent={(id) => {
          setSelectedEventId(id);
          setSelectedSubId(null);
        }}
        activeAssignmentId={activeAssignmentId}
        onSelectAssignment={(id) => {
          setSelectedAssignmentId(id);
          setSelectedSubId(null);
        }}
        target={event}
        participantCount={consoleData.data?.participant_count}
        submissionCount={submissions.length}
        flagCount={flags.length}
        withOwnershipCount={metrics.withOwnershipCount}
        rubricCount={selectedRubric.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRefresh={() => void consoleData.reload()}
        onExportCsv={exportCanvasCsv}
      />

      {empty ? (
        <Notice tone="info">
          {source === 'events' ? (
            <>
              {tr('No events to review yet.')}{' '}
              <Link to="/org/events/new" className="font-semibold text-accent-ink underline">
                {tr('Create an event')}
              </Link>
              .
            </>
          ) : (
            <>
              {tr('No course assignments to review yet.')}{' '}
              <Link to="/org/courses" className="font-semibold text-accent-ink underline">
                {tr('Open a course')}
              </Link>{' '}
              {tr('to create one.')}
            </>
          )}
        </Notice>
      ) : (
        <>
          <IntegrityTabPanels
            target={event}
            metrics={metrics}
            submissions={submissions}
            flags={flags}
            activeTab={activeTab}
            selectedRubric={selectedRubric}
          />

          <IntegrityRosterTable
            target={event}
            submissionsCount={submissions.length}
            flaggedSet={flaggedSet}
            metrics={metrics}
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            sortBy={sortBy}
            onSortChange={setSortBy}
            filteredRows={filteredRows}
            effectiveSelectedId={effectiveSelectedId}
            onSelectSub={setSelectedSubId}
          />

          {selectedSummary && (
            <ForensicWorkbench
              target={event}
              selectedSummary={selectedSummary}
              isFlagged={flaggedSet.has(selectedSummary.id)}
              interview={selectedDetail.data?.interview}
              selectedAnalysis={selectedAnalysis}
              selectedScores={selectedScores}
              selectedRubric={selectedRubric}
              canOverride={canOverride}
              canDecide={canDecide}
              busyScoreId={busyScoreId}
              onOverrideScore={(scoreId, value) => void overrideScore(scoreId, value)}
              verdictChoice={verdictChoice}
              onVerdictChoiceChange={setVerdictChoice}
              docketNote={docketNote}
              onDocketNoteChange={setDocketNote}
              savingVerdict={savingVerdict}
              onSaveVerdict={(submissionId, who) => void saveVerdict(submissionId, who)}
              decisions={integrity.data?.decisions ?? []}
            />
          )}
        </>
      )}

      <LedgerAnchorBanner
        badge={tr('INTEGRITY LOG')}
        meta={tr('FROZEN COMMITS // CSV EXPORT')}
        title={tr('Every grading change is in the audit log')}
        description={tr('Scores are judged on the commit frozen at the deadline. Faculty overrides and integrity determinations are recorded with who made them and when.')}
      />
    </div>
  );
}
