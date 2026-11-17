import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

/** What a file is for, which decides how much of it the model sees. */
export type FileKind = 'code' | 'markup' | 'config' | 'doc';

export interface RepoFile {
  path: string;
  text: string;
  tokens: number;
  kind?: FileKind;
}

/** Why a file is not read at all. */
export type SkipReason =
  | 'dependency'
  | 'build'
  | 'style'
  | 'asset'
  | 'generated'
  | 'lockfile'
  | 'data'
  | 'translation'
  | 'docs'
  | 'snapshot'
  | 'tooling'
  | 'migration'
  | 'too_large'
  | 'binary';

export const MAX_FILE_BYTES = 100 * 1024;
const MAX_FILES = 4000;

const DIRS: Record<string, SkipReason> = {};
const dirs = (reason: SkipReason, names: string) => names.split(' ').forEach((d) => (DIRS[d] = reason));
dirs('dependency', 'node_modules vendor venv .venv env site-packages bower_components Pods third_party third-party external .yarn jspm_packages');
dirs('build', 'dist build out target obj .next .nuxt .svelte-kit .turbo .cache coverage .gradle .dart_tool .expo .terraform __pycache__ .git DerivedData .output .vercel .parcel-cache storybook-static');
dirs('asset', 'assets static public images img media fonts icons');
dirs('translation', 'locales locale i18n l10n lang langs translations');
dirs('docs', 'docs doc documentation');
dirs('snapshot', '__snapshots__');
dirs('data', 'fixtures __fixtures__ testdata test-data seeds');
dirs('generated', 'generated __generated__ gen-src');
dirs('tooling', '.idea .vscode .vs .github .husky .circleci .devcontainer');

const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'composer.lock', 'Cargo.lock',
  'poetry.lock', 'Pipfile.lock', 'Gemfile.lock', 'go.sum', 'uv.lock', 'packages.lock.json', 'flake.lock', 'pubspec.lock',
]);

const EXT: Record<string, SkipReason> = {};
const exts = (reason: SkipReason, list: string) => list.split(' ').forEach((e) => (EXT[e] = reason));
exts('style', 'css scss sass less styl stylus pcss postcss');
exts('asset', 'png jpg jpeg gif webp avif ico bmp tiff svg mp3 mp4 mov avi webm wav ogg flac woff woff2 ttf eot otf psd ai sketch fig xd blend obj fbx glb gltf');
exts('binary', 'pdf zip tar gz tgz rar 7z jar war exe dll so dylib bin pyc class o a lib wasm db sqlite sqlite3 parquet h5 pkl pt pth onnx safetensors npy npz apk ipa dmg iso');
exts('build', 'map');
exts('snapshot', 'snap');
exts('data', 'csv tsv xls xlsx ndjson jsonl geojson');
exts('translation', 'po pot mo arb resx xlf xliff');
exts('tooling', 'iml sln suo pbxproj xcworkspacedata xcscheme user DS_Store');

/** Generated code recognised by its file name. */
const GENERATED_NAME =
  /(\.min\.[a-z]+|\.(bundle|chunk)\.js|\.d\.ts|\.pb\.(go|ts|js|cc|h)|_pb2(_grpc)?\.py|\.g\.dart|\.freezed\.dart|\.gr\.dart|\.mocks\.dart|\.designer\.cs|\.g\.cs|\.g\.i\.cs|\.generated\.[a-z]+|\.gen\.(ts|go|js)|\.pb\.swift)$/i;

/** Third-party libraries copied into the project, recognised by file name. */
const VENDORED_NAME =
  /^(jquery|bootstrap|popper|modernizr|owl\.carousel|slick|wow|isotope|imagesloaded|magnific-popup|waypoints|jquery\.\w+|aos|swiper|lightbox|fancybox|gijgo|nice-select|counterup|scrollit|plugins|vendors?|polyfills?|lodash|underscore|moment|chart|d3|three|tailwind|fontawesome|all\.min|html5shiv|respond|sweetalert2?|select2|datatables|toastr|axios|vue|react|react-dom|angular|alpine|htmx)([.-][\w.-]*)?\.js$/i;
/** Folders that hold a library, a theme's own docs or demo pages rather than the project. */
const VENDORED_DIR = /^(libs?-?vendor|vendors?|plugins?-?vendor|syntax-?highlighter|bower|jspm|cdn|.*[ _-](docs?|documentation)|demo|demos|samples?)$/i;

const MANIFESTS = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml', 'build.gradle',
  'build.gradle.kts', 'Gemfile', 'composer.json', 'pubspec.yaml', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'setup.py', 'mix.exs', 'deno.json', 'vercel.json', 'firebase.json', 'angular.json', 'tsconfig.json', 'app.json',
]);
const MARKUP = /\.(html?|xhtml|hbs|handlebars|ejs|pug|jade|njk|j2|jinja2?|twig|erb|cshtml|razor|liquid|mustache)$/i;
const CONFIG = /\.(json|ya?ml|toml|ini|cfg|conf|xml|properties|env\.example|gradle|plist)$/i;
const DOCS = /\.(md|mdx|rst|adoc|txt|rtf)$/i;
const SMALL_CONFIG_BYTES = 6 * 1024;

const extOf = (file: string) => (file.includes('.') ? file.split('.').pop()!.toLowerCase() : '');
const isRootReadme = (path: string) => /^readme(\.[a-z]+)?$/i.test(path);

/**
 * Why a file should not be read, judged from its path (and size, when known), or null to keep it.
 * Runs before anything is downloaded or unpacked, so skipped files cost nothing.
 */
export function skipReason(path: string, size?: number): SkipReason | null {
  const parts = path.split('/');
  const file = parts.at(-1) ?? '';
  for (const d of parts.slice(0, -1)) {
    const reason =
      DIRS[d] ??
      (d.endsWith('.xcodeproj') || d.endsWith('.xcassets') ? 'tooling' : VENDORED_DIR.test(d) ? (/docs?|documentation$/i.test(d) ? 'docs' : 'dependency') : undefined);
    // README files stay readable everywhere; a folder of docs or assets is still skipped.
    if (reason) return reason;
  }
  if (LOCKFILES.has(file)) return 'lockfile';
  if (/^(license|licence|copying|notice|changelog|changes|history|contributing|code_of_conduct|security|authors)(\.[a-z]+)?$/i.test(file)) return 'docs';
  if (/^(\.gitignore|\.gitattributes|\.editorconfig|\.prettierrc.*|\.prettierignore|\.eslintignore|\.npmrc|\.nvmrc|\.dockerignore|thumbs\.db)$/i.test(file)) return 'tooling';
  if (GENERATED_NAME.test(file)) return 'generated';
  if (VENDORED_NAME.test(file)) return 'dependency';
  const ext = extOf(file);
  const byExt = EXT[ext];
  if (byExt) return byExt;
  if (size !== undefined && (size === 0 || size > MAX_FILE_BYTES)) return size === 0 ? 'binary' : 'too_large';
  // Generated database migrations (Django, Alembic, Entity Framework, TypeORM, Knex). Hand-written SQL stays.
  if (/(^|\/)(migrations?|versions)\//i.test(path) && /^\d{3,}[_-]?.*\.(py|cs|ts|js|rb)$/.test(file)) return 'migration';
  if (DOCS.test(file) && !isRootReadme(path) && !MANIFESTS.has(file)) return 'docs';
  if (ext === 'sql' && (/(dump|seed|backup|data)/i.test(file) || (size !== undefined && size > 40 * 1024))) return 'data';
  if (ext === 'json' && !MANIFESTS.has(file) && !/(^|\.)(tsconfig|jsconfig|eslintrc|babelrc|appsettings|manifest|config|settings|schema)[\w.-]*\.json$/i.test(file)) {
    if (size !== undefined && size > SMALL_CONFIG_BYTES) return 'data';
  }
  if ((ext === 'xml' || ext === 'yaml' || ext === 'yml') && size !== undefined && size > 30 * 1024 && !MANIFESTS.has(file)) return 'data';
  return null;
}

export function isIgnoredPath(path: string): boolean {
  return skipReason(path) !== null;
}

/** Why a file should not be read, judged from its content: generated, minified, or not really text. */
export function contentSkipReason(path: string, text: string): SkipReason | null {
  const head = text.slice(0, 600).toLowerCase();
  if (/@generated|do not edit|auto-?generated|code generated by|this file (was|is) (automatically )?generated|generated by (the )?(protoc|openapi|swagger|graphql-codegen|prisma|sqlc|entity framework)/.test(head))
    return 'generated';
  // A library pasted into the project starts with its own licence banner. Project code rarely does.
  const banner = text.slice(0, 800);
  if (/^\s*\/\*[!*]/.test(banner) && /@license|licensed under|released under the|\(c\)\s*\d{4}|copyright\s+(\(c\)\s*)?\d{4}.*(mit|bsd|apache|gpl)|@version\s+\d/i.test(banner))
    return 'dependency';
  if (extOf(path) === 'json' && !MANIFESTS.has(path.split('/').at(-1) ?? '') && text.length > SMALL_CONFIG_BYTES) return 'data';
  if (text.length > 3_000) {
    const lines = text.split('\n');
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
    // Minified bundles and inlined data: very long lines, or few lines for a lot of text.
    if (longest > 3_000 || text.length / lines.length > 220) return 'generated';
    let readable = 0;
    for (let i = 0; i < Math.min(text.length, 4_000); i++) {
      const c = text.charCodeAt(i);
      if ((c >= 32 && c < 127) || c === 9 || c === 10 || c === 13 || c >= 160) readable++;
    }
    if (readable / Math.min(text.length, 4_000) < 0.9) return 'binary';
  }
  return null;
}

export function fileKind(path: string): FileKind {
  const file = path.split('/').at(-1) ?? '';
  if (isRootReadme(path)) return 'doc';
  if (MARKUP.test(file)) return 'markup';
  if (MANIFESTS.has(file) || CONFIG.test(file) || /^(Dockerfile|Makefile|Procfile)$/.test(file)) return 'config';
  return 'code';
}

/** Notebooks are read as their code and text cells; outputs (images, tables, logs) are dropped. */
function notebookText(raw: string): string | null {
  try {
    const nb = JSON.parse(raw) as { cells?: { cell_type: string; source: string | string[] }[] };
    if (!Array.isArray(nb.cells)) return null;
    return nb.cells
      .filter((c) => c.cell_type === 'code' || c.cell_type === 'markdown')
      .map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source))
      .map((src, i) => `# %% cell ${i + 1}\n${src}`)
      .join('\n\n');
  } catch {
    return null;
  }
}

/** Rough token estimate. Code averages a little under 4 characters per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const ENTRY_NAMES = /^(main|index|app|server|cli|manage|program|application|routes?|router|urls|schema|models?|handlers?|api|views?|controllers?|store)\.[a-z0-9]+$/i;

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
  // Business logic and the shape of the data.
  if (/(^|\/)(services?|domain|models?|entities|controllers?|routes?|handlers?|usecases?|use-cases|store|hooks|logic|engine|resolvers?|actions)\//i.test(path)) score += 12;
  if (/(^|\/)(tests?|__tests__|spec|e2e|mocks?|examples?|scripts?|migrations?|stories)\//i.test(path)) score -= 25;
  if (/\.(test|spec|stories)\.[a-z]+$/i.test(file)) score -= 25;
  if (CONFIG.test(file) && !MANIFESTS.has(file)) score -= 15;
  if (MARKUP.test(file)) score -= 10;
  return score;
}

export type SkippedCounts = Partial<Record<SkipReason, number>>;

export interface Extracted {
  /** Files worth reading, most important first. */
  files: RepoFile[];
  /** Files left out, by reason. */
  skipped: SkippedCounts;
}

const count = (skipped: SkippedCounts, reason: SkipReason) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

/**
 * Turns raw repository entries into the files worth reading. Entries already filtered by path may be passed
 * together with the counts of what was skipped so far.
 */
export function selectFiles(entries: { path: string; bytes: Uint8Array }[], skipped: SkippedCounts = {}): Extracted {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const files: RepoFile[] = [];
  for (const { path, bytes } of entries) {
    const byPath = skipReason(path, bytes.byteLength);
    if (byPath) {
      count(skipped, byPath);
      continue;
    }
    if (bytes.includes(0)) {
      count(skipped, 'binary');
      continue;
    }
    let text: string;
    try {
      text = decoder.decode(bytes);
    } catch {
      count(skipped, 'binary');
      continue;
    }
    if (path.toLowerCase().endsWith('.ipynb')) {
      const cells = notebookText(text);
      if (!cells) {
        count(skipped, 'data');
        continue;
      }
      text = cells;
    }
    const byContent = contentSkipReason(path, text);
    if (byContent) {
      count(skipped, byContent);
      continue;
    }
    files.push({ path, text, tokens: estimateTokens(text), kind: fileKind(path) });
  }
  files.sort((a, b) => priority(b.path) - priority(a.path) || a.path.localeCompare(b.path));
  return { files: files.slice(0, MAX_FILES), skipped };
}

/**
 * The entries of a GitHub zipball that are worth reading. Skipped files are counted but never decompressed.
 * GitHub wraps everything in one top-level folder, which is stripped.
 */
export function zipEntries(zip: Uint8Array): { entries: { path: string; bytes: Uint8Array }[]; skipped: SkippedCounts } {
  const skipped: SkippedCounts = {};
  const raw = unzipSync(zip, {
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      const path = f.name.slice(f.name.indexOf('/') + 1);
      if (!path) return false;
      const reason = skipReason(path, f.originalSize);
      if (reason) count(skipped, reason);
      return !reason;
    },
  });
  return { entries: Object.entries(raw).map(([name, bytes]) => ({ path: name.slice(name.indexOf('/') + 1), bytes })), skipped };
}

/** Unpacks a GitHub zipball and keeps only source text worth reading. */
export function extractRepo(zip: Uint8Array): Extracted {
  const { entries, skipped } = zipEntries(zip);
  return selectFiles(entries, skipped);
}

export function extractFiles(zip: Uint8Array): RepoFile[] {
  return extractRepo(zip).files;
}

const REASON_LABEL: Record<SkipReason, string> = {
  dependency: 'dependency or third-party library',
  build: 'build output',
  style: 'style',
  asset: 'image, font or asset',
  generated: 'generated or minified',
  lockfile: 'lock',
  data: 'data',
  translation: 'translation',
  docs: 'documentation',
  snapshot: 'test snapshot',
  tooling: 'editor and tooling',
  migration: 'generated migration',
  too_large: 'very large',
  binary: 'binary',
};

/** "Skipped 31 files: 12 style, 9 image, font or asset, 6 generated or minified." */
export function describeSkipped(skipped: SkippedCounts): string {
  const items = (Object.entries(skipped) as [SkipReason, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const total = items.reduce((n, [, c]) => n + c, 0);
  if (total === 0) return '';
  return `Skipped ${total} file${total === 1 ? '' : 's'}: ${items.map(([r, n]) => `${n} ${REASON_LABEL[r]}`).join(', ')}.`;
}

export interface Corpus {
  /** Files sent in full, most important first. */
  full: RepoFile[];
  /** Files that did not fit. They are summarised, or only listed. */
  overflow: RepoFile[];
}

/**
 * Splits files into what fits in the budget and what does not. Order must already be by priority.
 * With perFileTokens, a long file costs at most that much, since renderCompact() cuts its middle out.
 */
export function splitByBudget(files: RepoFile[], budgetTokens: number, opts: { maxFiles?: number; perFileTokens?: number } = {}): Corpus {
  const full: RepoFile[] = [];
  const overflow: RepoFile[] = [];
  let used = 0;
  for (const f of files) {
    // line numbers add roughly 10% on top of the raw text
    const cost = Math.ceil(Math.min(f.tokens, opts.perFileTokens ?? Infinity) * 1.1) + 20;
    if (used + cost <= budgetTokens && full.length < (opts.maxFiles ?? Infinity)) {
      full.push(f);
      used += cost;
    } else {
      overflow.push(f);
    }
  }
  return { full, overflow };
}

export interface ReadingPlan {
  /** Read in full (long ones as a skeleton). */
  full: RepoFile[];
  /** Described by an outline, and some of them by a one-line AI summary. */
  outlined: RepoFile[];
  /** Only listed by path. */
  listed: RepoFile[];
  /** Outlined files that also get an AI summary. Empty when the outlines are enough. */
  toSummarise: RepoFile[];
  /** True when the whole repository fits, so a single map call reads everything. */
  small: boolean;
}

export interface ReadingLimits {
  budgetTokens: number;
  maxFullFiles: number;
  perFileTokens: number;
  /** A repository whose readable code fits in this many tokens is read whole, with no summary call. */
  smallRepoTokens: number;
  maxSummarised: number;
  /** Summaries are only worth a call when at least this many files are left outside. */
  minOutlinedForSummaries: number;
  maxOutlined: number;
}

/**
 * Decides how much of each file the model sees. HTML and templates are outlined only, unless they are most of
 * the project (a static site), since their structure says more than their markup.
 */
export function planReading(files: RepoFile[], limits: ReadingLimits): ReadingPlan {
  const kindOf = (f: RepoFile) => f.kind ?? fileKind(f.path);
  const total = files.reduce((n, f) => n + f.tokens, 0);
  const markup = files.filter((f) => kindOf(f) === 'markup').reduce((n, f) => n + f.tokens, 0);
  const markupIsTheApp = total > 0 && markup / total > 0.5;
  const eligible = files.filter((f) => markupIsTheApp || kindOf(f) !== 'markup');
  const outlinedOnly = files.filter((f) => !eligible.includes(f));

  const cost = (f: RepoFile) => Math.min(f.tokens, limits.perFileTokens);
  const eligibleCost = eligible.reduce((n, f) => n + cost(f), 0);
  const small = eligibleCost <= limits.smallRepoTokens && eligible.length <= limits.maxFullFiles * 2;
  const { full, overflow } = small
    ? { full: eligible, overflow: [] as RepoFile[] }
    : splitByBudget(eligible, limits.budgetTokens, { maxFiles: limits.maxFullFiles, perFileTokens: limits.perFileTokens });

  const rest = [...overflow, ...outlinedOnly].sort((a, b) => priority(b.path) - priority(a.path));
  const outlined = rest.slice(0, limits.maxOutlined);
  const listed = rest.slice(limits.maxOutlined);
  const toSummarise =
    outlined.length >= limits.minOutlinedForSummaries
      ? outlined.filter((f) => kindOf(f) === 'code').slice(0, limits.maxSummarised)
      : [];
  return { full, outlined, listed, toSummarise, small };
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

/**
 * Like renderFile, for prompts: blank lines are left out (the numbers still match the file), trailing spaces are
 * trimmed, and a file longer than maxTokens keeps its start and end with the middle replaced by a marker.
 */
/**
 * One line of HTML without what says nothing about the app: class, style, data and aria attributes, inline SVG
 * paths, meta and link tags, comments. What the page does (forms, fields, ids, scripts, text) stays.
 */
export function compactMarkupLine(line: string): string {
  return line
    .replace(/<!--.*?-->/g, '')
    .replace(/<(meta|link)\b[^>]*>/gi, '')
    .replace(/\s(class|style|data-[\w-]+|aria-[\w-]+|role|tabindex|width|height|loading|crossorigin|integrity|rel)=("[^"]*"|'[^']*')/gi, '')
    .replace(/<path\b[^>]*>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trimEnd();
}

export function renderCompact(file: RepoFile, maxTokens: number): string {
  const markup = (file.kind ?? fileKind(file.path)) === 'markup';
  const numbered = file.text
    .split('\n')
    .map((line, i) => ({ n: i + 1, line: markup ? compactMarkupLine(line) : line.trimEnd() }))
    .filter((l) => l.line.trim() !== '' && (!markup || !/^\s*<\/?(div|span|section|i|ul|li)>\s*$/i.test(l.line)));
  const cost = (l: { n: number; line: string }) => estimateTokens(l.line) + 2;
  let total = 0;
  for (const l of numbered) total += cost(l);
  let rows = numbered.map((l) => `${l.n}| ${l.line}`);
  if (total > maxTokens) {
    const head: string[] = [];
    const tail: string[] = [];
    let used = 0;
    let i = 0;
    while (i < numbered.length && used + cost(numbered[i]!) <= maxTokens * 0.65) {
      used += cost(numbered[i]!);
      head.push(`${numbered[i]!.n}| ${numbered[i]!.line}`);
      i++;
    }
    let j = numbered.length - 1;
    while (j > i && used + cost(numbered[j]!) <= maxTokens) {
      used += cost(numbered[j]!);
      tail.unshift(`${numbered[j]!.n}| ${numbered[j]!.line}`);
      j--;
    }
    const from = numbered[i]?.n ?? 0;
    const to = numbered[j]?.n ?? 0;
    rows = [...head, `… lines ${from}-${to} left out to save space …`, ...tail];
  }
  return `<file path="${file.path}">\n${rows.join('\n')}\n</file>`;
}

// Declarations worth listing in an outline, across common languages.
const SIGNATURE = new RegExp(
  [
    String.raw`^\s*(export\s+)?(default\s+)?(async\s+)?function\*?\s+[\w$]+\s*\([^)]{0,120}\)?`,
    String.raw`^\s*(export\s+)?(default\s+)?(abstract\s+)?(class|interface|enum|type|struct|trait|impl|object|record)\s+[\w$<>, ]+`,
    String.raw`^\s*export\s+(const|let|var)\s+[\w$]+`,
    String.raw`^\s*(public|private|protected|internal|static|\s)*\s*[\w<>\[\],? ]+\s+[\w$]+\s*\([^)]{0,120}\)\s*\{?\s*$`,
    String.raw`^\s*(async\s+)?def\s+\w+\s*\([^)]{0,120}\)?`,
    String.raw`^\s*func\s+(\([^)]*\)\s*)?\w+\s*\([^)]{0,120}\)?`,
    String.raw`^\s*(pub\s+)?fn\s+\w+`,
    String.raw`^\s*(app|router|server)\.(get|post|put|patch|delete|use|route)\s*\(\s*['"\x60][^'"\x60]+`,
    String.raw`^\s*@(app|router|bp|api)\.(get|post|put|patch|delete|route)\(`,
    String.raw`^\s*(create\s+table|CREATE\s+TABLE)\s+[\w."]+`,
  ].join('|'),
);

/**
 * A short outline of a file built without AI: its size, its first comment or heading, and up to `maxItems`
 * declarations (functions, classes, routes, tables). Gives the model the shape of files it does not read in full.
 */
export function outlineFile(file: RepoFile, maxItems = 8): string {
  if ((file.kind ?? fileKind(file.path)) === 'markup') return outlineMarkup(file, maxItems);
  const lines = file.text.split('\n');
  const items: string[] = [];
  let intro = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!intro && /^(\/\/|#(?!!)|\/\*\*?|\*|--|<!--|"""|''')\s*\S/.test(line)) {
      intro = line.replace(/^(\/\/+|#+|\/\*\*?|\*|--|<!--|"""|''')\s*/, '').replace(/\*\/$|-->$/, '').trim().slice(0, 120);
    }
    if (items.length < maxItems && SIGNATURE.test(raw)) items.push(line.replace(/\s*\{\s*$/, '').slice(0, 100));
    if (items.length >= maxItems && intro) break;
  }
  const head = `${file.path} (${lines.length} lines)`;
  return [head, intro && `  about: ${intro}`, ...items.map((s) => `  - ${s}`)].filter(Boolean).join('\n');
}

/** Most tokens one HTML page or template may take when read in full. Layout repeats across pages. */
export const MARKUP_FILE_TOKENS = 1_800;

const tagText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** An outline of an HTML page or template: title, headings, forms, the scripts it loads and its main sections. */
export function outlineMarkup(file: RepoFile, maxItems = 8): string {
  const t = file.text;
  const items: string[] = [];
  const add = (s: string) => items.length < maxItems && s && items.push(s.slice(0, 100));
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(t)?.[1];
  for (const m of t.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) add(`h${m[1]}: ${tagText(m[2]!)}`);
  for (const m of t.matchAll(/<form\b([^>]*)>/gi)) add(`form ${(/(id|action|name)="([^"]+)"/i.exec(m[1]!)?.[2]) ?? ''}`.trim());
  const inputs = (t.match(/<(input|select|textarea)\b/gi) ?? []).length;
  if (inputs) add(`${inputs} form fields`);
  for (const m of t.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) add(`script ${m[1]}`);
  const inline = (t.match(/<script\b(?![^>]*\bsrc=)[^>]*>/gi) ?? []).length;
  if (inline) add(`${inline} inline script${inline === 1 ? '' : 's'}`);
  const lines = t.split('\n').length;
  return [`${file.path} (${lines} lines, markup)`, title && `  title: ${tagText(title)}`, ...items.map((s) => `  - ${s}`)].filter(Boolean).join('\n');
}

const IMPORT = /^\s*(import\b|from\s+\S+\s+import\b|using\s+[\w.]+;|require\(|const\s+\w+\s*=\s*require\(|#include\b|package\s+\w|use\s+[\w:]+;)/;

/**
 * For a long file: its imports, every declaration with the first lines of its body, and the start of the file,
 * within maxTokens. Real line numbers are kept and each gap is marked, so the model still cites exact lines.
 * A file that fits is rendered whole by renderCompact.
 */
export function renderSkeleton(file: RepoFile, maxTokens: number, bodyLines = 5): string {
  // Markup has no declarations to keep: compacted, its start and end say more than a skeleton would.
  if ((file.kind ?? fileKind(file.path)) === 'markup') return renderCompact(file, Math.min(maxTokens, MARKUP_FILE_TOKENS));
  if (file.tokens <= maxTokens) return renderCompact(file, maxTokens);
  const lines = file.text.split('\n');
  const keep = new Set<number>();
  for (let i = 0; i < Math.min(lines.length, 15); i++) keep.add(i);
  lines.forEach((line, i) => {
    if (IMPORT.test(line)) keep.add(i);
    if (SIGNATURE.test(line)) for (let j = i; j < Math.min(lines.length, i + 1 + bodyLines); j++) keep.add(j);
  });
  const rows: string[] = [];
  let used = 0;
  let last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    const line = lines[i]!.trimEnd();
    if (!line.trim()) continue;
    const cost = estimateTokens(line) + 2;
    if (used + cost > maxTokens) {
      rows.push(`… lines ${i + 1}-${lines.length} left out to save space …`);
      last = lines.length;
      break;
    }
    if (last >= 0 && i > last + 1) rows.push('…');
    rows.push(`${i + 1}| ${line}`);
    used += cost;
    last = i;
  }
  if (last < lines.length - 1) rows.push(`… up to line ${lines.length} …`);
  return `<file path="${file.path}" note="long file: imports, declarations and the start of each body">\n${rows.join('\n')}\n</file>`;
}

/** The git blob sha of a file's content: the same id GitHub uses, so equal files share one cached summary. */
export function blobSha(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** Text of lines start..end (1-based, inclusive), capped so a snippet stays readable on screen. */
export function sliceLines(text: string, start: number, end: number, maxLines = 60): { text: string; start: number; end: number } {
  const lines = text.split('\n');
  const s = Math.min(Math.max(1, start), lines.length);
  const e = Math.min(Math.max(s, end), lines.length, s + maxLines - 1);
  return { text: lines.slice(s - 1, e).join('\n'), start: s, end: e };
}
