/**
 * Unsaved changes: a form is "dirty" only when what is on screen differs from what was loaded, so Save and Discard
 * stay off until there is something to save, and leaving the page asks first.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/** Same JSON with object keys sorted, so key order never counts as a change. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  return value;
}

/** True when `current` differs from `initial`. Strings are compared trimmed (trailing spaces are not a change). */
export function isDirty(initial: unknown, current: unknown): boolean {
  const norm = (v: unknown): unknown => (typeof v === 'string' ? v.trim() : v);
  const walk = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : norm(v);
  return JSON.stringify(stable(walk(initial))) !== JSON.stringify(stable(walk(current)));
}

/** Where a click on this element would take the app, if it is an in-app link to another page; null otherwise. */
export function internalTarget(anchor: HTMLAnchorElement | null, here: Location): string | null {
  if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href, here.href);
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname) return null; // a #section of the same page
  return url.pathname + url.search + url.hash;
}

/**
 * While `dirty`: the browser asks before closing or reloading the tab, and in-app links ask with `ask()` (the
 * ConfirmDialog) before leaving. BrowserRouter has no navigation blocker, so links are caught in the capture phase.
 */
export function useUnsavedChanges(dirty: boolean, ask: () => Promise<boolean>) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const to = internalTarget((e.target as Element | null)?.closest('a') ?? null, window.location);
      if (!to) return;
      e.preventDefault();
      e.stopPropagation();
      void ask().then((leave) => {
        if (leave) navigate(to);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, ask, navigate]);
}
