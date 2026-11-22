import { t } from '../i18n';
import { THEME_PREFS, useTheme, type ThemePref } from '../lib/theme';
import { LanguageMenu, type MenuPlacement } from './LanguageControl';

const ICON: Record<ThemePref, string> = { light: 'light_mode', dark: 'dark_mode', system: 'contrast' };
const LABEL = (p: ThemePref) => t(`theme.${p}`);

/** One button that cycles Light → Dark → System. `onDark`: on the dark side menu. `segment`: half of PreferenceControls. */
export function ThemeToggle({ onDark = false, compact = false, segment = false }: { onDark?: boolean; compact?: boolean; segment?: boolean }) {
  const { pref, setPref } = useTheme();
  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]!;
  const label = t('theme.switchTo', { current: LABEL(pref), next: LABEL(next) });
  const look = segment
    ? onDark
      ? 'px-2 py-1.5 text-dark-muted hover:bg-dark-surface hover:text-dark-ink focus-visible:outline-2 focus-visible:outline-accent-on-dark'
      : 'px-2 py-1 text-muted hover:bg-paper hover:text-ink'
    : onDark
      ? 'rounded-[4px] border border-dark-hairline px-2 py-1.5 text-dark-muted hover:bg-dark-surface hover:text-dark-ink focus-visible:outline-2 focus-visible:outline-accent-on-dark'
      : 'btn-tactile rounded-[4px] border border-line bg-surface px-2 py-1 text-muted hover:border-muted hover:text-ink';
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={label}
      title={label}
      className={`flex h-full cursor-pointer items-center justify-center gap-1.5 text-[12px] font-medium ${look}`}
    >
      <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
        {ICON[pref]}
      </span>
      {!compact && <span>{LABEL(pref)}</span>}
    </button>
  );
}

/**
 * Theme and language side by side, as one joined control: the page header (signed out) and the side menu (signed in).
 * `vertical`: stacked, for the collapsed side menu. `placement`: where the language menu opens.
 */
export function PreferenceControls({
  onDark = false,
  vertical = false,
  placement = 'bottom-end',
}: {
  onDark?: boolean;
  vertical?: boolean;
  placement?: MenuPlacement;
}) {
  return (
    <div
      role="group"
      aria-label={`${t('theme.label')} · ${t('language.label')}`}
      className={`flex shrink-0 overflow-hidden rounded-[4px] border ${vertical ? 'flex-col divide-y' : 'items-stretch divide-x'} ${
        onDark ? 'divide-dark-hairline border-dark-hairline' : 'divide-line border-line bg-surface'
      }`}
    >
      <ThemeToggle onDark={onDark} compact segment />
      <LanguageMenu onDark={onDark} segment compact={vertical || onDark} placement={placement} />
    </div>
  );
}

/** Light / Dark / System as a radio group, for Account. */
export function ThemeChoice() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label={t('theme.label')} className="inline-flex overflow-hidden rounded-[4px] border border-line-strong">
      {THEME_PREFS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pref === p}
          onClick={() => setPref(p)}
          className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-[13px] ${
            pref === p ? 'bg-accent-soft font-semibold text-accent-ink' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
            {ICON[p]}
          </span>
          {LABEL(p)}
        </button>
      ))}
    </div>
  );
}
