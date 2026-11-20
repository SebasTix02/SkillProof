import { z } from 'zod';
import { GITHUB_REPO_URL, YOUTUBE_URL } from './events.js';
import { RubricSchema } from './rubric.js';

/**
 * Course assignments (20261119000001): their own product, apart from events. Access is the course roster; an
 * assignment is individual or group (students form groups by inviting classmates; staff can move people).
 */

export const ASSIGNMENT_MODES = ['individual', 'group'] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

/** Default group size when the teacher does not change it. */
export const DEFAULT_GROUP_MIN = 2;
export const DEFAULT_GROUP_MAX = 4;

const assignmentFields = {
  title: z.string().trim().min(3).max(120),
  instructions: z.string().max(4000).default(''),
  learning_goals: z.string().max(2000).default(''),
  opens_at: z.iso.datetime({ offset: true }),
  due_at: z.iso.datetime({ offset: true }),
  mode: z.enum(ASSIGNMENT_MODES).default('individual'),
  group_min: z.number().int().min(1).max(20).nullable().default(null),
  group_max: z.number().int().min(1).max(20).nullable().default(null),
  /** When groups close; null = the due date. */
  group_lock_at: z.iso.datetime({ offset: true }).nullable().default(null),
  max_submissions: z.number().int().min(1).max(100).nullable().default(null),
  interviews_enabled: z.boolean().default(false),
  rubric: RubricSchema,
};

/** Fills the group size for group assignments and clears it for individual ones. */
function normalizeGroup<T extends { mode: AssignmentMode; group_min: number | null; group_max: number | null; group_lock_at: string | null }>(a: T): T {
  if (a.mode === 'individual') return { ...a, group_min: null, group_max: null, group_lock_at: null };
  return { ...a, group_min: a.group_min ?? DEFAULT_GROUP_MIN, group_max: a.group_max ?? Math.max(DEFAULT_GROUP_MAX, a.group_min ?? DEFAULT_GROUP_MIN) };
}

export const CreateAssignmentSchema = z
  .object({ ...assignmentFields, publish: z.boolean().default(true).describe('Open it to the roster right away instead of leaving it as a draft') })
  .transform(normalizeGroup)
  .refine((a) => Date.parse(a.due_at) > Date.parse(a.opens_at), { message: 'The due date must be after it opens', path: ['due_at'] })
  .refine((a) => a.mode === 'individual' || (a.group_min ?? 0) <= (a.group_max ?? 0), { message: 'The minimum group size cannot be above the maximum', path: ['group_max'] })
  .refine((a) => !a.group_lock_at || Date.parse(a.group_lock_at) <= Date.parse(a.due_at), { message: 'Groups must close before the due date', path: ['group_lock_at'] });
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>;

/**
 * What staff can change after creating an assignment. The mode and the group sizes stay as they were once students
 * may have formed groups; the dates are checked again by the database.
 */
export const UpdateAssignmentSchema = z
  .object({
    title: assignmentFields.title,
    instructions: z.string().max(4000),
    learning_goals: z.string().max(2000),
    opens_at: assignmentFields.opens_at,
    due_at: assignmentFields.due_at,
    group_lock_at: z.iso.datetime({ offset: true }).nullable(),
    max_submissions: z.number().int().min(1).max(100).nullable(),
    interviews_enabled: z.boolean(),
    rubric: RubricSchema,
  })
  .partial()
  .refine((a) => !a.opens_at || !a.due_at || Date.parse(a.due_at) > Date.parse(a.opens_at), { message: 'The due date must be after it opens', path: ['due_at'] });
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentSchema>;

/** A student's submission: no team name. */
export const AssignmentSubmitSchema = z.object({
  repo_url: z.string().regex(GITHUB_REPO_URL, 'Use a public GitHub repository URL, like https://github.com/owner/repo'),
  description: z.string().max(4000).default(''),
  video_url: z.string().regex(YOUTUBE_URL, 'Use a public YouTube link').nullable().optional(),
});
export type AssignmentSubmitInput = z.infer<typeof AssignmentSubmitSchema>;

export const CreateGroupSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const GroupInviteSchema = z.object({ user_id: z.uuid() });
export const GroupRespondSchema = z.object({ accept: z.boolean() });
/** Staff create a group (optionally with members) or place a student in one. */
export const StaffGroupSchema = z.object({ name: z.string().trim().min(1).max(80), member_ids: z.array(z.uuid()).max(20).default([]) });
export const PlaceInGroupSchema = z.object({ user_id: z.uuid() });

/** In a group assignment everyone gets the group grade; staff may set another total for one student. */
export const GradeAdjustmentSchema = z.object({
  adjusted_total: z.number().min(0).max(10),
  note: z.string().max(2000).default(''),
});

/** Readable messages for the errors the database functions raise. */
export const COURSE_ERRORS: Record<string, string> = {
  assignment_not_found: 'Assignment not found.',
  not_on_roster: 'Only students on the course roster can do that.',
  assignment_closed: 'This assignment is closed for submissions.',
  assignment_not_started: 'This assignment has not opened yet.',
  no_group: 'Join or create a group first: this is a group assignment.',
  group_too_small: 'Your group is too small to submit yet. Invite more classmates.',
  group_full: 'This group is already full.',
  groups_closed: 'Groups are closed for this assignment.',
  already_in_group: 'That student is already in a group for this assignment.',
  not_in_group: 'Only members of the group can invite.',
  no_invitation: 'There is no pending invitation for you in this group.',
  not_a_group_assignment: 'This is an individual assignment.',
  group_not_found: 'Group not found.',
  submission_limit_reached: 'You have used all the versions this assignment allows.',
};
