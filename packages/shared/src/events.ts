import { z } from 'zod';
import { RubricSchema } from './rubric.js';

export const EVENT_VISIBILITY = ['public', 'code', 'invite'] as const;
export const EVENT_STATUS = ['draft', 'open', 'judging', 'review', 'published'] as const;
export const SUBMISSION_STATUS = ['submitted', 'queued', 'analyzing', 'scored', 'error'] as const;

export const GITHUB_REPO_URL = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
export const YOUTUBE_URL = /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{6,20}(?:[&?].*)?$/;

export function parseGithubUrl(url: string): { owner: string; name: string } | null {
  const m = GITHUB_REPO_URL.exec(url.trim());
  if (!m || !m[1] || !m[2]) return null;
  return { owner: m[1], name: m[2] };
}

export const CreateEventSchema = z
  .object({
    name: z.string().min(3).max(120),
    description: z.string().max(4000).default(''),
    kind: z.enum(['hackathon', 'assignment']).default('hackathon'),
    /** Course of an assignment, in course mode. */
    course_id: z.uuid().nullable().default(null),
    starts_at: z.iso.datetime({ offset: true }),
    submission_deadline: z.iso.datetime({ offset: true }),
    visibility: z.enum(EVENT_VISIBILITY),
    access_code: z.string().min(4).max(64).optional(),
    max_submissions: z.number().int().min(1).max(100).nullable().default(null),
    interviews_enabled: z.boolean().default(false),
    rubric: RubricSchema,
    publish: z.boolean().default(true).describe('Open the event right away instead of leaving it as a draft'),
  })
  .refine((e) => Date.parse(e.submission_deadline) > Date.parse(e.starts_at), {
    message: 'The submission deadline must be after the start',
    path: ['submission_deadline'],
  })
  .refine((e) => e.visibility !== 'code' || !!e.access_code, {
    message: 'An access code is required for this visibility',
    path: ['access_code'],
  });
export type CreateEventInput = z.infer<typeof CreateEventSchema>;

export const JoinEventSchema = z.object({ access_code: z.string().max(64).optional() });

export const SubmitSchema = z.object({
  team_name: z.string().min(1).max(80),
  repo_url: z.string().regex(GITHUB_REPO_URL, 'Use a public GitHub repository URL, like https://github.com/owner/repo'),
  description: z.string().max(4000).default(''),
  video_url: z.string().regex(YOUTUBE_URL, 'Use a public YouTube link').nullable().optional(),
  slides_url: z.url().max(500).nullable().optional(),
});
export type SubmitInput = z.infer<typeof SubmitSchema>;

export const AllowlistSchema = z.object({ emails: z.array(z.email().max(254)).min(1).max(2000) });

export const OverrideScoreSchema = z.object({ override_score: z.number().int().min(1).max(10).nullable() });

export const CreateInterviewSchema = z
  .object({ repo_url: z.string().regex(GITHUB_REPO_URL).optional(), submission_id: z.uuid().optional() })
  .refine((v) => !!v.repo_url !== !!v.submission_id, 'Give either a repo URL or a submission');

/** How many more versions a participant may send. null = unlimited. */
export function submissionsLeft(maxSubmissions: number | null, used: number): number | null {
  if (maxSubmissions == null) return null;
  return Math.max(0, maxSubmissions - used);
}
