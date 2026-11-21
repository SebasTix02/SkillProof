import { THEME_PREFS, useTheme, type ThemePref } from '../lib/theme';

const ICON: Record<ThemePref, string> = { light: 'light_mode', dark: 'dark_mode', system: 'contrast' };
const LABEL: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/** One button that cycles Light → Dark → System. `onDark`: placed on the dark side menu. */
export function ThemeToggle({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  const { pref, setPref } = useTheme();
  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]!;
  const label = `Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}`;
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={label}
      title={label}
      className={
        onDark
          ? 'flex cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-dark-hairline px-2 py-1.5 text-[12px] font-medium text-dark-muted hover:bg-dark-surface hover:text-dark-ink focus-visible:outline-2 focus-visible:outline-accent-on-dark'
          : 'btn-tactile flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-muted hover:border-muted hover:text-ink'
      }
    >
      <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
        {ICON[pref]}
      </span>
      {!compact && <span>{LABEL[pref]}</span>}
    </button>
  );
}

/** Light / Dark / System as a radio group, for Account. */
export function ThemeChoice() {
  const { pref, setPref } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex overflow-hidden rounded-[4px] border border-line-strong">
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
          {LABEL[p]}
        </button>
      ))}
    </div>
  );
}
