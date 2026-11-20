import { z } from 'zod';

/** Roles an organization can give its members. Students are global and join events themselves. */
export const ORG_ROLES = ['org_owner', 'organizer', 'judge', 'auditor'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const InviteMemberSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  role: z.enum(ORG_ROLES),
});

export const AcceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });

export const ChangeMemberRoleSchema = z.object({ role: z.enum(ORG_ROLES) });

/** Policies under "Security enclave" in organization settings. Unknown keys are dropped. */
export const OrgSettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  settings: z
    .object({
      require_oral_defense: z.boolean().optional(),
      retention_days: z.number().int().min(30).max(3650).optional(),
      allow_judge_overrides: z.boolean().optional(),
    })
    .optional(),
});

export const AssignJudgeSchema = z.object({
  submission_ids: z.array(z.uuid()).min(1).max(500),
  judge_id: z.uuid(),
});

export const JudgeReviewSchema = z.object({
  scores: z
    .array(z.object({ criterion_key: z.string().min(1).max(60), score: z.number().int().min(1).max(10), note: z.string().max(1000).default('') }))
    .max(30),
  note: z.string().max(4000).default(''),
  status: z.enum(['draft', 'submitted']).default('draft'),
});
export type JudgeReviewInput = z.infer<typeof JudgeReviewSchema>;

/** Verdicts on a flagged pair (similarity forensics) and on one submission (course mode). */
export const PAIR_VERDICTS = ['direct_plagiarism', 'collusion', 'starter_template', 'independent_invention'] as const;
export const SUBMISSION_VERDICTS = ['clear', 'live_defense', 'code_of_conduct'] as const;

export const IntegrityDecisionSchema = z.union([
  z.object({ flag_id: z.uuid(), verdict: z.enum(PAIR_VERDICTS), note: z.string().max(4000).default('') }),
  z.object({ submission_id: z.uuid(), verdict: z.enum(SUBMISSION_VERDICTS), note: z.string().max(4000).default('') }),
  // Course assignments
  z.object({ assignment_flag_id: z.uuid(), verdict: z.enum(PAIR_VERDICTS), note: z.string().max(4000).default('') }),
  z.object({ assignment_submission_id: z.uuid(), verdict: z.enum(SUBMISSION_VERDICTS), note: z.string().max(4000).default('') }),
]);

export const CreateCourseSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().max(40).default(''),
  term: z.string().max(40).default(''),
  description: z.string().max(2000).default(''),
});

export const CourseMembersSchema = z.object({
  emails: z.array(z.email()).min(1).max(1000),
  role: z.enum(['instructor', 'ta', 'student']).default('student'),
  section: z.string().max(40).default(''),
});
