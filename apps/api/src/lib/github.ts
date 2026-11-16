import type { CommitProfile } from '@skillproof/shared';
import { env } from '../env.js';
import { badRequest } from './errors.js';

const API = 'https://api.github.com';
const MAX_ZIP_BYTES = 60 * 1024 * 1024;

function headers(accept = 'application/vnd.github+json'): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'skillproof',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = env().GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh(path: string, accept?: string): Promise<Response> {
  const res = await fetch(API + path, { headers: headers(accept), signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) throw badRequest('repo_not_found', 'That repository does not exist or is not public.');
  if (res.status === 403 || res.status === 429)
    throw new Error(`GitHub rate limit reached (${res.status}). Set GITHUB_TOKEN or retry later.`);
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
  return res;
}

export interface RepoMeta {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  isFork: boolean;
  forkParent: string | null;
  sizeKb: number;
}

const enc = encodeURIComponent;

export async function getRepoMeta(owner: string, name: string): Promise<RepoMeta> {
  const res = await gh(`/repos/${enc(owner)}/${enc(name)}`);
  const j = (await res.json()) as {
    name: string;
    owner: { login: string };
    html_url: string;
    default_branch: string;
    fork: boolean;
    private: boolean;
    size: number;
    parent?: { full_name: string };
  };
  if (j.private) throw badRequest('repo_not_public', 'The repository must be public.');
  return {
    owner: j.owner.login,
    name: j.name,
    url: j.html_url,
    defaultBranch: j.default_branch,
    isFork: j.fork,
    forkParent: j.parent?.full_name ?? null,
    sizeKb: j.size,
  };
}

/** The commit a branch points at right now. This is what gets frozen when an event closes. */
export async function getHeadSha(owner: string, name: string, branch: string): Promise<string> {
  const res = await gh(`/repos/${enc(owner)}/${enc(name)}/commits/${enc(branch)}`, 'application/vnd.github.sha');
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('GitHub returned an unexpected commit id');
  return sha;
}

/** Downloads the tree of one exact commit as a zip. */
export async function downloadZip(owner: string, name: string, sha: string): Promise<Uint8Array> {
  const res = await fetch(`${API}/repos/${enc(owner)}/${enc(name)}/zipball/${sha}`, {
    headers: headers(),
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`Could not download the repository (${res.status})`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_ZIP_BYTES) throw badRequest('repo_too_large', 'The repository is larger than 60 MB compressed.');
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

interface CommitItem {
  commit: { author: { name?: string; date?: string } | null };
  author: { login: string } | null;
}

/** Shape of the last 100 commits up to `sha`. Commit dates are set by the author, so this is a signal, not proof. */
export async function getCommitProfile(owner: string, name: string, sha: string, eventStart?: string | null): Promise<CommitProfile> {
  const res = await gh(`/repos/${enc(owner)}/${enc(name)}/commits?sha=${sha}&per_page=100`);
  const items = (await res.json()) as CommitItem[];
  const dates = items.map((c) => c.commit.author?.date).filter((d): d is string => !!d).sort();
  const authors = [...new Set(items.map((c) => c.author?.login ?? c.commit.author?.name ?? 'unknown'))];
  const start = eventStart ? Date.parse(eventStart) : null;
  return {
    total_commits: items.length,
    authors,
    first_commit_at: dates[0] ?? null,
    last_commit_at: dates.at(-1) ?? null,
    commits_before_start: start == null ? null : dates.filter((d) => Date.parse(d) < start).length,
  };
}
