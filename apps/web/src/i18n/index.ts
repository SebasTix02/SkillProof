/**
 * English and Spanish for the whole interface (20261121000001). Dictionaries are typed: `es` has the same shape as
 * `en`, so TypeScript fails when a text is missing. Use `t('section.key', { vars })` and `tn('section.key', count)`
 * for plurals; the current language comes from the account (profiles.locale), then this browser, then its language.
 *
 * `t` is a plain function (it also works in tokens.ts and other non-component code). Changing the language
 * re-mounts the page under <I18nProvider>, so everything re-renders in the new language without a reload.
 */
import { DEFAULT_LOCALE, isLocale, pickLocale, type Locale } from '@skillproof/shared';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { es } from './es';
import { esText } from './esText';

export type { Locale };

type Plural = { one: string; other: string };
type Leaf = string | Plural;
export type Dict = { [k: string]: Leaf | Dict };

/** Dot paths of a dictionary: 'common.save', 'courses.groupSize'. */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
type PluralPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Plural ? `${P}${K}` : T[K] extends string ? never : PluralPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Key = Paths<typeof en>;
export type PluralKey = PluralPaths<typeof en>;

const DICTS: Record<Locale, Dict> = { en, es };
export const LOCALE_KEY = 'skillproof.locale';

let current: Locale = initialLocale();

export function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* storage blocked */
  }
  return pickLocale(typeof navigator !== 'undefined' ? navigator.language : null);
}

export function getLocale(): Locale {
  return current;
}

function lookup(locale: Locale, key: string): Leaf | undefined {
  let node: Leaf | Dict | undefined = DICTS[locale];
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string' || 'one' in node) return undefined;
    node = (node as Dict)[part];
  }
  return node as Leaf | undefined;
}

function fill(text: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name] ?? "") : m));
}

/** The text for a key in the current language (English when missing, then the key itself). */
export function t(key: Key, vars?: Record<string, string | number | null | undefined>): string {
  const v = lookup(current, key) ?? lookup(DEFAULT_LOCALE, key);
  if (v == null) return key;
  return fill(typeof v === 'string' ? v : v.other, vars);
}

/** A counted text: tn('courses.students', 3) → "3 students" / "3 alumnos". `{count}` is filled in. */
export function tn(key: PluralKey, count: number, vars?: Record<string, string | number | null | undefined>): string {
  const v = (lookup(current, key) ?? lookup(DEFAULT_LOCALE, key)) as Plural | undefined;
  if (!v) return key;
  const form = new Intl.PluralRules(current).select(count) === 'one' ? v.one : v.other;
  return fill(form, { count, ...vars });
}

/**
 * Screen text, keyed by its English: tr('Save changes'), tr('Due {date}', { date }). Spanish comes from esText;
 * i18n.test.ts fails when a tr() text in the code has no Spanish.
 */
export function tr(text: string, vars?: Record<string, string | number | null | undefined>): string {
  return fill(current === 'es' ? (esText[text] ?? text) : text, vars);
}

/**
 * A module-level map of labels that follows the language: built again on every read, so
 * `STATUS_LABEL[s]` is in the current language. lazy(() => ({ draft: tr('Draft') })).
 */
export function lazy<T extends object>(build: () => T): T {
  return new Proxy({} as T, {
    get: (_t, p) => (build() as Record<string | symbol, unknown>)[p],
    has: (_t, p) => p in build(),
    ownKeys: () => Reflect.ownKeys(build()),
    getOwnPropertyDescriptor: (_t, p) => {
      const d = Object.getOwnPropertyDescriptor(build(), p);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

/** A counted screen text: trn('{count} student', '{count} students', n). */
export function trn(one: string, other: string, count: number, vars?: Record<string, string | number | null | undefined>): string {
  const isOne = new Intl.PluralRules(current).select(count) === 'one';
  return tr(isOne ? one : other, { count, ...vars });
}

/** Translates a message that came from the API or a shared schema, by its error code first, then its English text. */
export function translateMessage(message: string, code?: string): string {
  if (current === DEFAULT_LOCALE) return message;
  const byCode = code ? lookup(current, `apiErrors.${code}`) : undefined;
  if (typeof byCode === 'string') return byCode;
  const known = (DICTS[current].messages as Record<string, string> | undefined)?.[message] ?? esText[message];
  return known ?? message;
}

// ---------------------------------------------------------------------------------------------------------------------
// Dates and numbers
// ---------------------------------------------------------------------------------------------------------------------

const TAG: Record<Locale, string> = { en: 'en-US', es: 'es' };

export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(TAG[current], { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(TAG[current], { dateStyle: 'medium' });
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString(TAG[current], { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// ---------------------------------------------------------------------------------------------------------------------
// React
// ---------------------------------------------------------------------------------------------------------------------

interface I18nState {
  locale: Locale;
  /** Changes the language now; `persist` saves it to the account (Account and the header pass it when signed in). */
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<I18nState>({ locale: current, setLocale: () => {} });

/** Sets the language outside React (tests, startup). Components follow through <I18nProvider>. */
export function applyLocale(l: Locale): void {
  current = l;
  try {
    localStorage.setItem(LOCALE_KEY, l);
  } catch {
    /* storage blocked */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

/**
 * Holds the language. `accountLocale` (from /api/me) wins over the browser once known; `onChange` saves a change to
 * the account. Children are keyed by the language, so they re-mount in it.
 */
export function I18nProvider({ children, accountLocale, onChange }: { children: ReactNode; accountLocale?: Locale | null; onChange?: (l: Locale) => void }) {
  const [locale, setLocaleState] = useState<Locale>(current);
  const [prevAccount, setPrevAccount] = useState(accountLocale);

  if (accountLocale !== prevAccount) {
    setPrevAccount(accountLocale);
    if (accountLocale && accountLocale !== locale) {
      setLocaleState(accountLocale);
    }
  }

  useEffect(() => {
    if (locale !== current) applyLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback(
    (l: Locale) => {
      if (l === current) return;
      applyLocale(l);
      setLocaleState(l);
      onChange?.(l);
    },
    [onChange],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return createElement(Ctx.Provider, { value }, createElement('div', { key: locale, className: 'contents' }, children));
}

export function useI18n(): I18nState {
  return useContext(Ctx);
}
