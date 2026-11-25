import type { ActivityEntry } from '@skillproof/shared';

export interface CourseRow {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  created_at: string;
  archived_at: string | null;
}

export interface AssignmentRow {
  id: string;
  organization_id: string;
  course_id: string;
  title: string;
  instructions: string;
  learning_goals: string;
  opens_at: string;
  due_at: string;
  status: 'draft' | 'open' | 'judging' | 'review' | 'published';
  mode: 'individual' | 'group';
  group_min: number | null;
  group_max: number | null;
  group_lock_at: string | null;
  max_submissions: number | null;
  interviews_enabled: boolean;
  language: 'en' | 'es';
  starter_repo_url: string | null;
  rubric_json: unknown;
  judging_paused_at: string | null;
  closed_at: string | null;
  published_at: string | null;
  created_at: string;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  organization_id: string;
  student_id: string | null;
  group_id: string | null;
  submitted_by: string | null;
  status: string;
  error: string | null;
  versions_used: number;
  locked_commit_sha: string | null;
  locked_at: string | null;
  activity_json: ActivityEntry[];
  models_used: string[];
  judge_attempts: number;
  next_attempt_at: string | null;
  updated_at: string;
  current_version: {
    description: string;
    video_url: string | null;
    created_at: string;
    repos: { owner: string; name: string; url: string } | null;
  } | null;
}

export interface ScoreRow {
  id: string;
  submission_id: string;
  criterion_key: string;
  ai_score: number | null;
  justification: string;
  evidence_json: string[];
  override_score: number | null;
}

export interface InterviewSummary {
  id: string;
  user_id: string;
  status: string;
  assignment_submission_id: string;
  interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null;
}

export interface GroupView {
  id: string;
  name: string;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  members: {
    user_id: string;
    status: 'invited' | 'accepted' | 'declined';
    display_name: string;
    github_login: string | null;
  }[];
}

export const SUBMISSION_COLUMNS =
  'id, assignment_id, organization_id, student_id, group_id, submitted_by, status, error, versions_used, locked_commit_sha, locked_at, ' +
  'activity_json, models_used, judge_attempts, next_attempt_at, updated_at, ' +
  'current_version:assignment_submission_versions!assignment_submissions_current_version_fk(description, video_url, created_at, repos(owner, name, url))';
