import { z } from 'zod';

export const ScoreResultSchema = z.object({
  scores: z.array(
    z.object({
      criterion_key: z.string(),
      score: z.number().int().min(1).max(10).nullable().describe('null only when there is no evidence at all to judge this criterion'),
      justification: z.string().describe('Two sentences, specific to this project'),
      evidence: z.array(z.string()).describe('File paths or video timestamps (mm:ss) that back the score'),
    }),
  ),
  feedback: z.object({
    strengths: z.array(z.string()).max(4),
    improvements: z
      .array(z.object({ what: z.string(), where: z.string(), next_step: z.string() }))
      .max(3),
  }),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
