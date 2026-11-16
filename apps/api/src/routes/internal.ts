import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { env } from '../env.js';
import { forbidden, notFound } from '../lib/errors.js';
import { parse } from '../lib/http.js';
import { background, jobHandler, onVercel } from '../services/queue.js';
import { tick } from '../services/scheduler.js';

const oauth = new OAuth2Client();

/**
 * /internal is called by Cloud Scheduler and Cloud Tasks, never by browsers.
 * In Google Cloud the caller proves itself with an OIDC token signed for our service account.
 * Locally a shared secret does the same job.
 */
function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function requireInternal(req: FastifyRequest): Promise<void> {
  const e = env();
  const header = req.headers.authorization;
  // Vercel cron jobs send CRON_SECRET as a Bearer token.
  if (e.CRON_SECRET && header?.startsWith('Bearer ') && safeEqual(header.slice(7), e.CRON_SECRET)) return;
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
    if (safeEqual(given, e.INTERNAL_SECRET)) return;
  }
  throw forbidden();
}

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  // POST from Cloud Scheduler or an external cron service, GET from Vercel Cron.
  const runTick = async (req: FastifyRequest) => {
    await requireInternal(req);
    return tick();
  };
  app.post('/internal/tick', runTick);
  app.get('/internal/tick', runTick);

  app.post('/internal/:kind/:id/run', async (req, reply) => {
    await requireInternal(req);
    const { kind, id } = parse(z.object({ kind: z.string().max(40), id: z.uuid() }), req.params);
    const handler = jobHandler(kind);
    if (!handler) throw notFound('Unknown job');
    if (onVercel()) {
      // Answer the caller at once and keep working in this invocation.
      background(handler(id), `job ${kind}/${id}`);
      return reply.code(202).send({ accepted: true });
    }
    // Cloud Tasks retries when this request fails, so it waits for the job.
    await handler(id);
    return { ok: true };
  });
}
