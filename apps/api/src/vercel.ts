import type { IncomingMessage, ServerResponse } from 'node:http';
import { waitUntil } from '@vercel/functions';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { closeDueEvents } from './services/judge.js';

/**
 * Vercel entry point. The web app and the API share one domain: /api/* and /internal/* are routed here
 * (see scripts/build-vercel.mjs), with the original path passed in the __path query parameter.
 */
let ready: Promise<FastifyInstance> | undefined;

// Vercel Cron on the Hobby plan runs at most once a day, so due events are also closed on ordinary traffic.
const CLOSE_EVERY_MS = 60_000;
let lastClose = 0;

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

  if (Date.now() - lastClose > CLOSE_EVERY_MS) {
    lastClose = Date.now();
    waitUntil(closeDueEvents().catch((err) => app.log.error(err, 'closing due events failed')));
  }

  const done = new Promise<void>((resolve) => res.once('close', () => resolve()));
  app.server.emit('request', req, res);
  await done;
}
