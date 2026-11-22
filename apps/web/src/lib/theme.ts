import { useEffect, useState } from 'react';

/**
 * Light or dark page (DESIGN.md v1.2). The choice is per browser (localStorage `skillproof.theme`); "system" follows
 * prefers-color-scheme. index.html applies the stored choice before the first paint so the page never flashes.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'skillproof.theme';
export const THEME_PREFS: ThemePref[] = ['light', 'dark', 'system'];

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

const listeners = new Set<(p: ThemePref) => void>();

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  applyTheme(resolveTheme(pref, systemDark()));
  listeners.forEach((l) => l(pref));
}

/** The stored choice and the theme in use; follows the system while the choice is "system". */
export function useTheme(): { pref: ThemePref; theme: Theme; setPref: (p: ThemePref) => void } {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const [dark, setDark] = useState(systemDark);

  useEffect(() => {
    listeners.add(setPref);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => {
      setDark(mq.matches);
      if (readThemePref() === 'system') applyTheme(mq.matches ? 'dark' : 'light');
    };
    mq?.addEventListener('change', onChange);
    return () => {
      listeners.delete(setPref);
      mq?.removeEventListener('change', onChange);
    };
  }, []);

  return { pref, theme: resolveTheme(pref, dark), setPref: setThemePref };
}

/** Printing is always light: the page switches for the print and back afterwards. */
export function installPrintTheme(): void {
  window.addEventListener('beforeprint', () => applyTheme('light'));
  window.addEventListener('afterprint', () => applyTheme(resolveTheme(readThemePref(), systemDark())));
}
