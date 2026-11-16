// Builds the whole app for Vercel with the Build Output API (https://vercel.com/docs/build-output-api/v3):
//   .vercel/output/static           the web app (Vite build)
//   .vercel/output/functions/api    the Fastify API as one Node function, bundled with esbuild
//   .vercel/output/config.json      routes (/api and /internal -> function, everything else -> the single page app) and the cron
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '.vercel', 'output');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// The web app calls the API on its own domain (an empty base URL), unless pointed at another public API.
if (!process.env.VITE_API_URL?.startsWith('https://')) process.env.VITE_API_URL = '';

rmSync(out, { recursive: true, force: true });
run('npm run build -w @skillproof/shared');
run('npm run build -w @skillproof/web');
cpSync(join(root, 'apps', 'web', 'dist'), join(out, 'static'), { recursive: true });

const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'apps', 'api', 'src', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Cloud Tasks loads protocol files from disk and is never used on Vercel.
  external: ['@google-cloud/tasks'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      // Repository judging and interview reports run in their own invocation and can take minutes.
      maxDuration: 300,
    },
    null,
    2,
  ),
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/((?:api|internal)(?:/.*)?)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
      // Once a day works on every plan. On Pro, change it to "* * * * *" so deadlines close within a minute.
      crons: [{ path: '/internal/tick', schedule: '0 6 * * *' }],
    },
    null,
    2,
  ),
);
console.log(`Vercel output written to ${out}`);
