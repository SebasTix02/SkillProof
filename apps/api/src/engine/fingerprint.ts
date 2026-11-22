/**
 * Code fingerprints for content similarity (winnowing, the method behind MOSS). No model call: CPU only.
 *
 *   1. Normalize: comments and whitespace go; identifiers become `I`, strings `S`, numbers `N`; keywords, operators
 *      and punctuation stay. So renaming variables or reformatting does not hide a copy.
 *   2. k-grams: every run of K consecutive tokens gets a hash.
 *   3. Winnowing: of every window of W hashes the smallest is kept (the rightmost on ties). Two files that share a
 *      run of at least K + W - 1 tokens are guaranteed to share a fingerprint, wherever the run sits in each file.
 *
 * Each fingerprint keeps the first and last line of its k-gram, so shared fingerprints can be turned back into
 * matching line ranges.
 */

export const K = 25;
export const W = 4;

/** Words that are kept as themselves (not replaced by `I`): the structure of the code. Shared by common languages. */
const KEYWORDS = new Set(
  (
    'if else elif for while do switch case default break continue return yield await async function def class ' +
    'struct enum interface trait impl fn let const var val mut new delete try catch except finally throw throws raise ' +
    'import from export package use mod pub public private protected static final abstract override virtual ' +
    'extends implements with as is in not and or lambda match where type typeof instanceof this self super ' +
    'true false null nil none undefined void int float double long short char bool boolean string byte go defer ' +
    'select chan map range goto sizeof unsafe namespace template typename operator inline extern volatile register'
  ).split(' '),
);

export interface Token {
  t: string;
  line: number;
}

export interface FileFingerprints {
  hashes: number[];
  /** First and last line of each fingerprint's k-gram (1-based). */
  starts: number[];
  ends: number[];
  tokenCount: number;
}

const HASH_COMMENT = /\.(py|rb|sh|bash|zsh|r|pl|ex|exs|yml|yaml|toml|nim|jl|coffee)$/i;
const SQL_COMMENT = /\.(sql|lua|hs|elm|ada)$/i;

/** Splits source text into normalized tokens with their line numbers. Language-agnostic, good enough for copies. */
export function tokenize(path: string, text: string): Token[] {
  const out: Token[] = [];
  const hashComments = HASH_COMMENT.test(path);
  const dashComments = SQL_COMMENT.test(path);
  let line = 1;
  let i = 0;
  const n = text.length;
  const push = (t: string) => out.push({ t, line });
  while (i < n) {
    const c = text[i]!;
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      i++;
      continue;
    }
    // Comments
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '<' && text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      const stop = end === -1 ? n : end + 3;
      for (let j = i; j < stop; j++) if (text[j] === '\n') line++;
      i = stop;
      continue;
    }
    if (hashComments && c === '#') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (dashComments && c === '-' && text[i + 1] === '-') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    // Strings (and Python docstrings): one token, whatever they say.
    if (c === '"' || c === "'" || c === '`') {
      const triple = text.startsWith(c.repeat(3), i);
      const close = triple ? c.repeat(3) : c;
      const startLine = line;
      i += close.length;
      while (i < n && !text.startsWith(close, i)) {
        if (text[i] === '\\') i++;
        else if (text[i] === '\n') {
          line++;
          if (!triple && c !== '`') break;
        }
        i++;
      }
      i += close.length;
      out.push({ t: 'S', line: startLine });
      continue;
    }
    // Numbers
    if (c >= '0' && c <= '9') {
      while (i < n && /[0-9a-fA-FxX._]/.test(text[i]!)) i++;
      push('N');
      continue;
    }
    // Identifiers and keywords
    if (/[A-Za-z_$@]/.test(c) || c.charCodeAt(0) > 127) {
      let j = i + 1;
      while (j < n && (/[A-Za-z0-9_$]/.test(text[j]!) || text.charCodeAt(j) > 127)) j++;
      const word = text.slice(i, j);
      push(KEYWORDS.has(word.toLowerCase()) ? word.toLowerCase() : 'I');
      i = j;
      continue;
    }
    // Operators and punctuation, one character at a time (multi-character operators still match each other).
    push(c);
    i++;
  }
  return out;
}

/** FNV-1a over a string, 32 bits, with a seed. */
function fnv(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A 52-bit hash of a k-gram (two 32-bit FNV hashes), exact in a JavaScript number and in a Postgres bigint. */
function gramHash(tokens: Token[], from: number): number {
  let s = '';
  for (let i = from; i < from + K; i++) s += tokens[i]!.t + '\u0001';
  return fnv(s, 0x811c9dc5) * 0x100000 + (fnv(s, 0x01000193) & 0xfffff);
}

/** Winnowing over the k-gram hashes of a token list. */
export function winnow(tokens: Token[]): FileFingerprints {
  const grams = tokens.length - K + 1;
  const result: FileFingerprints = { hashes: [], starts: [], ends: [], tokenCount: tokens.length };
  if (grams <= 0) return result;
  const hashes = new Array<number>(grams);
  for (let i = 0; i < grams; i++) hashes[i] = gramHash(tokens, i);
  let lastPicked = -1;
  for (let w = 0; w + W <= grams || (w === 0 && grams < W); w++) {
    const end = Math.min(w + W, grams);
    let min = w;
    for (let j = w + 1; j < end; j++) if (hashes[j]! <= hashes[min]!) min = j;
    if (min !== lastPicked) {
      result.hashes.push(hashes[min]!);
      result.starts.push(tokens[min]!.line);
      result.ends.push(tokens[min + K - 1]!.line);
      lastPicked = min;
    }
    if (end === grams) break;
  }
  return result;
}

export function fingerprintFile(path: string, text: string): FileFingerprints {
  return winnow(tokenize(path, text));
}

// ---------------------------------------------------------------------------------------------------------------------
// Comparing submissions
// ---------------------------------------------------------------------------------------------------------------------

export interface SubmissionPrints {
  id: string;
  /** path → fingerprints of that file */
  files: { path: string; blobSha: string; prints: FileFingerprints }[];
}

export interface Fragment {
  pathA: string;
  startA: number;
  endA: number;
  pathB: string;
  startB: number;
  endB: number;
  /** Fingerprints shared inside the fragment. */
  shared: number;
}

export interface PairResult {
  a: string;
  b: string;
  /** Shared fingerprints / fingerprints of the smaller submission (0 to 1). */
  score: number;
  shared: number;
  fragments: Fragment[];
  identicalFiles: { pathA: string; pathB: string }[];
}

export interface CompareOptions {
  /** Hashes to ignore: starter code given by the teacher or organizer. */
  ignore?: Set<number>;
  /** A hash in more submissions than this share is template code and is ignored (0.4 = 40%). */
  commonShare?: number;
  /** Lines of gap allowed when joining shared fingerprints into one fragment. */
  gap?: number;
  maxFragments?: number;
}

/** Turns hits (shared fingerprints) of one file pair into continuous fragments. */
function fragmentsOf(hits: { la: [number, number]; lb: [number, number] }[], pathA: string, pathB: string, gap: number): Fragment[] {
  hits.sort((x, y) => x.la[0] - y.la[0] || x.lb[0] - y.lb[0]);
  const out: Fragment[] = [];
  let cur: Fragment | null = null;
  for (const h of hits) {
    if (cur && h.la[0] <= cur.endA + gap && h.lb[0] <= cur.endB + gap && h.lb[1] >= cur.startB - gap) {
      cur.endA = Math.max(cur.endA, h.la[1]);
      cur.startB = Math.min(cur.startB, h.lb[0]);
      cur.endB = Math.max(cur.endB, h.lb[1]);
      cur.shared++;
    } else {
      if (cur) out.push(cur);
      cur = { pathA, startA: h.la[0], endA: h.la[1], pathB, startB: h.lb[0], endB: h.lb[1], shared: 1 };
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Compares every pair of submissions at once through an index hash → (submission, file, lines). The cost grows with
 * the total number of fingerprints, not with the number of pairs.
 */
export function compareSubmissions(subs: SubmissionPrints[], opts: CompareOptions = {}): PairResult[] {
  const ignore = opts.ignore ?? new Set<number>();
  const commonShare = opts.commonShare ?? 0.4;
  const gap = opts.gap ?? 3;
  const maxFragments = opts.maxFragments ?? 50;

  // hash → occurrences, and the distinct hashes of each submission
  const index = new Map<number, { s: number; f: number; i: number }[]>();
  const distinct: Set<number>[] = subs.map(() => new Set());
  subs.forEach((sub, s) => {
    sub.files.forEach((file, f) => {
      file.prints.hashes.forEach((h, i) => {
        if (ignore.has(h)) return;
        distinct[s]!.add(h);
        let list = index.get(h);
        if (!list) index.set(h, (list = []));
        list.push({ s, f, i });
      });
    });
  });

  // Template code: in more than commonShare of the submissions (and in more than two).
  const limit = Math.max(2, Math.floor(subs.length * commonShare));
  for (const [h, occ] of index) {
    const inSubs = new Set(occ.map((o) => o.s)).size;
    if (inSubs > limit) {
      index.delete(h);
      for (const d of distinct) d.delete(h);
    }
  }

  // pair key → file pair key → hits
  const pairs = new Map<string, { shared: Set<number>; files: Map<string, { la: [number, number]; lb: [number, number] }[]> }>();
  for (const [h, occ] of index) {
    if (occ.length < 2) continue;
    for (let x = 0; x < occ.length; x++) {
      for (let y = x + 1; y < occ.length; y++) {
        let A = occ[x]!;
        let B = occ[y]!;
        if (A.s === B.s) continue;
        if (subs[A.s]!.id > subs[B.s]!.id) [A, B] = [B, A];
        const key = `${A.s}:${B.s}`;
        let pair = pairs.get(key);
        if (!pair) pairs.set(key, (pair = { shared: new Set(), files: new Map() }));
        pair.shared.add(h);
        const fa = subs[A.s]!.files[A.f]!;
        const fb = subs[B.s]!.files[B.f]!;
        const fkey = `${A.f}:${B.f}`;
        let hits = pair.files.get(fkey);
        if (!hits) pair.files.set(fkey, (hits = []));
        hits.push({ la: [fa.prints.starts[A.i]!, fa.prints.ends[A.i]!], lb: [fb.prints.starts[B.i]!, fb.prints.ends[B.i]!] });
      }
    }
  }

  const results: PairResult[] = [];
  for (const [key, pair] of pairs) {
    const [sa, sb] = key.split(':').map(Number) as [number, number];
    const A = subs[sa]!;
    const B = subs[sb]!;
    const smaller = Math.min(distinct[sa]!.size, distinct[sb]!.size) || 1;
    const fragments: Fragment[] = [];
    for (const [fkey, hits] of pair.files) {
      const [fa, fb] = fkey.split(':').map(Number) as [number, number];
      fragments.push(...fragmentsOf(hits, A.files[fa]!.path, B.files[fb]!.path, gap));
    }
    fragments.sort((x, y) => y.endA - y.startA - (x.endA - x.startA) || y.shared - x.shared);
    const identicalFiles: { pathA: string; pathB: string }[] = [];
    const bySha = new Map(B.files.filter((f) => f.prints.tokenCount >= 50).map((f) => [f.blobSha, f.path]));
    for (const f of A.files) if (f.prints.tokenCount >= 50 && bySha.has(f.blobSha)) identicalFiles.push({ pathA: f.path, pathB: bySha.get(f.blobSha)! });
    results.push({ a: A.id, b: B.id, score: Math.min(1, pair.shared.size / smaller), shared: pair.shared.size, fragments: fragments.slice(0, maxFragments), identicalFiles });
  }
  return results.sort((x, y) => y.score - x.score);
}

/** Lines of the longest fragment of a pair. */
export function longestFragment(p: PairResult): number {
  return p.fragments.reduce((m, f) => Math.max(m, f.endA - f.startA + 1), 0);
}

/** Flag a pair when enough of the smaller submission is shared, or one long block is the same. */
export function shouldFlag(p: PairResult, threshold = 0.3, longBlock = 40): boolean {
  return p.score >= threshold || longestFragment(p) >= longBlock;
}
