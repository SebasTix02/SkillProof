import { describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS, BREAKER_OPEN_MS, CircuitBreaker, Limiter, backoffMs, retryHintMs } from './lib/aiLimiter.js';
import { blobSha, outlineFile, renderCompact, splitByBudget } from './engine/files.js';

const file = (path: string, text: string) => ({ path, text, tokens: Math.ceil(text.length / 3.5) });

describe('Gemini limiter', () => {
  it('never runs more calls at once than allowed', async () => {
    const limiter = new Limiter(() => 2, () => 0);
    let running = 0;
    let peak = 0;
    const task = () =>
      limiter.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      });
    await Promise.all(Array.from({ length: 7 }, task));
    expect(peak).toBe(2);
  });

  it('spaces the start of calls by the minimum gap', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new Limiter(
      () => 5,
      () => 400,
      () => clock,
      async (ms) => {
        waits.push(ms);
      },
    );
    await Promise.all([limiter.run(async () => 1), limiter.run(async () => 2), limiter.run(async () => 3)]);
    expect(waits).toEqual([400, 800]);
  });
});

describe('backoff', () => {
  it('waits longer each time, with jitter, then gives up', () => {
    expect(backoffMs(0, null, () => 0.5)).toBe(BACKOFF_MS[0]);
    expect(backoffMs(1, null, () => 0)).toBe(BACKOFF_MS[1]! * 0.75);
    expect(backoffMs(2, null, () => 1)).toBe(BACKOFF_MS[2]! * 1.25);
    expect(backoffMs(3, null)).toBeNull();
  });

  it('uses the wait the API asks for, unless switching model is faster', () => {
    expect(backoffMs(0, 7_000)).toBe(7_000);
    expect(backoffMs(0, 60_000)).toBeNull();
  });

  it('reads retryDelay from a Gemini error', () => {
    expect(retryHintMs(new Error('{"error":{"code":429,"details":[{"retryDelay":"17s"}]}}'))).toBe(17_000);
    expect(retryHintMs(new Error('Please retry in 2.5s.'))).toBe(2_500);
    expect(retryHintMs(new Error('503 high demand'))).toBeNull();
  });
});

describe('circuit breaker', () => {
  it('skips an overloaded model for a while and shares that with other instances', async () => {
    let now = 1_000_000;
    const saved: [string, number][] = [];
    const store = { load: async () => saved.map(([model, until]) => ({ model, until })), save: async (m: string, u: number) => void saved.push([m, u]) };
    const a = new CircuitBreaker(store, () => now, 0);
    const b = new CircuitBreaker(store, () => now, 0);
    await a.trip('main', '503');
    expect(await a.order(['main', 'backup'])).toEqual({ models: ['backup'], skipped: ['main'] });
    // Another instance reads the same state.
    expect((await b.order(['main', 'backup'])).models).toEqual(['backup']);
    now += BREAKER_OPEN_MS + 1;
    expect((await a.order(['main', 'backup'])).models).toEqual(['main', 'backup']);
  });

  it('tries every model when all of them are skipped', async () => {
    const breaker = new CircuitBreaker(null);
    await breaker.trip('main', '503');
    await breaker.trip('backup', '503');
    expect((await breaker.order(['main', 'backup'])).models).toEqual(['main', 'backup']);
  });

  it('closes again as soon as the model answers', async () => {
    const breaker = new CircuitBreaker(null);
    await breaker.trip('main', '503');
    await breaker.reset('main');
    expect(await breaker.isOpen('main')).toBe(false);
  });
});

describe('cheap repository reading', () => {
  it('outlines a file without AI: size, purpose and declarations', () => {
    const outline = outlineFile(
      file(
        'src/bank.js',
        ['// Loan and amortization calculator', 'export function monthlyPayment(amount, rate, months) {', '  return 1;', '}', 'class Schedule {', '}', "app.get('/rates', handler);"].join('\n'),
      ),
    );
    expect(outline).toContain('src/bank.js (7 lines)');
    expect(outline).toContain('about: Loan and amortization calculator');
    expect(outline).toContain('export function monthlyPayment(amount, rate, months)');
    expect(outline).toContain('class Schedule');
    expect(outline).toContain("app.get('/rates'");
  });

  it('cuts the middle of a long file but keeps the real line numbers', () => {
    const text = Array.from({ length: 400 }, (_, i) => `const value${i} = compute(${i});`).join('\n');
    const out = renderCompact(file('big.ts', text), 500);
    expect(out).toContain('1| const value0');
    expect(out).toContain('400| const value399');
    expect(out).toMatch(/… lines \d+-\d+ left out to save space …/);
    expect(out.length).toBeLessThan(text.length / 3);
  });

  it('drops blank lines and keeps numbering', () => {
    expect(renderCompact(file('a.ts', 'x\n\n\ny   '), 1000)).toBe('<file path="a.ts">\n1| x\n4| y\n</file>');
  });

  it('caps how many files are read in full and how much one long file costs', () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ path: `f${i}.ts`, text: '', tokens: 10_000 }));
    expect(splitByBudget(files, 1_000_000, { maxFiles: 3 }).full).toHaveLength(3);
    expect(splitByBudget(files, 25_000, { perFileTokens: 4_000 }).full).toHaveLength(5);
  });

  it('identifies content like git does, so equal files share a cached summary', () => {
    expect(blobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});

describe('judging queue', () => {
  it('waits longer before each automatic retry', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    const { nextAttemptAt, RETRY_DELAYS_MIN } = await import('./services/judgeQueue.js');
    const now = 0;
    expect(nextAttemptAt(1, now, () => 0).getTime()).toBe(RETRY_DELAYS_MIN[0]! * 60_000);
    expect(nextAttemptAt(2, now, () => 0).getTime()).toBe(RETRY_DELAYS_MIN[1]! * 60_000);
    expect(nextAttemptAt(5, now, () => 0).getTime()).toBe(RETRY_DELAYS_MIN.at(-1)! * 60_000);
  });
});
