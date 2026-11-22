import { LOCALES, LOCALE_NAME, type Locale } from '@skillproof/shared';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { t, tr, useI18n } from '../i18n';

/** The language's name in the language in use ("Spanish" / "Inglés"); '' if the browser cannot name it. */
function localizedName(l: Locale, inLocale: Locale): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(l) ?? '';
    return name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1);
  } catch {
    return '';
  }
}

export type MenuPlacement = 'bottom-end' | 'top-start' | 'top-end' | 'right-end';

/** Fixed position next to the trigger, so a scrolling or clipped container (the side menu) never cuts the menu. */
function menuPosition(el: HTMLElement, placement: MenuPlacement): CSSProperties {
  const r = el.getBoundingClientRect();
  if (placement === 'top-start') return { left: r.left, bottom: window.innerHeight - r.top + 6 };
  if (placement === 'top-end') return { right: Math.max(8, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 6 };
  if (placement === 'right-end') return { left: r.right + 8, bottom: window.innerHeight - r.bottom };
  return { right: window.innerWidth - r.right, top: r.bottom + 6 };
}

/**
 * Language menu: a compact trigger (icon + code) that opens the list of languages with their native name, their name
 * in the current language and a check on the active one. Arrow keys, Home/End, Escape and a click outside work as in
 * a native menu. `onDark`: on the dark side menu. `segment`: drawn as one half of the theme + language group (no
 * border of its own). Signed in, the choice is saved to the account.
 */
export function LanguageMenu({
  onDark = false,
  segment = false,
  placement = 'bottom-end',
  compact = false,
}: {
  onDark?: boolean;
  segment?: boolean;
  placement?: MenuPlacement;
  compact?: boolean;
}) {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const label = t('language.switchTo', { current: LOCALE_NAME[locale] });

  useLayoutEffect(() => {
    if (open && button.current) setStyle(menuPosition(button.current, placement));
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    items.current[LOCALES.indexOf(locale)]?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
    // Depends on `open` only: the active item gets the focus when the menu opens, not on every language change.
  }, [open]);

  const closeAndReturn = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (l: Locale) => {
    if (l !== locale) setLocale(l);
    closeAndReturn();
  };
  const onMenuKey = (e: KeyboardEvent) => {
    const i = items.current.findIndex((el) => el === document.activeElement);
    const go = (n: number) => items.current[(n + LOCALES.length) % LOCALES.length]?.focus();
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(LOCALES.length - 1);
    else if (e.key === 'Escape') closeAndReturn();
    else if (e.key === 'Tab') setOpen(false);
    else return;
    e.preventDefault();
  };

  const focusRing = onDark ? 'focus-visible:outline-2 focus-visible:outline-accent-on-dark' : '';
  const trigger = segment
    ? onDark
      ? 'text-dark-muted hover:bg-dark-surface hover:text-dark-ink'
      : 'text-muted hover:bg-paper hover:text-ink'
    : onDark
      ? 'rounded-[4px] border border-dark-hairline text-dark-muted hover:bg-dark-surface hover:text-dark-ink'
      : 'btn-tactile rounded-[4px] border border-line bg-surface text-muted hover:border-muted hover:text-ink';
  const openTrigger = open ? (onDark ? 'bg-dark-surface text-dark-ink' : 'bg-paper text-ink') : '';

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-full cursor-pointer items-center justify-center gap-1 px-2 py-1.5 text-[12px] font-medium ${trigger} ${openTrigger} ${focusRing}`}
      >
        <span className="material-symbols-outlined text-[17px]" aria-hidden="true">
          translate
        </span>
        <span className="font-mono-code text-[11px] font-semibold tracking-wider">{locale.toUpperCase()}</span>
        {!compact && (
          <span className={`material-symbols-outlined text-[16px] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
            expand_more
          </span>
        )}
      </button>

      {/* In <body>: inside the sticky side menu it would sit under page content with a z-index of its own. */}
      {open &&
        createPortal(
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={t('language.label')}
          onKeyDown={onMenuKey}
          style={style}
          className={`fixed z-[75] w-[232px] rounded-[6px] border p-1 ${
            onDark ? 'border-dark-hairline bg-dark-surface' : 'border-line-strong bg-surface'
          }`}
        >
          <p
            className={`font-mono-code px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider uppercase ${
              onDark ? 'text-dark-muted' : 'text-muted'
            }`}
          >
            {t('language.label')}
          </p>
          {LOCALES.map((l, i) => {
            const active = l === locale;
            const other = localizedName(l, locale);
            return (
              <button
                key={l}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={l}
                onClick={() => choose(l)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-[4px] px-2.5 py-2 text-left outline-none ${
                  onDark
                    ? active
                      ? 'bg-accent/20 text-dark-ink'
                      : 'text-dark-ink hover:bg-dark-canvas focus-visible:bg-dark-canvas'
                    : active
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink hover:bg-paper focus-visible:bg-paper'
                } focus-visible:ring-2 ${onDark ? 'focus-visible:ring-accent-on-dark' : 'focus-visible:ring-accent-ui'}`}
              >
                <span
                  className={`font-mono-code flex h-6 w-8 shrink-0 items-center justify-center rounded-[3px] border text-[10px] font-semibold tracking-wider ${
                    active
                      ? onDark
                        ? 'border-accent-on-dark/50 text-accent-on-dark'
                        : 'border-accent-ui text-accent-ink'
                      : onDark
                        ? 'border-dark-hairline text-dark-muted'
                        : 'border-line-strong text-muted'
                  }`}
                  aria-hidden="true"
                >
                  {l.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-tight font-semibold">{LOCALE_NAME[l]}</span>
                  {other && other !== LOCALE_NAME[l] && (
                    <span className={`block text-[11px] leading-tight ${onDark ? 'text-dark-muted' : 'text-muted'}`}>{other}</span>
                  )}
                </span>
                {active && (
                  <span
                    className={`material-symbols-outlined text-[18px] ${onDark ? 'text-accent-on-dark' : 'text-accent-ink'}`}
                    aria-hidden="true"
                  >
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/** English / Español as a radio group, next to the theme choice in Account (same look as ThemeChoice). */
export function LanguageChoice({ id }: { id?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div id={id} role="radiogroup" aria-label={t('language.label')} className="inline-flex overflow-hidden rounded-[4px] border border-line-strong">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          lang={l}
          onClick={() => setLocale(l)}
          className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] ${
            locale === l ? 'bg-accent-soft font-semibold text-accent-ink' : 'bg-surface text-muted hover:text-ink'
          }`}
        >
          <span className="font-mono-code rounded-[3px] border border-current/40 px-1 text-[10px] leading-[16px] font-semibold tracking-wider" aria-hidden="true">
            {l.toUpperCase()}
          </span>
          {LOCALE_NAME[l]}
        </button>
      ))}
    </div>
  );
}

/** The language an event or an assignment uses for the AI's feedback and for interviews about its submissions. */
export function ContestLanguageField({ value, onChange }: { value: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-3.5">
      <div className="max-w-md">
        <label htmlFor="contest-language" className="text-[13px] font-semibold text-ink">
          {tr('Language of feedback and interviews')}
        </label>
        <p className="mt-0.5 text-[12px] text-muted">{tr('The AI writes the scores and feedback, and runs the voice interviews, in this language.')}</p>
      </div>
      <select
        id="contest-language"
        value={value}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="cursor-pointer rounded-[4px] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The language of the interview the candidate is about to start (where they may choose it). */
export function InterviewLanguageField({ value, onChange, hint }: { value: Locale; onChange: (l: Locale) => void; hint?: string }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <span className="font-semibold text-ink">{tr('Interview language')}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="cursor-pointer rounded-[4px] border border-line-strong bg-surface px-2 py-1 text-[12px] text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAME[l]}
          </option>
        ))}
      </select>
      {hint && <span>{hint}</span>}
    </label>
  );
}

/** Code every participant starts from: the similarity check never counts it as a copy. */
export function StarterRepoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
      <label htmlFor="starter-repo" className="text-[13px] font-semibold text-ink">
        {tr('Starter code repository (optional)')}
      </label>
      <input
        id="starter-repo"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://github.com/owner/template"
        className="font-mono-code w-full rounded-[4px] border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint"
      />
      <p className="text-[12px] text-muted">{tr('The code you give everyone to start from. The similarity check ignores it, so it never counts as a copy.')}</p>
    </div>
  );
}
