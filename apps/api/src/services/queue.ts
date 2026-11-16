import { CloudTasksClient } from '@google-cloud/tasks';
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

/**
 * Queues a background job.
 * With TASKS_QUEUE set, Cloud Tasks calls back into /internal with an OIDC token, which gives retries and a
 * concurrency limit configured on the queue. Without it, the job runs in this process.
 */
export async function enqueue(kind: string, id: string): Promise<void> {
  const e = env();
  if (!e.TASKS_QUEUE) {
    void runLocal(kind, id);
    return;
  }
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
}
