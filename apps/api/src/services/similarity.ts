/**
 * Content similarity between the submissions of one event or one course assignment (see engine/fingerprint.ts).
 *
 *   storeFingerprints   during analyzeRepo: which files the commit had, and the fingerprints of new file contents
 *   computeSimilarity   background job after judging (or on demand): compares every pair, flags the ones that share
 *                       a large part of their code or one long block, and stores the matching fragments
 */
import { parseGithubUrl } from '@skillproof/shared';
import { blobSha, fileKind, selectFiles, type RepoFile } from '../engine/files.js';
import { compareSubmissions, fingerprintFile, longestFragment, shouldFlag, type FileFingerprints, type SubmissionPrints } from '../engine/fingerprint.js';
import { downloadRepoFiles, getHeadSha, getRepoMeta } from '../lib/github.js';
import { db, must } from '../lib/supabase.js';
import { ASSIGNMENT_STORE, EVENT_STORE, type ContestStore } from './contest.js';

/** Files larger than this are not fingerprinted (generated or vendored code). */
const MAX_FILE_CHARS = 200_000;
/** Fingerprinted code per repository, at most. */
const MAX_REPO_CHARS = 2_000_000;
/** The shared share of the smaller submission that flags a pair, and the block length that flags it alone. */
export const SHARE_THRESHOLD = 0.3;
export const LONG_BLOCK_LINES = 40;

interface PrintRow {
  blob_sha: string;
  hashes: (number | string)[];
  starts: number[];
  ends: number[];
  token_count: number;
}

/** Code files worth fingerprinting, largest share of the code first, within the repository budget. */
function codeFiles(files: RepoFile[]): RepoFile[] {
  const out: RepoFile[] = [];
  let total = 0;
  for (const f of files) {
    if ((f.kind ?? fileKind(f.path)) !== 'code' || f.text.length > MAX_FILE_CHARS) continue;
    if (total + f.text.length > MAX_REPO_CHARS) break;
    total += f.text.length;
    out.push(f);
  }
  return out;
}

/** Records the files of an analysed commit and fingerprints the contents seen for the first time. */
export async function storeFingerprints(analysisId: string, files: RepoFile[]): Promise<void> {
  const code = codeFiles(files).map((f) => ({ file: f, sha: blobSha(f.text) }));
  if (!code.length) return;
  const shas = [...new Set(code.map((c) => c.sha))];
  const known = new Set<string>();
  for (let i = 0; i < shas.length; i += 200) {
    const rows = must(await db().from('file_fingerprints').select('blob_sha').in('blob_sha', shas.slice(i, i + 200))) as { blob_sha: string }[];
    for (const r of rows) known.add(r.blob_sha);
  }
  const fresh = new Map<string, FileFingerprints>();
  for (const c of code) if (!known.has(c.sha) && !fresh.has(c.sha)) fresh.set(c.sha, fingerprintFile(c.file.path, c.file.text));
  const rows = [...fresh].map(([sha, p]) => ({ blob_sha: sha, hashes: p.hashes, starts: p.starts, ends: p.ends, token_count: p.tokenCount }));
  for (let i = 0; i < rows.length; i += 100) must(await db().from('file_fingerprints').upsert(rows.slice(i, i + 100), { onConflict: 'blob_sha', ignoreDuplicates: true }));
  const links = code.map((c) => ({ analysis_id: analysisId, path: c.file.path, blob_sha: c.sha }));
  for (let i = 0; i < links.length; i += 500) must(await db().from('analysis_files').upsert(links.slice(i, i + 500), { onConflict: 'analysis_id,path', ignoreDuplicates: true }));
}

/** Analyses made before fingerprints existed: download the commit again and fingerprint it. */
async function ensureFingerprints(analysisId: string, owner: string, name: string, sha: string): Promise<void> {
  const { count } = await db().from('analysis_files').select('path', { count: 'exact', head: true }).eq('analysis_id', analysisId);
  if ((count ?? 0) > 0) return;
  const download = await downloadRepoFiles(owner, name, sha);
  const { files } = selectFiles(download.entries, download.skipped);
  await storeFingerprints(analysisId, files);
}

/** The fingerprints of every file of one analysis. */
async function printsOf(analysisId: string): Promise<SubmissionPrints['files']> {
  const files = must(await db().from('analysis_files').select('path, blob_sha').eq('analysis_id', analysisId)) as { path: string; blob_sha: string }[];
  const shas = [...new Set(files.map((f) => f.blob_sha))];
  const prints = new Map<string, FileFingerprints>();
  for (let i = 0; i < shas.length; i += 100) {
    const rows = must(await db().from('file_fingerprints').select('*').in('blob_sha', shas.slice(i, i + 100))) as PrintRow[];
    for (const r of rows) prints.set(r.blob_sha, { hashes: r.hashes.map(Number), starts: r.starts, ends: r.ends, tokenCount: r.token_count });
  }
  return files.filter((f) => prints.has(f.blob_sha)).map((f) => ({ path: f.path, blobSha: f.blob_sha, prints: prints.get(f.blob_sha)! }));
}

/** Fingerprints of the starter code, which never counts as a copy. */
async function starterHashes(url: string | null): Promise<Set<number>> {
  const out = new Set<number>();
  const ref = url ? parseGithubUrl(url) : null;
  if (!ref) return out;
  const meta = await getRepoMeta(ref.owner, ref.name);
  const sha = await getHeadSha(meta.owner, meta.name, meta.defaultBranch);
  const download = await downloadRepoFiles(meta.owner, meta.name, sha);
  for (const f of codeFiles(selectFiles(download.entries, download.skipped).files)) for (const h of fingerprintFile(f.path, f.text).hashes) out.add(h);
  return out;
}

interface SubRow {
  id: string;
  analysis_id: string | null;
  locked_commit_sha: string | null;
  current_version: { repos: { owner: string; name: string } | null } | null;
}

const matchesTable = (store: ContestStore) => (store.kind === 'event' ? 'similarity_matches' : 'assignment_similarity_matches');

/** Compares every pair of judged submissions of a contest and stores the flags and fragments. Returns the flags written. */
export async function computeSimilarity(store: ContestStore, contestId: string): Promise<{ compared: number; flagged: number }> {
  const contest = must(await db().from(store.contests).select('id, organization_id, starter_repo_url').eq('id', contestId).maybeSingle()) as
    | { id: string; organization_id: string; starter_repo_url: string | null }
    | null;
  if (!contest) return { compared: 0, flagged: 0 };
  const subs = must(
    await db()
      .from(store.submissions)
      .select(`id, analysis_id, locked_commit_sha, ${store.currentVersion}`)
      .eq(store.contestFk, contestId)
      .not('analysis_id', 'is', null),
  ) as unknown as SubRow[];
  if (subs.length < 2) return { compared: subs.length, flagged: 0 };

  const prints: SubmissionPrints[] = [];
  for (const s of subs) {
    const repo = s.current_version?.repos;
    if (repo && s.locked_commit_sha) await ensureFingerprints(s.analysis_id!, repo.owner, repo.name, s.locked_commit_sha).catch((err) => console.warn(`Fingerprints of ${s.id} failed:`, err));
    prints.push({ id: s.id, files: await printsOf(s.analysis_id!) });
  }
  const ignore = await starterHashes(contest.starter_repo_url).catch((err) => {
    console.warn('Starter code could not be read:', err);
    return new Set<number>();
  });
  const pairs = compareSubmissions(prints, { ignore });

  let flagged = 0;
  for (const p of pairs) {
    const [a, b] = p.a < p.b ? [p.a, p.b] : [p.b, p.a];
    const flip = a !== p.a;
    const longest = longestFragment(p);
    const base = { [store.contestFk]: contestId, organization_id: contest.organization_id, submission_a: a, submission_b: b };
    if (p.identicalFiles.length) {
      const names = p.identicalFiles.slice(0, 3).map((f) => (flip ? f.pathB : f.pathA)).join(', ');
      must(
        await db().from(store.flags).upsert(
          { ...base, signal: 'identical_files', score: 1, explanation: `${p.identicalFiles.length} identical file${p.identicalFiles.length === 1 ? '' : 's'}: ${names}.` },
          { onConflict: `${store.contestFk},submission_a,submission_b,signal` },
        ),
      );
    }
    if (!shouldFlag(p, SHARE_THRESHOLD, LONG_BLOCK_LINES)) continue;
    flagged++;
    const top = p.fragments[0];
    const explanation =
      `${Math.round(p.score * 100)}% of the smaller submission's code fingerprints are shared` +
      (top ? `; longest shared block ${longest} lines (${flip ? top.pathB : top.pathA} ↔ ${flip ? top.pathA : top.pathB}).` : '.');
    const flag = must(
      await db()
        .from(store.flags)
        .upsert({ ...base, signal: 'shared_code', score: Number(p.score.toFixed(3)), explanation }, { onConflict: `${store.contestFk},submission_a,submission_b,signal` })
        .select('id')
        .single(),
    ) as { id: string };
    must(await db().from(matchesTable(store)).delete().eq('flag_id', flag.id));
    const rows = p.fragments.map((f) => {
      const [pathA, startA, endA, pathB, startB, endB] = flip ? [f.pathB, f.startB, f.endB, f.pathA, f.startA, f.endA] : [f.pathA, f.startA, f.endA, f.pathB, f.startB, f.endB];
      return {
        flag_id: flag.id,
        organization_id: contest.organization_id,
        path_a: pathA,
        start_a: startA,
        end_a: endA,
        path_b: pathB,
        start_b: startB,
        end_b: endB,
        // How dense the shared fingerprints are in the fragment, relative to its length.
        score: Number(Math.min(1, f.shared / Math.max(1, (endA - startA + 1) / 2)).toFixed(3)),
      };
    });
    if (rows.length) must(await db().from(matchesTable(store)).insert(rows));
  }
  return { compared: subs.length, flagged };
}

export const computeEventSimilarity = (id: string) => computeSimilarity(EVENT_STORE, id).then(() => undefined);
export const computeAssignmentSimilarity = (id: string) => computeSimilarity(ASSIGNMENT_STORE, id).then(() => undefined);
