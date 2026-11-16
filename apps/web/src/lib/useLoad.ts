import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

/** Loads one API resource, with optional polling while `pollWhile` says so. */
export function useLoad<T>(path: string | null, pollWhile?: (data: T) => boolean, intervalMs = 3000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pollRef = useRef(pollWhile);
  pollRef.current = pollWhile;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const next = await api<T>(path);
      setData(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    setLoading(!!path);
    void reload();
  }, [path, reload]);

  useEffect(() => {
    if (!data || !pollRef.current?.(data)) return;
    const timer = setTimeout(() => void reload(), intervalMs);
    return () => clearTimeout(timer);
  }, [data, reload, intervalMs]);

  return { data, error, loading, reload };
}
