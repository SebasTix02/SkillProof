import { CloudTasksClient } from '@google-cloud/tasks';
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

/** True when this process runs as a Vercel Function. */
export const onVercel = (): boolean => !!process.env.VERCEL;

/**
 * Runs work after the response has been sent.
 * On Vercel the function stays alive until the promise settles, up to its max duration.
 */
export function background(work: Promise<unknown>, label = 'background work'): void {
  const guarded = work.catch((err) => console.error(`${label} failed:`, err));
  if (onVercel()) waitUntil(guarded);
}

/** The public URL of this API, used to call its own /internal routes. */
export function publicBaseUrl(): string | null {
  const e = env();
  if (e.API_PUBLIC_URL) return e.API_PUBLIC_URL.replace(/\/$/, '');
  // The production domain is not behind Vercel Deployment Protection. A deployment URL may be.
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

// ---- in-process (local development, or a fallback on Vercel) ----

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

// ---- Vercel: one function invocation per job ----

/**
 * Asks this API to run the job in a fresh invocation, so each job gets the full max duration
 * instead of sharing the one of the request that queued it.
 */
async function dispatchOnVercel(kind: string, id: string): Promise<void> {
  const base = publicBaseUrl();
  const secret = env().INTERNAL_SECRET;
  if (base && secret) {
    try {
      const res = await fetch(`${base}/internal/${kind}/${id}/run`, {
        method: 'POST',
        headers: { 'x-internal-secret': secret },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return;
      console.warn(`Dispatching ${kind}/${id} returned ${res.status}. Running it in this invocation.`);
    } catch (err) {
      console.warn(`Dispatching ${kind}/${id} failed. Running it in this invocation.`, err);
    }
  } else {
    console.warn('Set INTERNAL_SECRET (and API_PUBLIC_URL) so each job runs in its own invocation.');
  }
  background(runLocal(kind, id), `job ${kind}/${id}`);
}

// ---- Cloud Tasks ----

let tasks: CloudTasksClient | undefined;

/**
 * Queues a background job.
 * - TASKS_QUEUE set: Cloud Tasks calls back into /internal with an OIDC token, with retries and a concurrency limit.
 * - On Vercel: the API calls its own /internal route, which answers at once and keeps working in the background.
 * - Otherwise the job runs in this process.
 * Jobs are safe to run twice: each one claims its row before working, and the scheduler tick re-queues stuck ones.
 */
export async function enqueue(kind: string, id: string): Promise<void> {
  const e = env();
  if (e.TASKS_QUEUE) {
    tasks ??= new CloudTasksClient();
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
    return;
  }
  if (onVercel()) {
    await dispatchOnVercel(kind, id);
    return;
  }
  void runLocal(kind, id);
}
