/**
 * The judging engine works on a "contest": an event (hackathon) or a course assignment. Both have submissions with
 * versions, a deadline, a rubric, a status cycle (open → judging → review → published) and a pause flag. This file
 * names, for each kind, the tables and columns the engine touches, so judge.ts, judgeQueue.ts, the scheduler and the
 * controls run the same code for both. The prompt that grades each kind lives in scoringSpecs.ts.
 */
import type { ScoringSpecKey } from './scoringSpecs.js';

export type ContestKind = 'event' | 'assignment';

export interface ContestStore {
  kind: ContestKind;
  /** events | course_assignments */
  contests: 'events' | 'course_assignments';
  /** Column of the submission that points at the contest. */
  contestFk: 'event_id' | 'assignment_id';
  submissions: 'submissions' | 'assignment_submissions';
  scores: 'scores' | 'assignment_scores';
  feedback: 'feedback' | 'assignment_feedback';
  flags: 'similarity_flags' | 'assignment_similarity_flags';
  /** Deadline and start columns of the contest. */
  deadline: 'submission_deadline' | 'due_at';
  start: 'starts_at' | 'opens_at';
  /** The submission's current version, with its repository, as a PostgREST embed. */
  currentVersion: string;
  /** Background job that judges one submission (registered in app.ts). */
  job: 'judge' | 'judge-assignment';
}

export const EVENT_STORE: ContestStore = {
  kind: 'event',
  contests: 'events',
  contestFk: 'event_id',
  submissions: 'submissions',
  scores: 'scores',
  feedback: 'feedback',
  flags: 'similarity_flags',
  deadline: 'submission_deadline',
  start: 'starts_at',
  currentVersion: 'current_version:submission_versions!submissions_current_version_fk(repo_id, description, video_url, repos(*))',
  job: 'judge',
};

export const ASSIGNMENT_STORE: ContestStore = {
  kind: 'assignment',
  contests: 'course_assignments',
  contestFk: 'assignment_id',
  submissions: 'assignment_submissions',
  scores: 'assignment_scores',
  feedback: 'assignment_feedback',
  flags: 'assignment_similarity_flags',
  deadline: 'due_at',
  start: 'opens_at',
  currentVersion:
    'current_version:assignment_submission_versions!assignment_submissions_current_version_fk(repo_id, description, video_url, repos(*))',
  job: 'judge-assignment',
};

export const STORES: ContestStore[] = [EVENT_STORE, ASSIGNMENT_STORE];

export const storeFor = (kind: ContestKind): ContestStore => (kind === 'event' ? EVENT_STORE : ASSIGNMENT_STORE);

/** Which grading prompt a submission gets. */
export function scoringSpecFor(kind: ContestKind, mode?: 'individual' | 'group' | null): ScoringSpecKey {
  if (kind === 'event') return 'hackathon';
  return mode === 'group' ? 'course_group' : 'course_individual';
}
