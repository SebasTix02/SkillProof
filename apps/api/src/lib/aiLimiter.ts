/**
 * Keeps SkillProof from flooding Gemini.
 *
 * - Limiter: at most N model calls at a time in this process, with a minimum gap between the start of two calls.
 * - Backoff: growing waits with jitter between retries, or the wait the API itself asks for.
 * - Circuit breaker: a model that stayed overloaded is skipped for a few minutes and its backup is used directly.
 *   The state is kept in memory and in the ai_model_health table, so other server instances skip it too.
 */

export class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly concurrency: () => number,
    private readonly minGapMs: () => number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  get running(): number {
    return this.active;
  }

  get queued(): number {
    return this.waiting.length;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency()) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      // Each call gets a start slot at least minGap after the previous one.
      const now = this.now();
      const start = Math.max(now, this.lastStart + this.minGapMs());
      this.lastStart = start;
      if (start > now) await this.sleep(start - now);
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** Waits before retry 1, 2, 3 on the same model. */
export const BACKOFF_MS = [2_000, 5_000, 12_000];
/** Longest wait accepted from a Retry-After hint. Longer than this, switching model is faster. */
export const MAX_HINTED_WAIT_MS = 20_000;

/**
 * How long to wait before retry number `attempt` (0-based): the server's own hint when it gives one,
 * otherwise the backoff table with ±25% jitter so many callers do not retry in the same instant.
 * Returns null when it is better to switch to another model now.
 */
export function backoffMs(attempt: number, hintMs: number | null, random: () => number = Math.random): number | null {
  if (attempt >= BACKOFF_MS.length) return null;
  if (hintMs != null) return hintMs <= MAX_HINTED_WAIT_MS ? hintMs : null;
  const base = BACKOFF_MS[attempt]!;
  return Math.round(base * (0.75 + random() * 0.5));
}

/** Reads a wait hint from a Gemini error: RetryInfo "retryDelay": "17s", or "retry in 12.5s" in the message. */
export function retryHintMs(err: unknown): number | null {
  const text = err instanceof Error ? err.message : String(err);
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text) ?? /retry in (\d+(?:\.\d+)?)\s*s/i.exec(text);
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/** How long a model is skipped after it stayed overloaded. */
export const BREAKER_OPEN_MS = 3 * 60_000;

export interface BreakerStore {
  load(): Promise<{ model: string; until: number }[]>;
  save(model: string, until: number, reason: string): Promise<void>;
}

export class CircuitBreaker {
  private openUntil = new Map<string, number>();
  private loadedAt = 0;

  constructor(
    private readonly store: BreakerStore | null,
    private readonly now: () => number = Date.now,
    /** How often to read what other instances wrote. */
    private readonly refreshMs = 15_000,
  ) {}

  private async refresh(): Promise<void> {
    if (!this.store || this.now() - this.loadedAt < this.refreshMs) return;
    this.loadedAt = this.now();
    try {
      for (const { model, until } of await this.store.load()) {
        if (until > (this.openUntil.get(model) ?? 0)) this.openUntil.set(model, until);
      }
    } catch (err) {
      console.warn('Reading model health failed:', err instanceof Error ? err.message : err);
    }
  }

  async isOpen(model: string): Promise<boolean> {
    await this.refresh();
    return (this.openUntil.get(model) ?? 0) > this.now();
  }

  /** Until when a model is skipped, or null when it is available. */
  openUntilTime(model: string): number | null {
    const until = this.openUntil.get(model) ?? 0;
    return until > this.now() ? until : null;
  }

  async trip(model: string, reason: string): Promise<void> {
    const until = this.now() + BREAKER_OPEN_MS;
    this.openUntil.set(model, until);
    await this.store?.save(model, until, reason).catch((err: unknown) => console.warn('Saving model health failed:', err));
  }

  /** A model that answered is healthy again, here and for the other instances. */
  async reset(model: string): Promise<void> {
    if (!this.openUntil.has(model)) return;
    this.openUntil.delete(model);
    await this.store?.save(model, 0, 'answered').catch(() => undefined);
  }

  /**
   * The order to try models in: the ones not skipped first, in their order. When every model is skipped,
   * all of them are tried anyway, since waiting is worse than one more attempt.
   */
  async order(chain: string[]): Promise<{ models: string[]; skipped: string[] }> {
    const open: string[] = [];
    const closed: string[] = [];
    for (const m of chain) ((await this.isOpen(m)) ? open : closed).push(m);
    return closed.length ? { models: closed, skipped: open } : { models: chain, skipped: [] };
  }
}
