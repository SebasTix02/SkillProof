import type { ActivityEntry } from '@skillproof/shared';
import type { SimilaritySignal } from '../../../components/shared';
import type { EventView, RepoRef, ScoreView } from '../../../lib/types';

export interface ConsoleSubmission {
  id: string;
  team_name: string;
  submitted_by_name: string;
  status: 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';
  error: string | null;
  activity: ActivityEntry[];
  step_count: number;
  judge_attempts: number;
  next_attempt_at: string | null;
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
  signal: SimilaritySignal;
  explanation: string;
}

export interface ConsoleResponse {
  event: EventView;
  participant_count: number;
  submissions: ConsoleSubmission[];
  similarity_flags: Flag[];
}
