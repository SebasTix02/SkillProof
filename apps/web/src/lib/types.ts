import type { Rubric } from '@skillproof/shared';

export interface EventView {
  id: string;
  organization_id: string;
  kind: string;
  name: string;
  slug: string;
  description: string;
  starts_at: string;
  submission_deadline: string;
  visibility: 'public' | 'code' | 'invite';
  interviews_enabled: boolean;
  max_submissions: number | null;
  rubric_json: Rubric;
  status: 'draft' | 'open' | 'judging' | 'review' | 'published';
  closed_at: string | null;
  published_at: string | null;
  organization: { name: string; slug: string } | null;
}

export interface ScoreView {
  id: string;
  submission_id: string;
  criterion_key: string;
  ai_score: number | null;
  justification: string;
  evidence_json: string[];
  override_score: number | null;
}

export interface RepoRef {
  owner: string;
  name: string;
  url: string;
  is_fork?: boolean;
  fork_parent?: string | null;
}

export interface VersionView {
  id: string;
  version_no: number;
  description: string;
  video_url: string | null;
  slides_url: string | null;
  created_at: string;
  repos: RepoRef;
}

export interface Feedback {
  strengths_json: string[];
  improvements_json: { what: string; where: string; next_step: string }[];
}

export const STATUS_LABEL: Record<EventView['status'], string> = {
  draft: 'Draft',
  open: 'Open',
  judging: 'Judging',
  review: 'In review',
  published: 'Results published',
};

export const VISIBILITY_LABEL: Record<EventView['visibility'], string> = {
  public: 'Public',
  code: 'Access code',
  invite: 'Invite only',
};
