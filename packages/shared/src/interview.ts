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
  /** "system" marks what the app did, like the candidate asking to skip a question. */
  role: z.enum(['interviewer', 'candidate', 'system']),
  text: z.string().max(8000),
  at_ms: z.number().int().min(0),
  question_id: z.string().nullable().optional(),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntrySchema>;

/** A moment the candidate left the interview: full screen exited, tab hidden or window blurred. */
export const FocusEventSchema = z.object({
  type: z.enum(['fullscreen_exit', 'tab_hidden', 'window_blur', 'fullscreen_unsupported']),
  at_ms: z.number().int().min(0),
  duration_ms: z.number().int().min(0).max(3_600_000),
});
export type FocusEvent = z.infer<typeof FocusEventSchema>;

export const FinishInterviewSchema = z.object({
  transcript: z.array(TranscriptEntrySchema).max(400),
  duration_s: z.number().int().min(0).max(1800),
  focus_events: z.array(FocusEventSchema).max(200).default([]),
});

/** "Left the interview window 2 times (total 14 s)", or null when it never happened. */
export function describeFocusEvents(events: FocusEvent[]): string | null {
  const away = events.filter((e) => e.type !== 'fullscreen_unsupported');
  const unsupported = events.some((e) => e.type === 'fullscreen_unsupported');
  const parts: string[] = [];
  if (away.length) {
    const total = Math.round(away.reduce((n, e) => n + e.duration_ms, 0) / 1000);
    parts.push(`Left the interview window ${away.length} time${away.length === 1 ? '' : 's'} (total ${total} s)`);
  }
  if (unsupported) parts.push('Full screen was not available in this browser');
  return parts.length ? parts.join('. ') + '.' : null;
}

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
  answers: z
    .array(
      z.object({
        question_id: z.string(),
        covered: z.array(z.string()).describe('Expected points the candidate made, copied from the answer key'),
        missed: z.array(z.string()).describe('Expected points the candidate did not make, copied from the answer key'),
      }),
    )
    .default([])
    .describe('One entry per planned question, asked or not'),
});
export type InterviewReport = z.infer<typeof InterviewReportSchema>;

export const INTERVIEW_SECONDS = 180;
