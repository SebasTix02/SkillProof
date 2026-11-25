import type { CommitProfile, RepoMap, Rubric } from '@skillproof/shared';
import type { SimilaritySignal } from '../../../components/shared';
import type { EventView, RepoRef, ScoreView, VersionView } from '../../../lib/types';

export interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: string;
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
  signal: SimilaritySignal;
  explanation: string;
}

export interface ConsoleResponse {
  event: EventView;
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

export interface SubmissionDetailPayload {
  submission: {
    id: string;
    team_name: string;
    status: string;
    locked_commit_sha: string | null;
    locked_at: string | null;
    events: { id: string; name: string; rubric_json: Rubric; status: string };
    repo_analyses: Analysis | Analysis[] | null;
    submission_versions: VersionView[];
  };
  scores: ScoreView[];
  interview: { id: string; status: string } | null;
}

export type VerdictOption = 'direct_plagiarism' | 'collusion' | 'starter_template' | 'independent_invention';

export interface IntegrityDecisionRow {
  id: string;
  flag_id: string | null;
  submission_id: string | null;
  verdict: string;
  note: string;
  created_at: string;
  profiles?: { display_name: string } | null;
}

export interface IntegrityMatchRow {
  id: string;
  flag_id: string;
  path_a: string;
  start_a: number;
  end_a: number;
  path_b: string;
  start_b: number;
  end_b: number;
  score: number | string;
}

export interface IntegrityResponse {
  decisions: IntegrityDecisionRow[];
  matches: IntegrityMatchRow[];
}
