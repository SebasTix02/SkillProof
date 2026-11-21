import { LOCALES, LOCALE_NAME, type Locale } from '@skillproof/shared';
import { t, useI18n } from '../i18n';

/** English / Español. `onDark`: on the dark side menu. Signed in, the choice is saved to the account. */
export function LanguageSelect({ onDark = false, id }: { onDark?: boolean; id?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('language.label')}</span>
      <span
        className={`material-symbols-outlined pointer-events-none absolute left-2 text-[16px] ${onDark ? 'text-dark-muted' : 'text-muted'}`}
        aria-hidden="true"
      >
        translate
      </span>
      <select
        id={id}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className={
          onDark
            ? 'cursor-pointer appearance-none rounded-[4px] border border-dark-hairline bg-transparent py-1.5 pr-2 pl-8 text-[12px] font-medium text-dark-muted hover:text-dark-ink focus-visible:outline-2 focus-visible:outline-accent-on-dark'
            : 'cursor-pointer appearance-none rounded-[4px] border border-line bg-surface py-1 pr-2 pl-8 text-[12px] font-medium text-muted hover:border-muted hover:text-ink'
        }
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-surface text-ink">
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
