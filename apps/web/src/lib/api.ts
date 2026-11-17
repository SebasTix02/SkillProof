import { supabase } from './supabase';

// In production the API is served on the same domain (see vercel.json), so the default base is empty.
const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.PROD ? '' : 'http://localhost:8080')).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the SkillProof API with the current Supabase session. */
export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
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
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  const json = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

/** A sentence a person can act on, never a raw status code or JSON. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has ended. Log in again to continue.';
    if (err.status === 403 && err.code === 'forbidden') return err.message || 'You do not have permission to do that.';
    if (err.status === 429) return 'Too many requests at once. Wait a moment and try again.';
    if (err.status >= 500 && err.code === 'internal') return 'Something went wrong on our side. Try again in a moment.';
    if (err.status === 502 || err.status === 503 || err.status === 504) return 'The server is busy right now. Try again in a moment.';
    return err.message;
  }
  if (err instanceof Error && err.message && !err.message.trim().startsWith('{')) return err.message;
  return 'Something went wrong. Try again in a moment.';
}
