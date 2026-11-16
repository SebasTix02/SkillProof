import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

/**
 * Vercel entry point. The web app and the API share one domain: /api/* and /internal/* are routed here
 * (see scripts/build-vercel.mjs), with the original path passed in the __path query parameter.
 * The scheduler runs from app.ts (maybeTick after API requests) and from the cron in vercel.json.
 */
let ready: Promise<FastifyInstance> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= buildApp().then(async (app) => {
    await app.ready();
    return app;
  });
  const app = await ready;

  const url = new URL(req.url ?? '/', 'http://local');
  const forwarded = url.searchParams.get('__path');
  if (forwarded !== null) {
    url.searchParams.delete('__path');
    url.pathname = `/${forwarded}`;
  }
  req.url = url.pathname + url.search;

  const done = new Promise<void>((resolve) => res.once('close', () => resolve()));
  app.server.emit('request', req, res);
  await done;
}
