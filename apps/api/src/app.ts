import { computeAssignmentSimilarity, computeEventSimilarity } from './services/similarity.js';
import compress from '@fastify/compress';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { AttemptLimiter } from './lib/accessCode.js';
import { HttpError } from './lib/errors.js';
import { registerWebApp } from './lib/webApp.js';
import { eventRoutes } from './routes/events.js';
import { controlRoutes } from './routes/controls.js';
import { courseRoutes } from './routes/courses.js';
import { internalRoutes } from './routes/internal.js';
import { orgRoutes } from './routes/org.js';
import { reviewRoutes } from './routes/review.js';
import { interviewRoutes } from './routes/interviews.js';
import { profileRoutes } from './routes/profiles.js';
import { evaluateInterview, prepareInterview } from './services/interviews.js';
import { judgeAssignmentSubmission, judgeSubmission } from './services/judge.js';
import { onVercel, registerJob } from './services/queue.js';
import { maybeTick } from './services/scheduler.js';

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(self)',
  // HTTPS only for a year (Cloud Run and Vercel always serve HTTPS; browsers ignore it over plain HTTP).
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

export interface BuildAppOptions {
  /** Overrides default per-IP API rate limit (useful for testing). */
  rateLimit?: { max: number; windowMs: number };
  /** Disables Fastify request logging (useful for quiet tests). */
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  // trustProxy: Cloud Run and Vercel sit behind a reverse proxy, so req.ip comes from X-Forwarded-For per client.
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1024 * 1024, trustProxy: true });

  // gzip / brotli for JSON, the page and the web app's files (Cloud Run does not compress on its own).
  await app.register(compress, { global: true, threshold: 1024 });

  await app.register(cors, {
    origin: env().WEB_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  const apiLimiter = new AttemptLimiter(
    options.rateLimit?.max ?? 120,
    options.rateLimit?.windowMs ?? 60_000,
  );
  const writeLimiter = new AttemptLimiter(25, 60_000);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/healthz') return;
    const ip = req.ip || 'unknown';
    const isExpensiveWrite =
      req.method === 'POST' &&
      (req.url === '/api/interviews' ||
        req.url.endsWith('/token') ||
        req.url.endsWith('/submissions'));
    if (!apiLimiter.allow(ip) || (isExpensiveWrite && !writeLimiter.allow(`w:${ip}`))) {
      reply.header('retry-after', '60');
      return reply.status(429).send({
        error: { code: 'too_many_requests', message: 'Too many requests. Wait a moment and try again.' },
      });
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    for (const [k, v] of Object.entries(API_SECURITY_HEADERS)) {
      if (!reply.hasHeader(k)) reply.header(k, v);
    }
    if ((req.url.startsWith('/api/') || req.url.startsWith('/internal/')) && req.url !== '/api/healthz') {
      if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    }
    return payload;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
  });

  registerJob('judge', judgeSubmission);
  registerJob('judge-assignment', judgeAssignmentSubmission);
  registerJob('interview-prepare', prepareInterview);
  registerJob('interview-evaluate', evaluateInterview);
  registerJob('similarity-event', computeEventSimilarity);
  registerJob('similarity-assignment', computeAssignmentSimilarity);

  // Serverless instances have no timer of their own, so API traffic drives the scheduler too.
  if (onVercel()) {
    app.addHook('onResponse', async (req) => {
      if (req.url.startsWith('/api/')) maybeTick();
    });
  }

  // /api/healthz is the one reachable through Vercel, where only /api/* and /internal/* go to the API.
  for (const path of ['/healthz', '/api/healthz']) app.get(path, async () => ({ ok: true }));
  await app.register(eventRoutes);
  await app.register(interviewRoutes);
  await app.register(profileRoutes);
  await app.register(internalRoutes);
  await app.register(orgRoutes);
  await app.register(reviewRoutes);
  await app.register(courseRoutes);
  await app.register(controlRoutes);

  // One container (Cloud Run): this server also serves the built web app on the same domain.
  const e = env();
  if (e.WEB_DIST) {
    await registerWebApp(app, e.WEB_DIST, e.SUPABASE_ANON_KEY ? { supabaseUrl: e.SUPABASE_URL, supabaseAnonKey: e.SUPABASE_ANON_KEY } : null);
  }
  return app;
}
