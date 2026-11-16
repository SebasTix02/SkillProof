/** Gemini model ids used across SkillProof. Verified against the model list on 2026-11-16. */
export const MODELS = {
  analysis: 'gemini-3.8-flash',
  summaries: 'gemini-3.5-flash-lite',
  live: 'gemini-3.8-live',
  embedding: 'gemini-embedding-2',
} as const;

/** USD per 1M tokens (standard paid tier, 2026-11). Used only for usage_log estimates. */
export const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-embedding-2': { input: 0.2, output: 0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return Number(((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6));
}
