/**
 * Requests in flight, for the thin progress bar at the top of the page (`TopProgress`).
 * `api()` counts every request except quiet ones (polling refreshes keep their content and show nothing).
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Requests in flight right now. */
export const pendingRequests = (): number => pending;

export function startRequest(): () => void {
  pending++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending--;
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingRequests(): number {
  return useSyncExternalStore(subscribe, () => pending, () => 0);
}

/** True once `active` has stayed true for `delayMs`: short loads show nothing, so nothing flickers. */
export function useDelayed(active: boolean, delayMs = 150): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return shown;
}
