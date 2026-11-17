/** Gemini model ids used across SkillProof. Verified against the model list on 2026-11-16. */
export const MODELS = {
  analysis: 'gemini-3.8-flash',
  summaries: 'gemini-3.5-flash-lite',
  live: 'gemini-3.8-live',
  embedding: 'gemini-embedding-2',
} as const;

/**
 * Backup models, tried in order when a model is overloaded or rate limited (HTTP 429, 500, 503, 504).
 * Verified against the model list on 2026-11-17. Each backup is a stable model of the previous generation.
 */
export const MODEL_FALLBACKS: Record<string, readonly string[]> = {
  'gemini-3.8-flash': ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
  'gemini-3.5-flash-lite': ['gemini-3.1-flash-lite'],
};

/** The model to try first, then its backups. */
export function modelChain(model: string): string[] {
  return [model, ...(MODEL_FALLBACKS[model] ?? [])];
}

/** USD per 1M tokens (standard paid tier, 2026-11). Used only for usage_log estimates. */
export const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-embedding-2': { input: 0.2, output: 0 },
  // gemini-3.6-flash has no published price on the pricing page yet, so its usage is logged with cost 0.
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return Number(((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6));
}
