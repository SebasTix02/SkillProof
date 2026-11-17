/**
 * Keeps SkillProof from flooding Gemini, and from waiting on a model that is busy.
 *
 * - Limiter: at most N model calls at a time in this process, with a minimum gap between the start of two calls.
 * - Backoff: one short retry on the same model (or the wait the API asks for), then switch. A "high demand" 503
 *   rarely clears within seconds, so a backup answers sooner than waiting.
 * - Model health: a model that failed is skipped for 3, then 10, then 30 minutes. When that time is up, one
 *   probe call is let through (half-open); if it fails the pause grows, if it works the model is healthy again.
 *   Models that failed often in the last minutes are tried after their backups. The state is kept in memory and
 *   in the ai_model_health table, so every server instance shares it.
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

/** Waits before each retry on the same model. One retry: after that, a backup model is faster. */
export const BACKOFF_MS = [2_000];
/** Longest wait accepted from a Retry-After hint. Longer than this, switching model is faster. */
export const MAX_HINTED_WAIT_MS = 8_000;

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

/** How long a model rests after its 1st, 2nd and 3rd failure in a row. */
export const PAUSE_MS = [3 * 60_000, 10 * 60_000, 30 * 60_000];
/** Failures and successes are counted over this window to rank models. */
export const HEALTH_WINDOW_MS = 15 * 60_000;
/** A probe that never reports back frees the half-open slot after this long. */
const PROBE_TIMEOUT_MS = 3 * 60_000;

export interface ModelState {
  model: string;
  /** Skipped until this time (ms). 0 when available. */
  until: number;
  /** Failures in a row, which decide the next pause. */
  level: number;
  failures: number;
  successes: number;
  windowStart: number;
}

export interface HealthStore {
  load(): Promise<ModelState[]>;
  save(state: ModelState, reason: string): Promise<void>;
}

export interface ModelOrder {
  /** Models to try, best first. */
  models: string[];
  /** Models left out because they are resting. */
  skipped: string[];
  /** A model let through as the one probe after its pause. */
  probe: string | null;
}

export class ModelHealth {
  private states = new Map<string, ModelState>();
  private probing = new Map<string, number>();
  private loadedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly store: HealthStore | null,
    private readonly now: () => number = Date.now,
    /** How often to read what other instances wrote. */
    private readonly refreshMs = 15_000,
  ) {}

  private state(model: string): ModelState {
    let s = this.states.get(model);
    if (!s) {
      s = { model, until: 0, level: 0, failures: 0, successes: 0, windowStart: this.now() };
      this.states.set(model, s);
    }
    if (this.now() - s.windowStart > HEALTH_WINDOW_MS) Object.assign(s, { failures: 0, successes: 0, windowStart: this.now() });
    return s;
  }

  private async refresh(): Promise<void> {
    if (!this.store || this.now() - this.loadedAt < this.refreshMs) return;
    this.loadedAt = this.now();
    try {
      for (const remote of await this.store.load()) {
        const local = this.state(remote.model);
        // Keep whichever view is more cautious: a pause seen by another instance applies here too.
        if (remote.until > local.until) Object.assign(local, { until: remote.until, level: Math.max(local.level, remote.level) });
        if (remote.windowStart >= local.windowStart) {
          local.failures = Math.max(local.failures, remote.failures);
          local.successes = Math.max(local.successes, remote.successes);
        }
      }
    } catch (err) {
      console.warn('Reading model health failed:', err instanceof Error ? err.message : err);
    }
  }

  /** Until when a model rests, or null when it may be called. */
  restingUntil(model: string): number | null {
    const s = this.states.get(model);
    return s && s.until > this.now() ? s.until : null;
  }

  /** Recent failure rate, 0 to 1, or 0 when there is too little to tell. */
  failureRate(model: string): number {
    const s = this.state(model);
    const total = s.failures + s.successes;
    return total >= 3 ? s.failures / total : 0;
  }

  /**
   * The order to try models in. Resting models are left out; a model whose pause just ended is let through as a
   * single probe; models that failed often lately go after the healthy ones. When every model rests, all are
   * tried anyway, since one more attempt beats giving up.
   */
  async order(chain: string[]): Promise<ModelOrder> {
    await this.refresh();
    const now = this.now();
    const ready: string[] = [];
    const skipped: string[] = [];
    let probe: string | null = null;
    for (const model of chain) {
      const s = this.state(model);
      if (s.until > now) {
        skipped.push(model);
        continue;
      }
      if (s.level > 0) {
        // Half-open: only one call at a time may test a model that just came back.
        const since = this.probing.get(model);
        if (since !== undefined && now - since < PROBE_TIMEOUT_MS) {
          skipped.push(model);
          continue;
        }
        this.probing.set(model, now);
        probe ??= model;
      }
      ready.push(model);
    }
    if (ready.length === 0) return { models: chain, skipped: [], probe: null };
    const rank = (m: string) => (this.failureRate(m) > 0.5 ? 1 : 0);
    const models = [...ready].sort((a, b) => rank(a) - rank(b) || ready.indexOf(a) - ready.indexOf(b));
    return { models, skipped, probe };
  }

  /** The model failed even after its retry: it rests, longer each time in a row. */
  async failure(model: string, reason: string): Promise<number> {
    const s = this.state(model);
    s.failures++;
    s.level = Math.min(s.level + 1, PAUSE_MS.length);
    s.until = this.now() + PAUSE_MS[s.level - 1]!;
    this.probing.delete(model);
    await this.store?.save({ ...s }, reason).catch((err: unknown) => console.warn('Saving model health failed:', err));
    return s.until;
  }

  /** The model answered: it is healthy again. */
  async success(model: string): Promise<void> {
    const s = this.state(model);
    const changed = s.level > 0 || s.until > 0;
    s.successes++;
    Object.assign(s, { level: 0, until: 0 });
    this.probing.delete(model);
    // Only a change of state is written, so a healthy model costs no database write per call.
    if (changed) await this.store?.save({ ...s }, 'answered').catch(() => undefined);
  }
}
