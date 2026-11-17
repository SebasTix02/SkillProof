import { RepoMapSchema, pruneUnknownPaths, type CommitProfile, type RepoMap } from '@skillproof/shared';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';
import { currentActivity } from '../lib/activity.js';
import { UNTRUSTED_NOTICE, generateJson, type UsageContext } from '../lib/gemini.js';
import { analysisModel, summariesModel } from '../lib/models.js';
import { downloadRepoFiles, getCommitProfile, getHeadSha, getRepoMeta, type RepoMeta } from '../lib/github.js';
import { db, must } from '../lib/supabase.js';
import { batchByTokens, blobSha, describeSkipped, outlineFile, planReading, renderCompact, renderSkeleton, selectFiles, sliceLines, type RepoFile } from './files.js';

export interface HookSnippet {
  path: string;
  start_line: number;
  end_line: number;
  why: string;
  text: string;
}

export interface AnalysisRow {
  id: string;
  repo_id: string;
  commit_sha: string;
  map_json: RepoMap;
  hooks_json: HookSnippet[];
  commit_profile_json: CommitProfile | null;
}

export interface RepoRow {
  id: string;
  owner: string;
  name: string;
  url: string;
  default_branch: string | null;
  is_fork: boolean;
  fork_parent: string | null;
}

const MAP_SYSTEM = `You are a senior engineer writing a factual map of a software repository for a hackathon jury.

Rules:
- Base every statement on the files you were given. Cite real file paths exactly as they appear in the path attribute.
- Never invent files, features or technologies. If something is not in the code, leave it out.
- Line numbers come from the "N| " prefix of each line.
- interview_hooks: pick 6 to 10 snippets of 5 to 40 lines where the author made a real choice
  (an algorithm, a data model, error handling, a tricky integration). Avoid boilerplate, config and generated code.
- weaknesses: concrete problems (missing validation, secrets in code, no tests, dead code), each tied to files.
- Write in English.

${UNTRUSTED_NOTICE}`;

const SummariesSchema = z.object({
  files: z.array(z.object({ path: z.string(), summary: z.string().describe('One or two sentences on what the file does') })),
});

/** Escapes LIKE wildcards so ilike is a plain case-insensitive match. */
const like = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/** Finds or creates the repos row for a GitHub repository, refreshing its metadata. */
export async function upsertRepo(meta: RepoMeta): Promise<RepoRow> {
  const existing = must(
    await db().from('repos').select('*').ilike('owner', like(meta.owner)).ilike('name', like(meta.name)).maybeSingle(),
  ) as RepoRow | null;
  const fields = {
    owner: meta.owner,
    name: meta.name,
    url: meta.url,
    default_branch: meta.defaultBranch,
    is_fork: meta.isFork,
    fork_parent: meta.forkParent,
  };
  if (existing) {
    return must(await db().from('repos').update(fields).eq('id', existing.id).select('*').single()) as RepoRow;
  }
  const inserted = await db().from('repos').insert(fields).select('*').single();
  if (inserted.error) {
    // Lost a race with another request creating the same repo.
    return must(await db().from('repos').select('*').ilike('owner', like(meta.owner)).ilike('name', like(meta.name)).single()) as RepoRow;
  }
  return inserted.data as RepoRow;
}

/** Checks that a GitHub repository is public and reachable, and returns its repos row. */
export async function resolveRepo(owner: string, name: string): Promise<{ repo: RepoRow; meta: RepoMeta }> {
  const meta = await getRepoMeta(owner, name);
  return { repo: await upsertRepo(meta), meta };
}

/** Largest share of the budget one file may take. Longer files keep their start and end only. */
const PER_FILE_TOKENS = 4_000;
/** Size of one summary batch. Few large batches cost fewer calls than many small ones. */
const SUMMARY_BATCH_TOKENS = 50_000;
const MAX_SUMMARY_BATCHES = 2;
/** Each summarised file is cut to this many tokens: the start of a file says most of what it does. */
const SUMMARY_FILE_TOKENS = 1_200;
/** Files beyond this get no outline line either, only their path in the tree. */
const MAX_OUTLINED_FILES = 200;
/** Summaries are only worth a call when at least this many files are left outside the full read. */
const MIN_OUTLINED_FOR_SUMMARIES = 25;

const SUMMARY_SYSTEM = `For each file, write one factual sentence (at most 25 words) on what it does. Use the exact path given. No preamble.

${UNTRUSTED_NOTICE}`;

/**
 * One-sentence summaries for the most important files that are not read in full.
 * Summaries are cached by blob sha, so a file seen in an earlier commit or another repository costs nothing.
 * At most MAX_SUMMARY_BATCHES calls, run one after the other.
 */
async function summarise(files: RepoFile[], usage: UsageContext): Promise<{ summaries: Map<string, string>; cached: number; calls: number }> {
  const summaries = new Map<string, string>();
  if (files.length === 0) return { summaries, cached: 0, calls: 0 };
  const shaOf = new Map(files.map((f) => [f.path, blobSha(f.text)]));
  const { data: rows, error } = await db().from('file_summaries').select('blob_sha, summary').in('blob_sha', [...new Set(shaOf.values())]);
  if (error) console.warn('Reading cached summaries failed:', error.message);
  const known = new Map((rows ?? []).map((r: { blob_sha: string; summary: string }) => [r.blob_sha, r.summary]));
  const missing: RepoFile[] = [];
  for (const f of files) {
    const hit = known.get(shaOf.get(f.path)!);
    if (hit) summaries.set(f.path, hit);
    else missing.push({ ...f, tokens: Math.min(f.tokens, SUMMARY_FILE_TOKENS) });
  }
  const cached = summaries.size;

  const batches = batchByTokens(missing, SUMMARY_BATCH_TOKENS, MAX_SUMMARY_BATCHES);
  let calls = 0;
  for (const batch of batches) {
    try {
      calls++;
      const { data, model } = await generateJson({
        model: summariesModel(),
        schema: SummariesSchema,
        system: SUMMARY_SYSTEM,
        parts: [{ text: `<repository>\n${batch.map((f) => renderCompact(f, SUMMARY_FILE_TOKENS)).join('\n')}\n</repository>` }],
        usage: { ...usage, kind: 'repo_summaries' },
        maxOutputTokens: 60 * batch.length + 200,
        temperature: 0.1,
        effort: 'minimal',
        thoughts: false,
      });
      const inBatch = new Set(batch.map((f) => f.path));
      const fresh = data.files.filter((f) => inBatch.has(f.path) && f.summary.trim());
      for (const f of fresh) summaries.set(f.path, f.summary.trim());
      const save = fresh.map((f) => ({ blob_sha: shaOf.get(f.path)!, summary: f.summary.trim(), model }));
      if (save.length) {
        const { error: saveError } = await db().from('file_summaries').upsert(save, { onConflict: 'blob_sha', ignoreDuplicates: true });
        if (saveError) console.warn('Caching summaries failed:', saveError.message);
      }
    } catch (err) {
      // The outline still describes these files, so the map can go on without their summaries.
      console.warn('File summaries failed for one batch:', err);
      await currentActivity()?.add('retry', `${batch.length} file summaries could not be written. Those files are described by their outline only.`);
    }
  }
  return { summaries, cached, calls };
}

function buildPrompt(meta: RepoMeta, full: RepoFile[], outlined: RepoFile[], listed: RepoFile[], summaries: Map<string, string>): string {
  const tree = [...full, ...outlined, ...listed].map((f) => f.path).sort().join('\n');
  const outlines = outlined.length
    ? `\n<other_files note="not shown in full: an outline of each, and a summary for the most important">\n${outlined
        .map((f) => {
          const summary = summaries.get(f.path);
          return summary ? `${outlineFile(f, 5)}\n  summary: ${summary}` : outlineFile(f, 5);
        })
        .join('\n')}\n</other_files>`
    : '';
  return `Repository: ${meta.owner}/${meta.name}${meta.isFork ? ` (fork of ${meta.forkParent})` : ''}

<file_tree>
${tree}
</file_tree>

<repository>
${full.map((f) => renderSkeleton(f, PER_FILE_TOKENS)).join('\n')}
</repository>${outlines}`;
}

export interface AnalyzeOptions {
  /** Analyse exactly this commit. When omitted, the current head of the default branch. */
  sha?: string;
  /** Start of the event, to count commits made before it. */
  eventStart?: string | null;
  usage: UsageContext;
  /** Keep the model's reasoning in the activity log. Off for interviews, where it would reveal the questions. */
  thoughts?: boolean;
}

/**
 * Produces the Repo Map for one commit of a public repository.
 * Results are cached by (repo, commit), so the same commit is never paid for twice.
 */
export async function analyzeRepo(owner: string, name: string, opts: AnalyzeOptions): Promise<{ repo: RepoRow; analysis: AnalysisRow }> {
  const { repo, meta } = await resolveRepo(owner, name);
  const sha = opts.sha ?? (await getHeadSha(meta.owner, meta.name, meta.defaultBranch));

  const cached = must(
    await db().from('repo_analyses').select('*').eq('repo_id', repo.id).eq('commit_sha', sha).maybeSingle(),
  ) as AnalysisRow | null;
  const activity = currentActivity();
  if (cached) {
    await activity?.step(`Commit ${sha.slice(0, 7)} was already read before, so its repository map is reused at no extra cost.`);
    return { repo, analysis: cached };
  }

  await activity?.step(`Downloading the code of ${meta.owner}/${meta.name} at commit ${sha.slice(0, 7)} from GitHub.`);
  const download = await downloadRepoFiles(meta.owner, meta.name, sha);
  const { files, skipped } = selectFiles(download.entries, download.skipped);
  if (files.length === 0) throw badRequest('repo_empty', 'There is no source code to read in this repository.');

  const e = env();
  const plan = planReading(files, {
    budgetTokens: e.REPO_TOKEN_BUDGET,
    maxFullFiles: e.REPO_MAX_FULL_FILES,
    perFileTokens: PER_FILE_TOKENS,
    smallRepoTokens: e.REPO_SMALL_REPO_TOKENS,
    maxSummarised: e.REPO_MAX_SUMMARISED_FILES,
    minOutlinedForSummaries: MIN_OUTLINED_FOR_SUMMARIES,
    maxOutlined: MAX_OUTLINED_FILES,
  });
  const { full, outlined, listed, toSummarise } = plan;
  const kb = Math.max(1, Math.round(download.downloadedBytes / 1024));
  await activity?.step(
    `${files.length} files are worth reading (${kb} KB downloaded${download.method === 'selective' ? ', only the files needed' : ''}). ` +
      `${describeSkipped(skipped)} `.trimStart() +
      (plan.small
        ? `The project is small, so all ${full.length} are read in full in one call.`
        : `Reading the ${full.length} most important in full and outlining ${outlined.length} more` +
          (listed.length ? `; ${listed.length} minor files are only listed by name.` : '.')),
  );

  let summaries = new Map<string, string>();
  if (toSummarise.length) {
    await activity?.step(`Writing one-line summaries of the ${toSummarise.length} most relevant files that are not read in full.`, summariesModel());
    const result = await summarise(toSummarise, opts.usage);
    summaries = result.summaries;
    await activity?.step(
      `${summaries.size} of ${toSummarise.length} files summarised` +
        (result.cached ? `, ${result.cached} of them reused from earlier analyses at no cost` : '') +
        ` (${result.calls} AI call${result.calls === 1 ? '' : 's'}).`,
    );
  }

  await activity?.step('Mapping the repository: what it does, its components, key decisions, weak points and code worth asking about.', analysisModel());
  const { data, usage, model } = await generateJson({
    model: analysisModel(),
    schema: RepoMapSchema,
    system: MAP_SYSTEM,
    parts: [{ text: buildPrompt(meta, full, outlined, listed, summaries) }],
    usage: { ...opts.usage, kind: 'repo_map' },
    maxOutputTokens: 10_000,
    effort: 'medium',
    thoughts: opts.thoughts,
  });

  // Anything citing a file that is not in the repo is dropped rather than trusted.
  const byPath = new Map(files.map((f) => [f.path, f]));
  const map = pruneUnknownPaths(data, new Set(byPath.keys()));
  const hooks: HookSnippet[] = map.interview_hooks.map((h) => {
    const cut = sliceLines(byPath.get(h.path)!.text, h.start_line, h.end_line);
    return { path: h.path, start_line: cut.start, end_line: cut.end, why: h.why, text: cut.text };
  });

  await activity?.step(
    `Repository map ready: ${map.components.length} components, ${map.key_decisions.length} key decisions, ${map.weaknesses.length} weak points.`,
  );

  let commitProfile: CommitProfile | null = null;
  try {
    commitProfile = await getCommitProfile(meta.owner, meta.name, sha, opts.eventStart);
    const before = commitProfile.commits_before_start;
    await activity?.step(
      `Read the commit history: ${commitProfile.total_commits} commits by ${commitProfile.authors.length} author${commitProfile.authors.length === 1 ? '' : 's'}` +
        (before ? `, ${before} of them before the event started.` : '.'),
    );
  } catch (err) {
    console.warn('Commit profile failed:', err);
  }

  const row = {
    repo_id: repo.id,
    commit_sha: sha,
    model,
    map_json: map,
    hooks_json: hooks,
    commit_profile_json: commitProfile,
    file_count: files.length,
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
  };
  const inserted = await db().from('repo_analyses').insert(row).select('*').single();
  if (inserted.error) {
    const again = must(
      await db().from('repo_analyses').select('*').eq('repo_id', repo.id).eq('commit_sha', sha).single(),
    ) as AnalysisRow;
    return { repo, analysis: again };
  }
  return { repo, analysis: inserted.data as AnalysisRow };
}
