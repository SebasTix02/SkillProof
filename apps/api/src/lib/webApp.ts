import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** What the browser needs at run time. Only public values: the Supabase URL and its anon key. */
export interface WebRuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * The built index.html with the runtime config in a script before </head>, so one image works for any Supabase
 * project: the web app is built once, and the values come from the server's environment (src/lib/supabase.ts).
 */
export function injectRuntimeConfig(html: string, config: WebRuntimeConfig | null): string {
  if (!config) return html;
  // "<" escaped so a value can never close the script tag.
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return html.replace('</head>', `<script>window.__SKILLPROOF_CONFIG__=${json}</script></head>`);
}

/** Paths that belong to the API, never to the web app. */
export const isApiPath = (url: string) => url.startsWith('/api/') || url.startsWith('/internal/') || url === '/healthz';

/**
 * Serves the built web app from this same server (one container on Cloud Run): hashed files under /assets for a
 * year, every other file for an hour, and index.html for any page route so the React router handles it.
 */
export async function registerWebApp(app: FastifyInstance, dir: string, config: WebRuntimeConfig | null): Promise<void> {
  const root = resolve(dir);
  const indexFile = join(root, 'index.html');
  if (!existsSync(indexFile)) throw new Error(`WEB_DIST has no index.html: ${root}`);
  const index = injectRuntimeConfig(readFileSync(indexFile, 'utf8'), config);

  await app.register(fastifyStatic, {
    root,
    index: false,
    // Our own cache-control below, instead of the plugin's max-age=0.
    cacheControl: false,
    wildcard: true,
    setHeaders(res, path) {
      res.setHeader('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    },
  });

  const sendIndex = (reply: FastifyReply) => reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(index);
  // The root is a folder for the static plugin (403 without an index): it is the landing page.
  app.get('/', (_req, reply) => sendIndex(reply));
  app.setNotFoundHandler((req, reply) => {
    if ((req.method === 'GET' || req.method === 'HEAD') && !isApiPath(req.url)) return sendIndex(reply);
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
  });
}
