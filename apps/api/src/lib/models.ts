import { MODELS, MODEL_FALLBACKS, prioritizeStableModels } from '@skillproof/shared';
import { env } from '../env.js';

/**
 * The models SkillProof uses, set by environment variables so a stable or less busy model can be made the main
 * one without a code change. Defaults come from packages/shared/src/models.ts.
 */
const list = (value: string | undefined) => (value ? value.split(',').map((m) => m.trim()).filter(Boolean) : null);

/** Repository map, scoring, interview plans and reports. */
export const analysisModel = () => env().GEMINI_MODEL_ANALYSIS ?? MODELS.analysis;

/** One-line file summaries: a small, cheap model is enough. */
export const summariesModel = () => env().GEMINI_MODEL_SUMMARIES ?? MODELS.summaries;

/** The model first, then its backups, without repeats, always prioritizing stable (GA) models ahead of `-preview` models. */
export function modelChain(model: string): string[] {
  const e = env();
  const defaults = MODEL_FALLBACKS[model] ?? (model === analysisModel() ? MODEL_FALLBACKS[MODELS.analysis] : model === summariesModel() ? MODEL_FALLBACKS[MODELS.summaries] : undefined) ?? [];
  const configured =
    model === analysisModel() ? list(e.GEMINI_FALLBACKS_ANALYSIS) : model === summariesModel() ? list(e.GEMINI_FALLBACKS_SUMMARIES) : null;
  return prioritizeStableModels([model, ...(configured ?? defaults), ...(configured ? defaults : [])]);
}

/** The main models, so pages can tell a backup apart. */
export const primaryModels = () => [...new Set([analysisModel(), summariesModel()])];
