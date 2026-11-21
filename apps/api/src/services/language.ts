import type { Locale } from '@skillproof/shared';

/**
 * The language the AI writes or speaks in. English keeps the original prompts exactly as they are (their snapshots
 * are pinned); Spanish only swaps the language line, so the rest of each prompt is the same in both languages.
 */
export const LANGUAGE_NAME: Record<Locale, string> = { en: 'English', es: 'Spanish' };

/** "Write in English." / "Speak English." lines of a prompt, switched to the given language. */
export function inLanguage(prompt: string, locale: Locale | null | undefined): string {
  if (!locale || locale === 'en') return prompt;
  return prompt
    .replace(/Write in English\./g, 'Write in Spanish (neutral Latin American).')
    .replace(/Speak English\./g, 'Speak Spanish (neutral Latin American) from the first sentence, even if the candidate answers in another language.');
}

/** A closing line for prompts that have no language line of their own (the judge, the report). */
export function languageNote(locale: Locale | null | undefined, what: string): string {
  if (!locale || locale === 'en') return '';
  return `\n\nWrite ${what} in ${LANGUAGE_NAME[locale]}. Keep file paths, code identifiers and quotes from the candidate exactly as they are.`;
}
