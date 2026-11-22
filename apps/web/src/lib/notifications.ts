import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** An invitation to a group of a course assignment that can still be answered (GET /api/me/notifications). */
export interface GroupInviteNotification {
  kind: 'group_invite';
  id: string;
  group_id: string;
  group_name: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  course_name: string | null;
  closes_at: string;
  invited_at: string;
  invited_by: string | null;
}

export type AppNotification = GroupInviteNotification;

/** Every screen that changes notifications (accepting an invitation in My courses, in the bell…) sends this. */
export const NOTIFICATIONS_CHANGED = 'skillproof:notifications-changed';

const POLL_MS = 60_000;

/**
 * One store for the whole page: the bell on the side menu and the one on the mobile top bar share the list and the
 * requests. Loaded quietly (no progress bar), every minute while the tab is visible and when it comes back.
 */
let state: { items: AppNotification[]; loaded: boolean } = { items: [], loaded: false };
const listeners = new Set<(s: typeof state) => void>();
let inflight: Promise<void> | null = null;

function set(next: typeof state) {
  state = next;
  listeners.forEach((l) => l(state));
}

function refresh(): Promise<void> {
  inflight ??= api<{ notifications: AppNotification[] }>('/api/me/notifications', { quiet: true })
    .then(({ notifications }) => set({ items: notifications, loaded: true }))
    // A failed refresh keeps what is on screen; the next one tries again.
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Tell every screen that notifications changed: the bell reloads, and pages listening reload their data. */
export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

/** Answer a group invitation; on success the bell and the pages listening reload. */
export async function respondToInvite(groupId: string, accept: boolean): Promise<void> {
  await api(`/api/me/groups/${groupId}/respond`, { body: { accept } });
  set({ ...state, items: state.items.filter((n) => n.group_id !== groupId) });
  notifyNotificationsChanged();
}

/** One timer and one set of listeners however many bells are mounted; started by the first, stopped by the last. */
let stop: (() => void) | null = null;
function start() {
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, POLL_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  const onChanged = () => void refresh();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
  stop = () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    // Signed out (or the shell left): the next person starts from an empty list.
    state = { items: [], loaded: false };
  };
}

export function useNotifications(enabled: boolean): { items: AppNotification[]; loaded: boolean; refresh: () => Promise<void> } {
  const [s, setS] = useState(state);

  useEffect(() => {
    if (!enabled) return;
    listeners.add(setS);
    setS(state);
    if (listeners.size === 1) {
      start();
      void refresh();
    }
    return () => {
      listeners.delete(setS);
      if (listeners.size === 0) {
        stop?.();
        stop = null;
      }
    };
  }, [enabled]);

  return { items: enabled ? s.items : [], loaded: s.loaded, refresh: useCallback(() => refresh(), []) };
}

/** "5 min ago", "in 2 days" in the interface language. */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86_400), 'day');
}
