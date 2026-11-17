/** What the AI did while judging a submission or preparing an interview, shown to users as a timeline. */
export type ActivityKind = 'step' | 'thought' | 'retry' | 'fallback' | 'done' | 'error';

export interface ActivityEntry {
  /** ISO time the entry was written. */
  at: string;
  kind: ActivityKind;
  /** One sentence for people. For "thought", a summary of the model's reasoning written by the model itself. */
  text: string;
  /** The Gemini model involved, when there is one. */
  model?: string | null;
  /** Technical detail shown folded under the entry, like each retry and its error. */
  detail?: string | null;
}

/** Longest thought summary kept per call, so the log stays small. */
export const MAX_THOUGHT_CHARS = 1500;
/** Most entries kept per job. */
export const MAX_ACTIVITY_ENTRIES = 150;
