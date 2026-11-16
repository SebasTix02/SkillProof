import { z } from 'zod';

export const QuestionPlanSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['why', 'explain', 'extend', 'failure']),
        question: z.string().describe('The question, as the interviewer would say it aloud'),
        path: z.string(),
        start_line: z.number().int().min(1),
        end_line: z.number().int().min(1),
        expected_points: z.array(z.string()).describe('Key points a real author would mention. Never shown to the candidate.'),
        skill: z.string().describe('The skill this question verifies, e.g. "React state management"'),
      }),
    )
    .min(3)
    .max(6),
});
export type QuestionPlan = z.infer<typeof QuestionPlanSchema>;
export type PlannedQuestion = QuestionPlan['questions'][number];

/** What the browser is allowed to see: no expected points. */
export type PublicQuestion = Omit<PlannedQuestion, 'expected_points'> & { snippet: string };

export const TranscriptEntrySchema = z.object({
  role: z.enum(['interviewer', 'candidate']),
  text: z.string().max(8000),
  at_ms: z.number().int().min(0),
  question_id: z.string().nullable().optional(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

export const FinishInterviewSchema = z.object({
  transcript: z.array(TranscriptEntrySchema).max(400),
  duration_s: z.number().int().min(0).max(1800),
});

export const InterviewReportSchema = z.object({
  skills: z.array(
    z.object({
      skill: z.string(),
      level: z.enum(['not_shown', 'basic', 'solid', 'strong']),
      evidence_quote: z.string().describe('A short verbatim quote from the candidate that supports the level, or empty'),
    }),
  ),
  ownership_score: z.number().int().min(0).max(100).describe('How convincingly the candidate showed they understand and wrote this code'),
  confidence: z.enum(['low', 'medium', 'high']).describe('Low when the candidate said too little to judge'),
  summary: z.string().describe('Three sentences a recruiter can read'),
});
export type InterviewReport = z.infer<typeof InterviewReportSchema>;

export const INTERVIEW_SECONDS = 180;
