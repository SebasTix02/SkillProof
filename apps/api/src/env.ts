import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Gemini Developer API key. Always needed for the Live interview (ephemeral tokens exist only there). */
  GEMINI_API_KEY: z.string().min(10),
  /** When true, text and video analysis go through Vertex AI so Google Cloud credits apply. */
  USE_VERTEX: bool.default(false),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  /** Service account key (the whole JSON file, on one line) for Vertex AI where gcloud is not available, such as Vercel. */
  GOOGLE_SERVICE_ACCOUNT_JSON: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      try {
        return JSON.parse(v) as { client_email: string; private_key: string };
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be the JSON content of a service account key' });
        return z.NEVER;
      }
    }),
  /** API version used to mint ephemeral Live tokens. */
  LIVE_TOKEN_API_VERSION: z.string().default('v1alpha'),
  GITHUB_TOKEN: z.string().optional(),
  /** Cloud Tasks queue id. When unset, jobs run inside this process (local development). */
  TASKS_QUEUE: z.string().optional(),
  TASKS_LOCATION: z.string().default('us-central1'),
  TASKS_SERVICE_ACCOUNT: z.string().optional(),
  /** Public base URL of this API, used as the Cloud Tasks target and OIDC audience. */
  API_PUBLIC_URL: z.string().optional(),
  /** Shared secret for /internal routes when Cloud Tasks is not used. */
  INTERNAL_SECRET: z.string().min(16).optional(),
  /** Set by Vercel for its cron jobs, which send it as a Bearer token. */
  CRON_SECRET: z.string().min(16).optional(),
  JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
  REPO_TOKEN_BUDGET: z.coerce.number().int().default(150_000),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment:\n${lines}`);
    }
    const e = parsed.data;
    if (e.USE_VERTEX && !e.GOOGLE_CLOUD_PROJECT) throw new Error('USE_VERTEX=true needs GOOGLE_CLOUD_PROJECT');
    if (e.TASKS_QUEUE && !(e.API_PUBLIC_URL && e.TASKS_SERVICE_ACCOUNT && e.GOOGLE_CLOUD_PROJECT))
      throw new Error('TASKS_QUEUE needs API_PUBLIC_URL, TASKS_SERVICE_ACCOUNT and GOOGLE_CLOUD_PROJECT');
    cached = e;
  }
  return cached;
}
