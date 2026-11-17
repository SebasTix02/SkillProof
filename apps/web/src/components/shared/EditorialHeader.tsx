import type { ReactNode } from 'react';
import { DOSSIER_THEMES, type DossierThemeKey } from './tokens';

export function DossierPageHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  borderBottom = true,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  borderBottom?: boolean;
}) {
  return (
    <header
      className={`flex flex-col justify-between gap-4 md:flex-row md:items-end ${
        borderBottom ? 'border-b border-line pb-5' : ''
      }`}
    >
      <div className="space-y-1.5">
        {eyebrow && <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">{eyebrow}</div>}
        <h1 className="font-serif-heading text-[30px] leading-[36px] font-medium tracking-tight text-ink sm:text-[36px] sm:leading-[42px]">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-3xl text-[14px] leading-[22px] text-muted sm:text-[15px] sm:leading-[24px]">
            {subtitle}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{rightSlot}</div>}
    </header>
  );
}

export function SectionHeader({
  eyebrow,
  eyebrowTone = 'muted',
  title,
  subtitle,
  rightSlot,
}: {
  eyebrow?: ReactNode;
  eyebrowTone?: 'accent' | 'good' | 'warn' | 'muted';
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
}) {
  const toneClass =
    eyebrowTone === 'accent'
      ? 'text-accent'
      : eyebrowTone === 'good'
        ? 'text-good'
        : eyebrowTone === 'warn'
          ? 'text-warn'
          : 'text-muted';

  return (
    <div className="flex flex-col justify-between gap-2 border-b border-line pb-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <span className={`font-mono-code mb-1 block text-[11px] font-semibold tracking-wider uppercase ${toneClass}`}>
            {eyebrow}
          </span>
        )}
        <h2 className="font-serif-heading text-[22px] leading-[28px] font-medium text-ink sm:text-[26px] sm:leading-[32px]">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {rightSlot && <div className="flex shrink-0 items-center gap-2">{rightSlot}</div>}
    </div>
  );
}

export function NumberedSectionCard({
  id,
  number,
  icon,
  title,
  subtitle,
  sectionTag,
  theme = 'cobalt',
  children,
}: {
  id?: string;
  number?: string;
  icon?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  sectionTag?: ReactNode;
  theme?: DossierThemeKey;
  children: ReactNode;
}) {
  const t = DOSSIER_THEMES[theme];
  return (
    <section id={id} className={`overflow-hidden rounded-[6px] border bg-white ${t.cardBorder}`}>
      <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 ${t.headerBg}`}>
        <div className="flex items-center gap-3">
          <div className={`font-mono-code flex h-8 w-8 items-center justify-center rounded-[4px] text-[13px] font-bold ${t.iconBg}`}>
            {icon ? <span className="material-symbols-outlined text-[18px]">{icon}</span> : number}
          </div>
          <div>
            <h2 className="font-serif-heading text-[21px] leading-tight font-medium text-ink">{title}</h2>
            {subtitle && <p className="text-[12px] text-muted">{subtitle}</p>}
          </div>
        </div>
        {sectionTag && (
          <span className={`font-mono-code rounded-[3px] border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${t.pillClass}`}>
            {sectionTag}
          </span>
        )}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}
