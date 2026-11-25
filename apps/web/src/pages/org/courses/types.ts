import { lazy, tr } from '../../../i18n';
import type { AssignmentView } from '../../../lib/courses';

export interface CourseSummary {
  id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  member_count: number;
  assignment_count: number;
  archived_at: string | null;
}

export interface Member {
  user_id: string;
  role: 'instructor' | 'ta' | 'student';
  section: string;
  created_at: string;
  profiles: { display_name: string; github_login: string | null } | null;
}

export interface CourseDetail {
  course: CourseSummary & { organization_id: string; created_at: string };
  assignments: AssignmentView[];
  members: Member[];
  access: 'staff' | 'student' | 'ta';
}

export interface GradeCell {
  submission_id: string;
  status: string;
  total: number | null;
  grade: number | null;
  adjusted: boolean;
  group: string | null;
}

export interface GradebookResponse {
  assignments: AssignmentView[];
  students: { user_id: string; display_name: string; github_login: string | null; section: string; grades: Record<string, GradeCell> }[];
}

export const ROLE_LABEL: Record<Member['role'], string> = lazy(() => ({
  instructor: tr('Instructor'),
  ta: tr('TA'),
  student: tr('Student'),
}));

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
