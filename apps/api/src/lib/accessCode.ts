import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Access codes are stored as salted scrypt hashes, never as text. */
export function hashAccessCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code.normalize('NFKC'), salt, 32);
  return ['scrypt', salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyAccessCode(code: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(code.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Bounded in-memory sliding-window limiter: prunes expired keys so long-lived Cloud Run instances never leak memory. */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 4096,
  ) {}

  get size(): number {
    return this.hits.size;
  }

  private prune(now: number): void {
    for (const [k, times] of this.hits) {
      const active = times.filter((t) => now - t < this.windowMs);
      if (active.length === 0) this.hits.delete(k);
      else if (active.length !== times.length) this.hits.set(k, active);
    }
    while (this.hits.size >= this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }

  allow(key: string, now = Date.now()): boolean {
    if (!this.hits.has(key) && this.hits.size >= this.maxKeys) this.prune(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    const ok = recent.length < this.max;
    if (ok) recent.push(now);
    // Move active key to the end of Map insertion order (LRU) so eviction drops the stalest key first.
    this.hits.delete(key);
    if (recent.length > 0) this.hits.set(key, recent);
    return ok;
  }
}
