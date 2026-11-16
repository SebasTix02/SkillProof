import { buildApp } from './app.js';
import { env } from './env.js';
import { onVercel } from './services/queue.js';
import { tick } from './services/scheduler.js';

const app = await buildApp();
await app.listen({ port: env().PORT, host: '0.0.0.0' });

// Without Cloud Scheduler (local development, or one always-on server), this process runs the scheduler itself.
// On Vercel there is no long-lived process: see maybeTick() and the cron in vercel.json.
if (!env().TASKS_QUEUE && !onVercel()) {
  setInterval(() => {
    tick().catch((err) => app.log.error(err, 'scheduler tick failed'));
  }, 60_000).unref();
}
