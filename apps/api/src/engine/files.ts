import { unzipSync } from 'fflate';

export interface RepoFile {
  path: string;
  text: string;
  tokens: number;
}

const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 4000;

const IGNORED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'venv', '.venv', '__pycache__', '.git',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', '.idea', '.vscode', 'obj', 'Pods',
  '.gradle', '.dart_tool', 'bower_components', '.expo', '.terraform', 'site-packages',
]);

const IGNORED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'composer.lock', 'Cargo.lock',
  'poetry.lock', 'Pipfile.lock', 'Gemfile.lock', 'go.sum', 'uv.lock', '.DS_Store', 'LICENSE', 'LICENSE.md',
]);

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'svg', 'mp3', 'mp4', 'mov', 'avi', 'webm', 'wav', 'ogg',
  'pdf', 'zip', 'tar', 'gz', 'rar', '7z', 'jar', 'war', 'exe', 'dll', 'so', 'dylib', 'bin', 'woff', 'woff2', 'ttf',
  'eot', 'otf', 'psd', 'ai', 'sketch', 'fig', 'pyc', 'class', 'o', 'a', 'lib', 'wasm', 'db', 'sqlite', 'sqlite3',
  'parquet', 'h5', 'pkl', 'pt', 'pth', 'onnx', 'safetensors', 'npy', 'npz', 'map', 'lock', 'snap', 'csv', 'tsv',
]);

const ENTRY_NAMES = /^(main|index|app|server|cli|manage|program|application|routes?|router|urls|schema|models?|handler|api)\.[a-z0-9]+$/i;
const MANIFESTS = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'Gemfile', 'composer.json', 'pubspec.yaml', 'Dockerfile', 'docker-compose.yml',
]);

/** Rough token estimate. Code averages a little under 4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

export function isIgnoredPath(path: string): boolean {
  const parts = path.split('/');
  const file = parts.at(-1) ?? '';
  if (parts.slice(0, -1).some((d) => IGNORED_DIRS.has(d))) return true;
  if (IGNORED_FILES.has(file)) return true;
  if (/\.min\.(js|css)$/.test(file) || /\.(bundle|chunk)\.js$/.test(file)) return true;
  const ext = file.includes('.') ? file.split('.').pop()!.toLowerCase() : '';
  return BINARY_EXT.has(ext);
}

function looksGenerated(text: string): boolean {
  const head = text.slice(0, 400).toLowerCase();
  if (head.includes('@generated') || head.includes('do not edit') || head.includes('auto-generated')) return true;
  // Minified or data blobs: very long lines
  const firstBreak = text.indexOf('\n');
  return text.length > 5000 && (firstBreak === -1 || firstBreak > 3000);
}

/** Higher is more important. Decides which files go in full when the repo does not fit the budget. */
export function priority(path: string): number {
  const parts = path.split('/');
  const file = parts.at(-1) ?? '';
  const depth = parts.length - 1;
  let score = 50 - depth * 4;
  if (/^readme(\.[a-z]+)?$/i.test(file)) score += depth === 0 ? 100 : 20;
  if (MANIFESTS.has(file)) score += 60;
  if (ENTRY_NAMES.test(file)) score += 35;
  if (/(^|\/)(src|app|lib|server|api|backend|core|pkg|cmd|internal)\//.test(path)) score += 15;
  if (/(^|\/)(tests?|__tests__|spec|e2e|fixtures?|mocks?|examples?|docs?|scripts?|migrations?)\//i.test(path)) score -= 25;
  if (/\.(test|spec)\.[a-z]+$/i.test(file)) score -= 25;
  if (/\.(md|txt|rst)$/i.test(file) && !/^readme/i.test(file)) score -= 15;
  if (/\.(json|ya?ml|toml|ini|cfg|conf|env\.example)$/i.test(file) && !MANIFESTS.has(file)) score -= 10;
  if (/\.(css|scss|less|html)$/i.test(file)) score -= 10;
  return score;
}

/**
 * Unpacks a GitHub zipball and keeps only source text worth reading.
 * GitHub wraps everything in one top-level folder, which is stripped.
 */
export function extractFiles(zip: Uint8Array): RepoFile[] {
  const entries = unzipSync(zip, {
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      const path = f.name.slice(f.name.indexOf('/') + 1);
      return path.length > 0 && f.originalSize <= MAX_FILE_BYTES && f.originalSize > 0 && !isIgnoredPath(path);
    },
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files: RepoFile[] = [];
  for (const [name, bytes] of Object.entries(entries)) {
    const path = name.slice(name.indexOf('/') + 1);
    if (bytes.includes(0)) continue;
    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      continue;
    }
    if (looksGenerated(text)) continue;
    files.push({ path, text, tokens: estimateTokens(text) });
  }
  files.sort((a, b) => priority(b.path) - priority(a.path) || a.path.localeCompare(b.path));
  return files.slice(0, MAX_FILES);
}

export interface Corpus {
  /** Files sent in full, most important first. */
  full: RepoFile[];
  /** Files that did not fit. They are summarised, or only listed. */
  overflow: RepoFile[];
}

/** Splits files into what fits in the budget and what does not. Order must already be by priority. */
export function splitByBudget(files: RepoFile[], budgetTokens: number): Corpus {
  const full: RepoFile[] = [];
  const overflow: RepoFile[] = [];
  let used = 0;
  for (const f of files) {
    // line numbers add roughly 10% on top of the raw text
    const cost = Math.ceil(f.tokens * 1.1) + 20;
    if (used + cost <= budgetTokens) {
      full.push(f);
      used += cost;
    } else {
      overflow.push(f);
    }
  }
  return { full, overflow };
}

/** Groups files into batches that each stay under a token limit. */
export function batchByTokens(files: RepoFile[], maxTokens: number, maxBatches: number): RepoFile[][] {
  const batches: RepoFile[][] = [];
  let current: RepoFile[] = [];
  let used = 0;
  for (const f of files) {
    if (f.tokens > maxTokens) continue;
    if (used + f.tokens > maxTokens && current.length > 0) {
      batches.push(current);
      if (batches.length === maxBatches) return batches;
      current = [];
      used = 0;
    }
    current.push(f);
    used += f.tokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Renders a file with line numbers so the model can cite exact lines. */
export function renderFile(file: RepoFile): string {
  const body = file.text
    .split('\n')
    .map((line, i) => `${i + 1}| ${line}`)
    .join('\n');
  return `<file path="${file.path}">\n${body}\n</file>`;
}

/** Text of lines start..end (1-based, inclusive), capped so a snippet stays readable on screen. */
export function sliceLines(text: string, start: number, end: number, maxLines = 60): { text: string; start: number; end: number } {
  const lines = text.split('\n');
  const s = Math.min(Math.max(1, start), lines.length);
  const e = Math.min(Math.max(s, end), lines.length, s + maxLines - 1);
  return { text: lines.slice(s - 1, e).join('\n'), start: s, end: e };
}
