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
import { registerJob } from './services/queue.js';

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

  app.get('/healthz', async () => ({ ok: true }));
  await app.register(eventRoutes);
  await app.register(interviewRoutes);
  await app.register(profileRoutes);
  await app.register(internalRoutes);
  return app;
}
