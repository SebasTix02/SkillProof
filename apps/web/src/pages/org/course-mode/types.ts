import type { ActivityEntry, CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import type { SubmissionPipelineStatus } from '../../../components/shared';
import type { AssignmentConsoleResponse, AssignmentView } from '../../../lib/courses';
import type { EventView, RepoRef, ScoreView } from '../../../lib/types';

export type OrgEvent = EventView & { submission_count: number; participant_count: number };

export interface ConsoleSubmission {
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

export interface Flag {
  id: string;
  submission_a: string;
  submission_b: string;
  signal: 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding' | 'shared_code';
  explanation: string;
}

export interface ConsoleResponse {
  event: EventView;
  participant_count: number;
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}

export interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

export interface DetailResponse {
  submission: {
    id: string;
    team_name: string;
    repo_analyses: Analysis | Analysis[] | null;
  };
  scores: ScoreView[];
  interview: { id: string; status: string } | null;
}

export interface IntegrityDecision {
  id: string;
  submission_id?: string | null;
  assignment_submission_id?: string | null;
  verdict: string;
  note: string;
  created_at: string;
  profiles?: { display_name: string } | null;
}

export type CourseTab = 'roster' | 'plagiarism' | 'grading' | 'rubric';
export type RosterFilter = 'all' | 'flagged' | 'incomplete_defense' | 'scored';
export type SortKey = 'risk' | 'lowest_ownership' | 'highest_grade' | 'name';
export type Source = 'events' | 'courses';
export type VerdictChoice = 'cod' | 'live_defense' | 'clear';
export type OrgAssignment = AssignmentView & { course_name: string; course_code: string };

/** What the screen needs about the event or assignment under review, whichever it is. */
export interface Target {
  kind: 'event' | 'assignment';
  id: string;
  name: string;
  tag: string;
  status: EventView['status'];
  deadline: string;
  interviews_enabled: boolean;
  rubric: Rubric;
  consoleLink: string;
  submissionLink: (sid: string) => string;
  compareLink: ((a: string, b: string, flag: string) => string) | null;
}

export interface CohortMetrics {
  avgScore: number | null;
  scoredCount: number;
  avgOwnership: number | null;
  withOwnershipCount: number;
  anomalyPct: string;
}

/** An assignment console, shaped like the event console the screen was built for. */
export function fromAssignment(d: AssignmentConsoleResponse): ConsoleResponse {
  return {
    event: null as unknown as EventView,
    participant_count: d.assignment.student_count,
    similarity_flags: d.similarity_flags,
    submissions: d.submissions.map((r) => ({
      id: r.id,
      team_name: r.label,
      submitted_by_name: r.members ? r.members.map((m) => m.display_name).join(', ') : r.label,
      status: r.status,
      error: r.error,
      activity: r.activity,
      step_count: r.activity.length,
      models_used: r.models_used,
      versions_used: r.versions_used,
      locked_commit_sha: r.locked_commit_sha,
      current_version: r.current_version?.repos ? { repos: r.current_version.repos } : null,
      scores: r.scores,
      total: r.total,
      ownership: r.ownership,
    })),
  };
}
