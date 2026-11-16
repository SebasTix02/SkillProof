import { z } from 'zod';

export const CriterionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(40),
  name: z.string().min(1).max(60),
  description: z.string().max(500),
  weight: z.number().positive().max(100),
  anchors: z.object({ low: z.string(), mid: z.string(), high: z.string() }),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const RubricSchema = z
  .array(CriterionSchema)
  .min(1)
  .max(12)
  .refine((r) => new Set(r.map((c) => c.key)).size === r.length, 'Criterion keys must be unique');
export type Rubric = z.infer<typeof RubricSchema>;

const c = (key: string, name: string, weight: number, description: string, low: string, mid: string, high: string): Criterion => ({
  key,
  name,
  weight,
  description,
  anchors: { low, mid, high },
});

export const DEFAULT_RUBRIC: Rubric = [
  c('innovation', 'Innovation', 20, 'How original the idea and approach are.',
    'A copy of a common tutorial project.', 'A known idea with one fresh angle.', 'A new approach to a problem few have tackled.'),
  c('technical_depth', 'Technical Depth', 20, 'Difficulty and soundness of what was actually built.',
    'Mostly boilerplate or generated scaffolding.', 'Solid use of standard tools with some custom logic.', 'Non-trivial architecture or algorithms, well executed.'),
  c('code_quality', 'Code Quality', 15, 'Readability, structure, error handling, tests.',
    'Hard to follow, no error handling.', 'Reasonably organised, partial error handling.', 'Clean modules, tests, thoughtful error handling.'),
  c('completeness', 'Completeness', 15, 'How much of the promised product works end to end.',
    'Only a mock-up or a single screen.', 'Core flow works with gaps.', 'The full flow works and is deployable.'),
  c('problem_fit', 'Problem Fit', 10, 'Whether it solves a real problem for real users.',
    'No clear user or problem.', 'A real problem, partial solution.', 'A clear user, a real pain, a convincing solution.'),
  c('demo', 'Demo', 10, 'What the demo video shows actually working.',
    'No demo, or slides only.', 'Demo shows the main flow with rough edges.', 'Clear demo of a working product.'),
  c('pitch', 'Pitch', 10, 'Clarity of the story: problem, solution, why it matters.',
    'Confusing or missing.', 'Understandable but generic.', 'Clear, specific and convincing.'),
];

export interface CriterionScore {
  criterion_key: string;
  ai_score: number | null;
  override_score: number | null;
}

/** Weighted total on a 0-100 scale. Overrides win over AI scores. Unscored criteria are left out. */
export function weightedTotal(rubric: Rubric, scores: CriterionScore[]): number | null {
  const byKey = new Map(scores.map((s) => [s.criterion_key, s]));
  let sum = 0;
  let weight = 0;
  for (const crit of rubric) {
    const s = byKey.get(crit.key);
    const value = s?.override_score ?? s?.ai_score;
    if (value == null) continue;
    sum += value * crit.weight;
    weight += crit.weight;
  }
  if (weight === 0) return null;
  return Math.round((sum / weight) * 100) / 10;
}
