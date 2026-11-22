import { t, translateMessage } from '../i18n';
import { startRequest } from './loading';
import { supabase } from './supabase';

// In production the API is served on the same domain (see vercel.json), so the default base is empty.
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.PROD ? '' : 'http://localhost:8080')).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Extra fields the API sent with the error, like the id of an existing record. */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Calls the SkillProof API with the current Supabase session. */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; /** Polling: no progress bar. */ quiet?: boolean } = {},
): Promise<T> {
  const done = options.quiet ? () => {} : startRequest();
  try {
    return await request<T>(path, options);
  } finally {
    done();
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', t('errors.network'));
  }
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: Record<string, unknown> } } | null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details ?? {});
  return json as T;
}

/** A sentence a person can act on, never a raw status code or JSON. */
/** The id of the interview that already covers this commit, when the API refused a second one. */
export function existingInterviewId(err: unknown): string | null {
  if (err instanceof ApiError && err.code === 'interview_exists_for_commit') {
    const id = err.details.interview_id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t('errors.sessionEnded');
    if (err.status === 403 && err.code === 'forbidden') return err.message ? translateMessage(err.message) : t('errors.forbidden');
    if (err.status === 429) return t('errors.tooMany');
    if (err.status >= 500 && err.code === 'internal') return t('errors.internal');
    if (err.status === 502 || err.status === 503 || err.status === 504) return t('errors.busy');
    return translateMessage(err.message, err.code);
  }
  if (err instanceof Error && err.message && !err.message.trim().startsWith('{')) return translateMessage(err.message);
  return t('errors.generic');
}
