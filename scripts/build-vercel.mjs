// Builds the whole app for Vercel with the Build Output API (https://vercel.com/docs/build-output-api/v3):
//   .vercel/output/static           the web app (Vite build)
//   .vercel/output/functions/api    the Fastify API as one Node function, bundled with esbuild
//   .vercel/output/config.json      routes (/api and /internal -> function, everything else -> the single page app)
//                                   (the crons stay in vercel.json: Vercel reads them from there, and listing them
//                                   here too is rejected as a duplicate)
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const builtHtml = readFileSync(join(out, 'static', 'index.html'), 'utf8');
const scriptHashes = [...builtHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`,
);

writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '^/(.*)$',
          headers: {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Resource-Policy': 'same-origin',
            'Content-Security-Policy': [
              "default-src 'self'",
              `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          continue: true,
        },
        {
          src: '^/assets/(.*)$',
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '^/((?:api|internal)(?:/.*)?)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Vercel output written to ${out}`);
