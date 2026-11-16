import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../env.js';
import { forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/http.js';
import { closeDueEvents } from '../services/judge.js';
import { jobHandler } from '../services/queue.js';

const oauth = new OAuth2Client();

/**
 * /internal is called by Cloud Scheduler and Cloud Tasks, never by browsers.
 * In Google Cloud the caller proves itself with an OIDC token signed for our service account.
 * Locally a shared secret does the same job.
 */
async function requireInternal(req: FastifyRequest): Promise<void> {
  const e = env();
  const header = req.headers.authorization;
  if (e.TASKS_SERVICE_ACCOUNT && e.API_PUBLIC_URL && header?.startsWith('Bearer ')) {
    try {
      const ticket = await oauth.verifyIdToken({ idToken: header.slice(7), audience: e.API_PUBLIC_URL.replace(/\/$/, '') });
      const payload = ticket.getPayload();
      if (payload?.email === e.TASKS_SERVICE_ACCOUNT && payload.email_verified) return;
    } catch {
      // falls through to forbidden
    }
    throw forbidden();
  }
  const given = req.headers['x-internal-secret'];
  if (e.INTERNAL_SECRET && typeof given === 'string') {
    const a = Buffer.from(given);
    const b = Buffer.from(e.INTERNAL_SECRET);
    if (a.length === b.length && timingSafeEqual(a, b)) return;
  }
  throw forbidden();
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/internal/tick', async (req) => {
    await requireInternal(req);
    return { closed: await closeDueEvents() };
  });

  app.post('/internal/:kind/:id/run', async (req) => {
    await requireInternal(req);
    const { kind, id } = parse(z.object({ kind: z.string().max(40), id: z.uuid() }), req.params);
    const handler = jobHandler(kind);
    if (!handler) throw notFound('Unknown job');
    await handler(id);
    return { ok: true };
  });
}
