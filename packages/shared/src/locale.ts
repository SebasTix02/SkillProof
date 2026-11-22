/** Languages SkillProof speaks (20261121000001): the interface, interviews, and the judge's feedback. */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAME: Record<Locale, string> = { en: 'English', es: 'Español' };

/** The supported language closest to a browser language tag ("es-EC" → es); English otherwise. */
export function pickLocale(tag: string | null | undefined): Locale {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(base ?? '') ? (base as Locale) : DEFAULT_LOCALE;
}

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}
