import { MODELS, RepoMapSchema, pruneUnknownPaths, type CommitProfile, type RepoMap } from '@skillproof/shared';
import { z } from 'zod';
import { env } from '../env.js';
import { badRequest } from '../lib/errors.js';
import { currentActivity } from '../lib/activity.js';
import { UNTRUSTED_NOTICE, generateJson, type UsageContext } from '../lib/gemini.js';
import { downloadZip, getCommitProfile, getHeadSha, getRepoMeta, type RepoMeta } from '../lib/github.js';
import { db, must } from '../lib/supabase.js';
import { batchByTokens, extractFiles, renderFile, sliceLines, splitByBudget, type RepoFile } from './files.js';

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

async function summariseOverflow(overflow: RepoFile[], usage: UsageContext): Promise<Map<string, string>> {
  const summaries = new Map<string, string>();
  const batches = batchByTokens(overflow, 100_000, 5);
  for (const batch of batches) {
    try {
      const { data } = await generateJson({
        model: MODELS.summaries,
        schema: SummariesSchema,
        system: `Summarise each source file in one or two factual sentences. Use the exact path given.\n\n${UNTRUSTED_NOTICE}`,
        parts: [{ text: `<repository>\n${batch.map(renderFile).join('\n')}\n</repository>` }],
        usage: { ...usage, kind: 'repo_summaries' },
        maxOutputTokens: 8000,
      });
      for (const f of data.files) summaries.set(f.path, f.summary);
    } catch (err) {
      console.warn('File summaries failed for one batch:', err);
    }
  }
  return summaries;
}

function buildPrompt(meta: RepoMeta, full: RepoFile[], overflow: RepoFile[], summaries: Map<string, string>): string {
  const tree = [...full, ...overflow].map((f) => f.path).sort().join('\n');
  const rest = overflow.length
    ? `\n<other_files note="not shown in full">\n${overflow
        .map((f) => `${f.path}: ${summaries.get(f.path) ?? '(not summarised)'}`)
        .join('\n')}\n</other_files>`
    : '';
  return `Repository: ${meta.owner}/${meta.name}${meta.isFork ? ` (fork of ${meta.forkParent})` : ''}

<file_tree>
${tree}
</file_tree>

<repository>
${full.map(renderFile).join('\n')}
</repository>${rest}`;
}

export interface AnalyzeOptions {
  /** Analyse exactly this commit. When omitted, the current head of the default branch. */
  sha?: string;
  /** Start of the event, to count commits made before it. */
  eventStart?: string | null;
  usage: UsageContext;
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

  await activity?.step(`Downloading ${meta.owner}/${meta.name} at commit ${sha.slice(0, 7)} from GitHub.`);
  const files = extractFiles(await downloadZip(meta.owner, meta.name, sha));
  if (files.length === 0) throw badRequest('repo_empty', 'There is no source code to read in this repository.');

  const { full, overflow } = splitByBudget(files, env().REPO_TOKEN_BUDGET);
  await activity?.step(
    `Found ${files.length} source files after skipping dependencies, binaries and generated code.` +
      (overflow.length ? ` ${full.length} are read in full and ${overflow.length} are summarised first.` : ' All of them are read in full.'),
  );
  if (overflow.length) await activity?.step(`Summarising ${overflow.length} files that do not fit in full.`, MODELS.summaries);
  const summaries = overflow.length ? await summariseOverflow(overflow, opts.usage) : new Map<string, string>();

  await activity?.step('Mapping the repository: what it does, its components, key decisions, weak points and code worth asking about.', MODELS.analysis);

  const { data, usage, model } = await generateJson({
    model: MODELS.analysis,
    schema: RepoMapSchema,
    system: MAP_SYSTEM,
    parts: [{ text: buildPrompt(meta, full, overflow, summaries) }],
    usage: { ...opts.usage, kind: 'repo_map' },
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
