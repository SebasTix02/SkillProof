import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../env.js';

let client: SupabaseClient | undefined;

/** Service-role client. It bypasses RLS, so every route must check access itself. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throws on a PostgREST error, otherwise returns the data. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}
