import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './env.js';
import { HttpError } from './lib/errors.js';
import { eventRoutes } from './routes/events.js';
import { internalRoutes } from './routes/internal.js';
import { interviewRoutes } from './routes/interviews.js';
import { profileRoutes } from './routes/profiles.js';
import { evaluateInterview, prepareInterview } from './services/interviews.js';
import { judgeSubmission } from './services/judge.js';
import { onVercel, registerJob } from './services/queue.js';
import { maybeTick } from './services/scheduler.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

  await app.register(cors, {
    origin: env().WEB_ORIGIN.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: (err as Error).message } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
  });

  registerJob('judge', judgeSubmission);
  registerJob('interview-prepare', prepareInterview);
  registerJob('interview-evaluate', evaluateInterview);

  // Serverless instances have no timer of their own, so API traffic drives the scheduler too.
  if (onVercel()) {
    app.addHook('onResponse', async (req) => {
      if (req.url.startsWith('/api/')) maybeTick();
    });
  }

  app.get('/healthz', async () => ({ ok: true }));
  await app.register(eventRoutes);
  await app.register(interviewRoutes);
  await app.register(profileRoutes);
  await app.register(internalRoutes);
  return app;
}
