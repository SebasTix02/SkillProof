import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    /** Written into index.html by the API when it serves the web app (Cloud Run), from its own environment. */
    __SKILLPROOF_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string };
  }
}

const runtime = typeof window !== 'undefined' ? window.__SKILLPROOF_CONFIG__ : undefined;
// Build-time values (Vite, Vercel) win; the runtime config lets one Docker image work with any Supabase project.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || runtime?.supabaseUrl;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || runtime?.supabaseAnonKey;

export const configured = !!url && !!anonKey;

// The browser uses Supabase for authentication only. All data goes through the API.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
