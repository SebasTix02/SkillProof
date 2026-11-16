import type { CloudTasksClient } from '@google-cloud/tasks';
import { waitUntil } from '@vercel/functions';
import { env } from '../env.js';

export type JobHandler = (id: string) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/** Job kinds map 1:1 to POST /internal/<kind>/:id/run. */
export function registerJob(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function jobHandler(kind: string): JobHandler | undefined {
  return handlers.get(kind);
}

// ---- in-process fallback (local development, or a single always-on instance) ----

let running = 0;
const waiting: (() => void)[] = [];

async function runLocal(kind: string, id: string): Promise<void> {
  if (running >= env().JUDGE_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    await handlers.get(kind)?.(id);
  } catch (err) {
    console.error(`Job ${kind}/${id} failed:`, err);
  } finally {
    running--;
    waiting.shift()?.();
  }
}

// ---- Cloud Tasks ----

let tasks: CloudTasksClient | undefined;

// ---- Vercel ----

/** Base URL at which this deployment reaches its own API (its /internal routes). */
export function vercelApiBase(): string | undefined {
  const e = env();
  if (e.API_PUBLIC_URL) return e.API_PUBLIC_URL.replace(/\/$/, '');
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : undefined;
}

/**
 * On Vercel a function stops once its response is sent, unless the work is handed to waitUntil.
 * Each job is posted to this API's own /internal route, so it gets a function invocation (and time limit) of its own.
 * Without INTERNAL_SECRET or a known URL it runs inside the current invocation instead.
 */
function enqueueVercel(kind: string, id: string): void {
  const base = vercelApiBase();
  const secret = env().INTERNAL_SECRET;
  if (!base || !secret) {
    waitUntil(runLocal(kind, id));
    return;
  }
  waitUntil(
    fetch(`${base}/internal/${kind}/${id}/run`, { method: 'POST', headers: { 'x-internal-secret': secret } })
      .then(async (res) => {
        if (!res.ok) console.error(`Job ${kind}/${id} failed: ${res.status} ${await res.text().catch(() => '')}`);
      })
      .catch((err) => console.error(`Job ${kind}/${id} could not be started:`, err)),
  );
}

/**
 * Queues a background job.
 * With TASKS_QUEUE set, Cloud Tasks calls back into /internal with an OIDC token, which gives retries and a
 * concurrency limit configured on the queue. Without it, the job runs in this process.
 */
export async function enqueue(kind: string, id: string): Promise<void> {
  const e = env();
  if (!e.TASKS_QUEUE) {
    if (process.env.VERCEL) enqueueVercel(kind, id);
    else void runLocal(kind, id);
    return;
  }
  tasks ??= new (await import('@google-cloud/tasks')).CloudTasksClient();
  const base = e.API_PUBLIC_URL!.replace(/\/$/, '');
  await tasks.createTask({
    parent: tasks.queuePath(e.GOOGLE_CLOUD_PROJECT!, e.TASKS_LOCATION, e.TASKS_QUEUE),
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url: `${base}/internal/${kind}/${id}/run`,
        oidcToken: { serviceAccountEmail: e.TASKS_SERVICE_ACCOUNT!, audience: base },
      },
      dispatchDeadline: { seconds: 900 },
    },
  });
}
