import { describe, expect, it } from 'vitest';
import { compareSubmissions, fingerprintFile, longestFragment, shouldFlag, tokenize, type SubmissionPrints } from './engine/fingerprint.js';

const original = `
// Merge sort, recursive.
export function mergeSort(items: number[]): number[] {
  if (items.length <= 1) return items;
  const middle = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, middle));
  const right = mergeSort(items.slice(middle));
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) out.push(left[i++]);
    else out.push(right[j++]);
  }
  while (i < left.length) out.push(left[i++]);
  while (j < right.length) out.push(right[j++]);
  return out;
}
`;

/** The same code with every name changed, other comments and other formatting. */
const renamed = `
/* sorting helper */
export function ordenar(xs: number[]): number[] {
  if (xs.length <= 1) { return xs; }
  const m = Math.floor(xs.length / 2);
  const a = ordenar(xs.slice(0, m));
  const b = ordenar(xs.slice(m));
  const r: number[] = [];
  let p = 0;   let q = 0;
  while (p < a.length && q < b.length) {
    if (a[p] <= b[q]) r.push(a[p++]);
    else r.push(b[q++]);
  }
  while (p < a.length) r.push(a[p++]);
  while (q < b.length) r.push(b[q++]);
  return r;
}
`;

const unrelated = `
import express from 'express';
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true, at: Date.now() }));
app.post('/users', async (req, res) => {
  const user = await db.users.create({ data: req.body });
  res.status(201).json(user);
});
app.listen(Number(process.env.PORT ?? 8080), () => console.log('listening'));
`;

const sub = (id: string, files: [string, string][]): SubmissionPrints => ({
  id,
  files: files.map(([path, text]) => ({ path, blobSha: `${id}:${path}:${text.length}`, prints: fingerprintFile(path, text) })),
});

describe('code fingerprints', () => {
  it('ignore comments, names, strings, numbers and formatting', () => {
    const a = tokenize('a.ts', 'const total = price * 2; // tax\nlabel = "hi";').map((t) => t.t);
    const b = tokenize('b.ts', '/* x */ const suma=valor*7;\nnombre = \'hola\';').map((t) => t.t);
    expect(a).toEqual(b);
    expect(tokenize('a.py', 'x = 1  # comment').map((t) => t.t)).toEqual(['I', '=', 'N']);
  });

  it('keep the line of each fingerprint', () => {
    const fp = fingerprintFile('a.ts', original);
    expect(fp.hashes.length).toBeGreaterThan(5);
    expect(Math.min(...fp.starts)).toBeGreaterThanOrEqual(1);
    expect(fp.ends.every((e, i) => e >= fp.starts[i]!)).toBe(true);
  });
});

describe('comparing submissions', () => {
  it('finds renamed and reformatted copies, with the matching lines', () => {
    const [pair] = compareSubmissions([sub('a', [['src/sort.ts', original]]), sub('b', [['lib/ordenar.ts', renamed]])]);
    expect(pair).toBeDefined();
    expect(pair!.score).toBeGreaterThan(0.5);
    expect(shouldFlag(pair!)).toBe(true);
    const f = pair!.fragments[0]!;
    expect(f.pathA).toBe('src/sort.ts');
    expect(f.pathB).toBe('lib/ordenar.ts');
    expect(f.startA).toBeLessThanOrEqual(6);
    expect(f.endA).toBeGreaterThanOrEqual(15);
  });

  it('does not match unrelated code', () => {
    const pairs = compareSubmissions([sub('a', [['src/sort.ts', original]]), sub('c', [['server.ts', unrelated]])]);
    expect(pairs.filter((p) => shouldFlag(p))).toEqual([]);
  });

  it('ignores template code that most submissions share, and starter code', () => {
    const subs = ['a', 'b', 'c', 'd', 'e'].map((id) => sub(id, [['template.ts', original]]));
    expect(compareSubmissions(subs)).toEqual([]);
    const starter = new Set(fingerprintFile('starter.ts', original).hashes);
    expect(compareSubmissions([sub('a', [['x.ts', original]]), sub('b', [['y.ts', renamed]])], { ignore: starter }).filter((p) => shouldFlag(p))).toEqual([]);
  });

  it('reports identical files and the longest shared block', () => {
    const [pair] = compareSubmissions([
      { id: 'a', files: [{ path: 'a.ts', blobSha: 'same', prints: fingerprintFile('a.ts', original) }] },
      { id: 'b', files: [{ path: 'b.ts', blobSha: 'same', prints: fingerprintFile('b.ts', original) }] },
    ]);
    expect(pair!.identicalFiles).toEqual([{ pathA: 'a.ts', pathB: 'b.ts' }]);
    expect(longestFragment(pair!)).toBeGreaterThan(5);
  });
});
