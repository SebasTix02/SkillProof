import { describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS, Limiter, ModelHealth, PAUSE_MS, backoffMs, retryHintMs, type ModelState } from './lib/aiLimiter.js';
import { blobSha, compactMarkupLine, contentSkipReason, describeSkipped, outlineFile, planReading, renderCompact, renderSkeleton, selectFiles, skipReason, splitByBudget } from './engine/files.js';

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
  it('retries a busy model once, briefly, then moves on', () => {
    expect(BACKOFF_MS).toHaveLength(1);
    expect(backoffMs(0, null, () => 0.5)).toBe(BACKOFF_MS[0]);
    expect(backoffMs(0, null, () => 0)).toBe(BACKOFF_MS[0]! * 0.75);
    expect(backoffMs(1, null)).toBeNull();
  });

  it('uses the wait the API asks for, unless switching model is faster', () => {
    expect(backoffMs(0, 7_000)).toBe(7_000);
    expect(backoffMs(0, 20_000)).toBeNull();
  });

  it('reads retryDelay from a Gemini error', () => {
    expect(retryHintMs(new Error('{"error":{"code":429,"details":[{"retryDelay":"17s"}]}}'))).toBe(17_000);
    expect(retryHintMs(new Error('Please retry in 2.5s.'))).toBe(2_500);
    expect(retryHintMs(new Error('503 high demand'))).toBeNull();
  });
});

describe('model health', () => {
  const memoryStore = () => {
    const rows = new Map<string, ModelState>();
    return { rows, store: { load: async () => [...rows.values()], save: async (st: ModelState) => void rows.set(st.model, { ...st }) } };
  };

  it('rests a failing model 3, then 10, then 30 minutes, shared with other instances', async () => {
    let now = 1_000_000;
    const { store } = memoryStore();
    const a = new ModelHealth(store, () => now, 0);
    const b = new ModelHealth(store, () => now, 0);
    expect(await a.failure('main', '503')).toBe(now + PAUSE_MS[0]!);
    expect(await b.order(['main', 'backup'])).toMatchObject({ models: ['backup'], skipped: ['main'] });
    now += PAUSE_MS[0]! + 1;
    // Half-open: one probe is let through, and it fails again.
    expect((await a.order(['main', 'backup'])).probe).toBe('main');
    expect(await a.failure('main', '503')).toBe(now + PAUSE_MS[1]!);
    now += PAUSE_MS[1]! + 1;
    await a.order(['main']);
    expect(await a.failure('main', '503')).toBe(now + PAUSE_MS[2]!);
  });

  it('lets only one probe through while a model is being tested', async () => {
    let now = 0;
    const health = new ModelHealth(null, () => now);
    await health.failure('main', '503');
    now += PAUSE_MS[0]! + 1;
    expect((await health.order(['main', 'backup'])).models).toEqual(['main', 'backup']);
    // A second call while the probe runs goes to the backup.
    expect(await health.order(['main', 'backup'])).toMatchObject({ models: ['backup'], skipped: ['main'], probe: null });
    await health.success('main');
    expect((await health.order(['main', 'backup'])).models).toEqual(['main', 'backup']);
  });

  it('tries a model that failed often lately after its backup, even when it is not resting', async () => {
    const health = new ModelHealth(null);
    await health.failure('main', '503');
    await health.failure('main', '503');
    await health.failure('main', '503');
    await health.success('main'); // available again, but 3 of its last 4 calls failed
    expect((await health.order(['main', 'backup'])).models).toEqual(['backup', 'main']);
  });

  it('tries every model when all of them rest', async () => {
    const health = new ModelHealth(null);
    await health.failure('main', '503');
    await health.failure('backup', '503');
    expect((await health.order(['main', 'backup'])).models).toEqual(['main', 'backup']);
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

describe('what is never read', () => {
  it('skips styles, assets, generated, vendored, data, translations and docs by path', () => {
    const cases: [string, string | null][] = [
      ['css/style.css', 'style'],
      ['src/theme.scss', 'style'],
      ['img/logo.png', 'asset'],
      ['public/index.html', 'asset'],
      ['fonts/a.woff2', 'asset'],
      ['js/app.min.js', 'generated'],
      ['src/api.pb.go', 'generated'],
      ['lib/models.g.dart', 'generated'],
      ['types/index.d.ts', 'generated'],
      ['js/jquery-3.6.0.js', 'dependency'],
      ['js/bootstrap.bundle.js', 'generated'],
      ['Finloans Doc/js/custom.js', 'docs'],
      ['syntax-highlighter/scripts/shCore.js', 'dependency'],
      ['locales/en.json', 'translation'],
      ['app/locale/messages.po', 'translation'],
      ['docs/guide.md', 'docs'],
      ['CHANGELOG.md', 'docs'],
      ['data/sales.csv', 'data'],
      ['__snapshots__/a.snap', 'snapshot'],
      ['blog/migrations/0001_initial.py', 'migration'],
      ['yarn.lock', 'lockfile'],
      ['.vscode/settings.json', 'tooling'],
      ['README.md', null],
      ['src/server.ts', null],
      ['supabase/migrations/20261116000001_init.sql', null],
      ['package.json', null],
    ];
    for (const [path, reason] of cases) expect([path, skipReason(path)]).toEqual([path, reason]);
    expect(skipReason('src/fixtures.json', 50_000)).toBe('data');
    expect(skipReason('tsconfig.json', 50_000)).toBeNull();
  });

  it('skips generated, minified and pasted libraries by content', () => {
    expect(contentSkipReason('a.ts', '// Code generated by protoc-gen-go. DO NOT EDIT.\npackage x')).toBe('generated');
    expect(contentSkipReason('a.js', 'x'.repeat(4_000))).toBe('generated');
    expect(contentSkipReason('lib.js', '/*! Lightbox v2.11 | (c) 2020 Lokesh Dhakar | MIT License */\nvar a = 1;')).toBe('dependency');
    expect(contentSkipReason('src/app.ts', '/** Main entry. */\nexport const a = 1;\n')).toBeNull();
  });

  it('reads notebooks as their cells and counts what it skipped', () => {
    const nb = JSON.stringify({ cells: [{ cell_type: 'code', source: ['x = 1\n'], outputs: [{ data: 'big' }] }, { cell_type: 'markdown', source: '# Title' }] });
    const enc = new TextEncoder();
    const { files, skipped } = selectFiles([
      { path: 'analysis.ipynb', bytes: enc.encode(nb) },
      { path: 'css/a.css', bytes: enc.encode('a{}') },
      { path: 'img/b.png', bytes: new Uint8Array([1, 0, 2]) },
    ]);
    expect(files.map((f) => f.path)).toEqual(['analysis.ipynb']);
    expect(files[0]!.text).toContain('x = 1');
    expect(files[0]!.text).not.toContain('big');
    expect(describeSkipped(skipped)).toBe('Skipped 2 files: 1 style, 1 image, font or asset.');
  });
});

describe('reading plan', () => {
  const limits = { budgetTokens: 1_000, maxFullFiles: 10, perFileTokens: 400, smallRepoTokens: 1_500, maxSummarised: 3, minOutlinedForSummaries: 2, maxOutlined: 50 };
  const f = (path: string, tokens: number) => ({ path, text: 'x', tokens });

  it('reads a small project whole, with no summary call', () => {
    const plan = planReading([f('src/a.ts', 300), f('src/b.ts', 300), f('index.html', 100)], limits);
    expect(plan.small).toBe(true);
    expect(plan.full.map((x) => x.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(plan.outlined.map((x) => x.path)).toEqual(['index.html']);
    expect(plan.toSummarise).toEqual([]);
  });

  it('reads the HTML in full when it is most of the project', () => {
    const plan = planReading([f('index.html', 600), f('about.html', 500), f('js/app.js', 200)], limits);
    expect(plan.full.map((x) => x.path).sort()).toEqual(['about.html', 'index.html', 'js/app.js']);
  });

  it('summarises only code, and only when enough is left outside', () => {
    const files = Array.from({ length: 12 }, (_, i) => f(`src/m${i}.ts`, 400));
    const plan = planReading([...files, f('page.html', 50)], limits);
    expect(plan.small).toBe(false);
    expect(plan.toSummarise.length).toBe(3);
    expect(plan.toSummarise.every((x) => x.path.endsWith('.ts'))).toBe(true);
  });

  it('drops layout attributes from HTML but keeps what the page does', () => {
    expect(compactMarkupLine('<input class="form-control big" style="x" id="amount" name="amount" data-x="1" type="number">')).toBe(
      '<input id="amount" name="amount" type="number">',
    );
    expect(compactMarkupLine('<link rel="stylesheet" href="a.css"><!-- nav -->')).toBe('');
  });

  it('keeps imports and declarations of a long file with real line numbers', () => {
    const body = ['import { a } from "./a";', ...Array.from({ length: 300 }, (_, i) => (i % 50 === 0 ? `export function step${i}(x) {` : `  const v${i} = x + ${i};`))];
    const out = renderSkeleton({ path: 'long.ts', text: body.join('\n'), tokens: 5_000 }, 600);
    expect(out).toContain('1| import { a } from "./a";');
    expect(out).toContain('export function step250(x)');
    expect(out).toContain('…');
  });
});
