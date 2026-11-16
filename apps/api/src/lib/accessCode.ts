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

/** Small in-memory limiter: enough to stop code guessing from one account on one instance. */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    const ok = recent.length < this.max;
    if (ok) recent.push(now);
    this.hits.set(key, recent);
    return ok;
  }
}
