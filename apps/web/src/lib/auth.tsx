import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { supabase } from './supabase';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  roles: string[];
  permissions: string[];
}

export interface Me {
  profile: { id: string; display_name: string };
  email: string | null;
  public_profile: { slug: string; is_public: boolean; headline: string } | null;
  organizations: Organization[];
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  me: Me | null;
  /** The organization the user runs events for, if any. */
  org: Organization | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const refresh = useCallback(async () => {
    if (!userId) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('/api/me'));
    } catch {
      setMe(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setMe(null);
      return;
    }
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [userId, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      me,
      org: me?.organizations.find((o) => o.permissions.includes('event.create')) ?? null,
      refresh,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, me, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
