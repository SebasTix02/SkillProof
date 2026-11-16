import { buildApp } from './app.js';
import { env } from './env.js';
import { closeDueEvents } from './services/judge.js';

const app = await buildApp();
await app.listen({ port: env().PORT, host: '0.0.0.0' });

// Without Cloud Scheduler (local development), this process checks for due events itself.
if (!env().TASKS_QUEUE) {
  setInterval(() => {
    closeDueEvents().catch((err) => app.log.error(err, 'closing due events failed'));
  }, 60_000).unref();
}
