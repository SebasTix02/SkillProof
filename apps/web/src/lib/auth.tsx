import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import { supabase } from './supabase';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  roles: string[];
  permissions: string[];
}

export interface Me {
  profile: { id: string; display_name: string; notify_results?: boolean; locale?: 'en' | 'es' };
  email: string | null;
  public_profile: { slug: string; is_public: boolean; headline: string; show_quotes?: boolean } | null;
  organizations: Organization[];
  /** Courses the user takes as a student (shows "My courses"). */
  enrolled_courses?: number;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  me: Me | null;
  /** The organization the user runs events for, if any. */
  org: Organization | null;
  /** Switches the organization the org screens work on (remembered in this browser). */
  selectOrg: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ORG_KEY = 'skillproof.org';

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ORG_KEY);
    } catch {
      return null;
    }
  });
  const selectOrg = useCallback((id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {
      // storage blocked: the choice lasts for this visit only
    }
  }, []);

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
      org:
        me?.organizations.find((o) => o.id === orgId) ??
        me?.organizations.find((o) => o.permissions.includes('event.create')) ??
        me?.organizations[0] ??
        null,
      selectOrg,
      refresh,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, me, refresh, orgId, selectOrg],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
