import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

export const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Gemini Developer API key (or multiple comma-separated keys for automatic rotation). Always needed for the Live interview. */
  GEMINI_API_KEY: z.string().min(10),
  /** Optional pool of additional comma-separated Gemini Developer API keys rotated on 429/503/403. */
  GEMINI_API_KEYS: z.string().optional(),
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
  /** Submissions judged at the same time, across all server instances (one by default, so a project gets every Gemini call). The rest wait in the queue. */
  JUDGE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
  /** Gemini calls at the same time in one server instance. */
  GEMINI_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  /** Minimum time between the start of two Gemini calls in one instance. */
  GEMINI_MIN_GAP_MS: z.coerce.number().int().min(0).default(400),
  /** A Gemini call that takes longer than this is treated as busy and retried. */
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(10_000).default(120_000),
  /** Main model for the repository map, scoring and interviews. Default in packages/shared/src/models.ts. */
  GEMINI_MODEL_ANALYSIS: z.string().optional(),
  /** Main model for one-line file summaries. */
  GEMINI_MODEL_SUMMARIES: z.string().optional(),
  /** Backups for each, comma separated, tried in order. Replace the defaults in MODEL_FALLBACKS. */
  GEMINI_FALLBACKS_ANALYSIS: z.string().optional(),
  GEMINI_FALLBACKS_SUMMARIES: z.string().optional(),
  /**
   * When every model is busy through the main provider, try the other one too: Vertex AI when the main one is the
   * Gemini API key, or the key when the main one is Vertex. Needs both to be configured.
   */
  GEMINI_CROSS_PROVIDER: bool.default(false),
  /** Tokens of source code the repository map reads in full. Everything else is outlined. */
  REPO_TOKEN_BUDGET: z.coerce.number().int().min(5_000).default(40_000),
  /** A repository whose readable code fits in this many tokens is read whole, in one call with no summaries. */
  REPO_SMALL_REPO_TOKENS: z.coerce.number().int().min(5_000).default(50_000),
  /** Most files read in full. */
  REPO_MAX_FULL_FILES: z.coerce.number().int().min(5).default(30),
  /** Files outside the budget that get a one-sentence AI summary. The others get a local outline only. */
  REPO_MAX_SUMMARISED_FILES: z.coerce.number().int().min(0).default(20),
  /** Maximum personal interviews a user can start in a rolling 24h window (failed/canceled attempts are excluded). */
  PERSONAL_INTERVIEWS_PER_DAY: z.coerce.number().int().min(1).max(1000).default(15),
  /** Optional comma-separated emails exempt from the daily personal interview cap (e.g. demo/admin accounts). */
  PERSONAL_INTERVIEW_UNLIMITED_EMAILS: z.string().optional(),
});
export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    // An empty line such as `INTERNAL_SECRET=` in a .env file means "not set", not an empty value.
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== ''));
    const parsed = EnvSchema.safeParse(raw);
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

/**
 * Deduplicated pool of Gemini Developer API keys configured in `GEMINI_API_KEY` (supports comma/newline/semicolon separation)
 * and `GEMINI_API_KEYS`. Rotating across multiple project keys multiplies available RPM/TPM quota and isolates key-level 429/503 limits.
 */
export function parseApiKeyList(...sources: (string | undefined)[]): string[] {
  const keys: string[] = [];
  for (const src of sources) {
    if (!src) continue;
    for (const part of src.split(/[,\n;]+/)) {
      const cleaned = part.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length >= 10 && !keys.includes(cleaned)) keys.push(cleaned);
    }
  }
  return keys;
}

export function geminiApiKeys(e: Pick<Env, 'GEMINI_API_KEY' | 'GEMINI_API_KEYS'> = env()): string[] {
  const keys = parseApiKeyList(e.GEMINI_API_KEY, e.GEMINI_API_KEYS);
  return keys.length > 0 ? keys : [e.GEMINI_API_KEY.trim()];
}
