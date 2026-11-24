import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

/** Loads one API resource, with optional polling while `pollWhile` says so. */
export function useLoad<T>(path: string | null, pollWhile?: (data: T) => boolean, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [prevPath, setPrevPath] = useState(path);
  const pollRef = useRef(pollWhile);

  if (path !== prevPath) {
    setPrevPath(path);
    setData(null);
    setLoading(!!path);
  }

  useEffect(() => {
    pollRef.current = pollWhile;
  });

  // `quiet`: a polling refresh keeps what is on screen and shows no progress bar.
  const reload = useCallback(async (quiet = false) => {
    if (!path) return;
    try {
      const next = await api<T>(path, { quiet });
      setData(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!data || !pollRef.current?.(data)) return;
    const timer = setTimeout(() => void reload(true), intervalMs);
    return () => clearTimeout(timer);
  }, [data, reload, intervalMs]);

  return { data, error, loading, reload: useCallback(() => reload(), [reload]) };
}
