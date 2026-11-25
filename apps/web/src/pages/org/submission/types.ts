import type { ActivityEntry, CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import type { EventView, Feedback, ScoreView, VersionView } from '../../../lib/types';

export interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

export interface DetailResponse {
  primary_models?: string[];
  submission: {
    id: string;
    team_name: string;
    status: string;
    error: string | null;
    activity_json: ActivityEntry[] | null;
    models_used: string[] | null;
    locked_commit_sha: string | null;
    locked_at: string | null;
    next_attempt_at?: string | null;
    judge_attempts?: number;
    events: { id: string; name: string; rubric_json: Rubric; status: EventView['status'] };
    repo_analyses: Analysis | Analysis[] | null;
    submission_versions: VersionView[];
  };
  scores: ScoreView[];
  feedback: Feedback | null;
  interview: { id: string; status: string } | null;
}

export interface QueueSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';
  locked_commit_sha: string | null;
  total: number | null;
  ownership: { score: number; confidence: string } | null;
}

export interface QueueResponse {
  event: EventView;
  submissions: QueueSubmission[];
}

export interface AssignmentRow {
  submission_id: string;
  submissions: { team_name: string; status: QueueSubmission['status']; locked_commit_sha: string | null } | null;
  my_review: { status: 'draft' | 'submitted'; updated_at: string } | null;
}
