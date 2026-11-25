import { type EventView, type Feedback, type ScoreView, type VersionView } from '../../lib/types';

export const COCKPIT_PREVIEW = '/images/event-cockpit.webp';

export type EventTab = 'workspace' | 'rubric' | 'leaderboard';

export interface EventResponse {
  event: EventView;
  is_participant: boolean;
  is_manager: boolean;
}

export interface MySubmission {
  submission: {
    id: string;
    team_name: string;
    status: string;
    versions_used: number;
    current_version_id: string;
    locked_commit_sha: string | null;
    submission_versions: VersionView[];
  } | null;
  max_submissions: number | null;
  submissions_left: number | null;
  accepting: boolean;
}

export interface Results {
  published: boolean;
  status: EventView['status'];
  leaderboard?: { rank: number; team_name: string; total: number; mine: boolean }[];
  mine?: {
    id: string;
    team_name: string;
    total: number | null;
    scores: ScoreView[];
    note: string | null;
    ownership: { score: number; confidence: string } | null;
  } | null;
  feedback?: Feedback | null;
  interview?: { id: string; status: string } | null;
}

export function getLifecycleStep(event: EventView, isParticipant: boolean, now: number): 1 | 2 | 3 | 4 {
  if (!isParticipant) return 1;
  if (event.status === 'published') return 4;
  if (event.status === 'judging' || event.status === 'review' || Date.parse(event.submission_deadline) <= now) {
    return 3;
  }
  return 2;
}
