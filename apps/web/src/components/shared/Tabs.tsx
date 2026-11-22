import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * One option of a Tabs control. `to` turns it into a link (sections that are routes: the strip becomes a <nav> with
 * aria-current). `count` shows a chip next to the label (a number, or a short text such as "30%").
 */
export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: string;
  count?: number | string;
  to?: string;
  disabled?: boolean;
  title?: string;
}

/**
 * - underline: sections of a page, each with its own panel (role tablist). The default.
 * - segmented: two to four mutually exclusive options in a sunken track (role radiogroup).
 * - chips: filters over a list, wrapping when there are many (role radiogroup).
 */
export type TabsVariant = 'underline' | 'segmented' | 'chips';

const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ui';

function countChip(active: boolean, variant: TabsVariant): string {
  if (active) return variant === 'underline' ? 'border-accent-ui/40 bg-accent-soft text-accent-ink' : 'border-accent-ui/40 bg-surface text-accent-ink';
  return variant === 'segmented' ? 'border-line bg-surface text-muted' : 'border-line bg-well text-muted';
}

function itemClass(variant: TabsVariant, size: 'md' | 'sm', active: boolean, disabled: boolean): string {
  const state = disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer';
  if (variant === 'underline') {
    const pad = size === 'sm' ? 'px-3 py-2 text-[12px]' : 'px-3.5 py-2.5 text-[13px]';
    return `group relative -mb-px inline-flex shrink-0 items-center gap-2 rounded-t-[4px] border-b-2 whitespace-nowrap transition-colors ${pad} ${state} ${
      active
        ? 'border-accent-ui font-semibold text-ink'
        : `border-transparent font-medium text-muted ${disabled ? '' : 'hover:border-line-strong hover:bg-well hover:text-ink'}`
    }`;
  }
  if (variant === 'segmented') {
    const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]';
    return `inline-flex items-center justify-center gap-1.5 rounded-[3px] border whitespace-nowrap transition-colors ${pad} ${state} ${
      active
        ? 'border-line-strong bg-surface font-semibold text-ink'
        : `border-transparent font-medium text-muted ${disabled ? '' : 'hover:bg-surface/60 hover:text-ink'}`
    }`;
  }
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-[12px]';
  return `inline-flex items-center gap-1.5 rounded-full border whitespace-nowrap transition-colors ${pad} ${state} ${
    active
      ? 'border-accent-ui bg-accent-soft font-semibold text-accent-ink'
      : `border-line-strong bg-surface font-medium text-muted ${disabled ? '' : 'hover:border-muted hover:bg-well hover:text-ink'}`
  }`;
}

/**
 * Tabs, segmented controls and filter chips with one look and one keyboard model: Left/Right (and Up/Down) move and
 * select, Home/End jump to the ends, only the selected option is in the Tab order. Each option looks pressable at
 * rest (padding, hover background, a preview of the underline or a border) and the selected one is unmistakable
 * (accent bar or raised surface, accent icon, accent count).
 */
export function Tabs<K extends string>({
  tabs,
  active,
  onChange,
  variant = 'underline',
  size = 'md',
  ariaLabel,
  rightSlot,
  idBase,
  className = '',
}: {
  tabs: readonly TabItem<K>[];
  active: K | null;
  onChange?: (key: K) => void;
  variant?: TabsVariant;
  size?: 'md' | 'sm';
  ariaLabel: string;
  rightSlot?: ReactNode;
  /** With tabs that have panels: tab ids are `${idBase}-tab-${key}` and they point at `${idBase}-panel-${key}`. */
  idBase?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const isNav = tabs.some((t) => t.to);
  const isTabs = variant === 'underline';

  const onKeyDown = (e: KeyboardEvent) => {
    if (isNav) return;
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    const current = tabs.findIndex((t) => t.key === active);
    const pos = Math.max(0, enabled.indexOf(current));
    let next: number | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    onChange?.(tabs[next]!.key);
    refs.current[next]?.focus();
  };

  const list = (
    <div
      role={isNav ? undefined : isTabs ? 'tablist' : 'radiogroup'}
      aria-label={isNav ? undefined : ariaLabel}
      onKeyDown={onKeyDown}
      className={
        variant === 'underline'
          ? 'flex min-w-0 items-end gap-1 overflow-x-auto'
          : variant === 'segmented'
            ? 'inline-flex flex-wrap items-center gap-0.5 rounded-[4px] border border-line bg-well p-0.5'
            : 'flex flex-wrap items-center gap-1.5'
      }
    >
      {tabs.map((t, i) => {
        const selected = t.key === active;
        const content = (
          <>
            {t.icon && (
              <span
                className={`material-symbols-outlined ${size === 'sm' ? 'text-[16px]' : 'text-[18px]'} ${
                  selected ? 'text-accent-ui' : 'text-muted group-hover:text-ink'
                }`}
                aria-hidden="true"
              >
                {t.icon}
              </span>
            )}
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className={`font-mono-code min-w-[20px] rounded-[3px] border px-1.5 text-center text-[11px] leading-[18px] font-semibold ${countChip(selected, variant)}`}>
                {t.count}
              </span>
            )}
          </>
        );
        const cls = `${itemClass(variant, size, selected, !!t.disabled)} ${focusRing}`;
        if (t.to && !t.disabled) {
          return (
            <Link
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              to={t.to}
              title={t.title}
              aria-current={selected ? 'page' : undefined}
              className={cls}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={isNav ? undefined : isTabs ? 'tab' : 'radio'}
            id={idBase ? `${idBase}-tab-${t.key}` : undefined}
            aria-controls={idBase && isTabs ? `${idBase}-panel-${t.key}` : undefined}
            aria-selected={isTabs && !isNav ? selected : undefined}
            aria-checked={!isTabs && !isNav ? selected : undefined}
            tabIndex={isNav || selected || (active === null && i === 0) ? 0 : -1}
            disabled={t.disabled}
            title={t.title}
            onClick={() => onChange?.(t.key)}
            className={cls}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  const body =
    variant === 'underline' ? (
      <div className={`flex flex-col gap-3 border-b border-line md:flex-row md:items-end md:justify-between ${className}`}>
        {list}
        {rightSlot && <div className="flex flex-wrap items-center gap-2.5 pb-2">{rightSlot}</div>}
      </div>
    ) : rightSlot ? (
      <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
        {list}
        <div className="flex flex-wrap items-center gap-2.5">{rightSlot}</div>
      </div>
    ) : className ? (
      <div className={className}>{list}</div>
    ) : (
      list
    );

  return isNav ? <nav aria-label={ariaLabel}>{body}</nav> : body;
}
