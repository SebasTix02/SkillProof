import { AsyncLocalStorage } from 'node:async_hooks';
import { MAX_ACTIVITY_ENTRIES, type ActivityEntry, type ActivityKind } from '@skillproof/shared';
import { db } from './supabase.js';

type Subject = 'submissions' | 'interviews';

/**
 * The timeline of one background job (judging a submission, preparing or evaluating an interview).
 * Entries are written to the row as they happen, so the page that polls the row shows progress live.
 */
export class Activity {
  private entries: ActivityEntry[] = [];
  private models = new Set<string>();
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly table: Subject,
    private readonly id: string,
    /** Whether the model's reasoning summaries may be shown to whoever reads this log. */
    readonly allowThoughts = true,
    /** Entries already saved on the row, to continue the same history instead of starting a new one. */
    previous: ActivityEntry[] = [],
    previousModels: string[] = [],
  ) {
    this.entries = [...previous];
    this.models = new Set(previousModels);
  }

  /** Adds an entry and saves it. Failing to save the log never fails the job. */
  add(kind: ActivityKind, text: string, model?: string | null): Promise<void> {
    this.entries.push({ at: new Date().toISOString(), kind, text, model: model ?? null });
    if (this.entries.length > MAX_ACTIVITY_ENTRIES) this.entries.splice(1, this.entries.length - MAX_ACTIVITY_ENTRIES);
    return this.save();
  }

  /**
   * Adds one entry that can be rewritten later, so a run of retries and model switches shows as a single line
   * that changes as things happen, instead of one line per attempt.
   */
  live(kind: ActivityKind, text: string, model?: string | null, detail?: string | null): { update: (kind: ActivityKind, text: string, model?: string | null, detail?: string | null) => Promise<void> } {
    const entry: ActivityEntry = { at: new Date().toISOString(), kind, text, model: model ?? null, detail: detail ?? null };
    this.entries.push(entry);
    if (this.entries.length > MAX_ACTIVITY_ENTRIES) this.entries.splice(1, this.entries.length - MAX_ACTIVITY_ENTRIES);
    void this.save();
    return {
      update: (k, t, m, d) => {
        Object.assign(entry, { kind: k, text: t, model: m ?? entry.model, detail: d ?? entry.detail });
        return this.save();
      },
    };
  }

  step(text: string, model?: string): Promise<void> {
    return this.add('step', text, model);
  }

  /** Records that a model answered a call, so the page can say which model produced the result. */
  usedModel(model: string): Promise<void> {
    if (this.models.has(model)) return Promise.resolve();
    this.models.add(model);
    return this.save();
  }

  private save(): Promise<void> {
    const entries = this.entries.map((e) => ({ ...e }));
    const models = [...this.models];
    // Writes are chained so an older snapshot never overwrites a newer one.
    this.writing = this.writing.then(async () => {
      const { error } = await db().from(this.table).update({ activity_json: entries, models_used: models }).eq('id', this.id);
      if (error) console.warn(`Saving activity for ${this.table}/${this.id} failed:`, error.message);
    });
    return this.writing;
  }
}

const store = new AsyncLocalStorage<Activity>();

/** Runs a job with an activity log that code deeper in the call stack (like the Gemini wrapper) can write to. */
export function withActivity<T>(activity: Activity, fn: () => Promise<T>): Promise<T> {
  return store.run(activity, fn);
}

export function currentActivity(): Activity | undefined {
  return store.getStore();
}
