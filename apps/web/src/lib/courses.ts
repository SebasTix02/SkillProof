import { lazy, tr } from '../i18n';
/** Types and words for courses and their assignments (their own product, apart from events). */
import type { ActivityEntry, Rubric } from '@skillproof/shared';
import type { EventView, RepoRef, ScoreView } from './types';

export type AssignmentStatus = EventView['status'];
export type AssignmentMode = 'individual' | 'group';
export type SubmissionStatus = 'submitted' | 'queued' | 'analyzing' | 'scored' | 'error' | 'paused' | 'canceled';

export interface AssignmentView {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  learning_goals: string;
  opens_at: string;
  due_at: string;
  status: AssignmentStatus;
  mode: AssignmentMode;
  group_min: number | null;
  group_max: number | null;
  group_lock_at: string | null;
  /** When groups stop changing: group_lock_at or the due date. Null for individual assignments. */
  groups_close_at: string | null;
  max_submissions: number | null;
  interviews_enabled: boolean;
  rubric_json: Rubric;
  judging_paused_at: string | null;
  submission_count: number;
  student_count: number;
}

export interface GroupMember {
  user_id: string;
  status: 'invited' | 'accepted' | 'declined';
  display_name: string;
  github_login: string | null;
}

export interface GroupView {
  id: string;
  name: string;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  members: GroupMember[];
}

export interface Person {
  user_id: string;
  display_name: string;
  github_login: string | null;
  section?: string;
}

export interface CurrentVersion {
  description: string;
  video_url: string | null;
  created_at: string;
  repos: RepoRef | null;
}

export interface AssignmentSubmissionRow {
  id: string;
  student_id: string | null;
  group_id: string | null;
  label: string;
  members: GroupMember[] | null;
  submitted_by_name: string;
  status: SubmissionStatus;
  error: string | null;
  versions_used: number;
  locked_commit_sha: string | null;
  locked_at: string | null;
  activity: ActivityEntry[];
  models_used: string[];
  judge_attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
  current_version: CurrentVersion | null;
  scores: ScoreView[];
  total: number | null;
  interviews: { id: string; user_id: string; status: string; ownership: number | null }[];
  ownership: { score: number; confidence: string } | null;
}

export interface SimilarityFlag {
  id: string;
  submission_a: string;
  submission_b: string;
  signal: 'same_repo' | 'same_fork_parent' | 'identical_files' | 'embedding';
  score: number;
  explanation: string;
}

export interface AssignmentConsoleResponse {
  assignment: AssignmentView;
  course: { id: string; name: string; code: string };
  rubric: Rubric;
  submissions: AssignmentSubmissionRow[];
  groups: GroupView[];
  ungrouped: Person[];
  missing: Person[];
  similarity_flags: SimilarityFlag[];
  primary_models: string[];
}

export const MODE_LABEL: Record<AssignmentMode, string> = lazy(() => ({ individual: tr('Individual'), group: tr('Group') }));

/** "Groups of 2–4", "Pairs", "Groups of 3". */
export function groupSizeLabel(a: { mode: AssignmentMode; group_min: number | null; group_max: number | null }): string {
  if (a.mode !== 'group' || a.group_min == null || a.group_max == null) return tr('Individual');
  if (a.group_min === 2 && a.group_max === 2) return tr('Pairs');
  if (a.group_min === a.group_max) return tr('Groups of {n}', { n: a.group_min });
  return tr('Groups of {min}–{max}', { min: a.group_min, max: a.group_max });
}

export const COURSE_STATUS_TONE: Record<AssignmentStatus, 'neutral' | 'good' | 'warn' | 'accent'> = {
  draft: 'neutral',
  open: 'good',
  judging: 'warn',
  review: 'warn',
  published: 'accent',
};

/** The datetime-local value of a date in the browser's time zone. */
export function localInput(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/** What a student should do next on one assignment. */
export function nextStep(
  a: { status: AssignmentStatus; due_at: string; mode?: AssignmentMode; my_submission: { status: string } | null },
  now = Date.now(),
): { key: 'results' | 'missed' | 'submitted' | 'todo' | 'grading'; label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'accent' } {
  if (a.status === 'published')
    return a.my_submission ? { key: 'results', label: tr('Results ready'), tone: 'accent' } : { key: 'missed', label: tr('Missed'), tone: 'bad' };
  if (a.status === 'open' && Date.parse(a.due_at) > now)
    return a.my_submission ? { key: 'submitted', label: tr('Submitted'), tone: 'good' } : { key: 'todo', label: tr('To do'), tone: 'warn' };
  if (!a.my_submission) return { key: 'missed', label: tr('Missed'), tone: 'bad' };
  return { key: 'grading', label: tr('Being graded'), tone: 'neutral' };
}
