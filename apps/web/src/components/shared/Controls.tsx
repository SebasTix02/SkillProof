import { useState, type ReactNode } from 'react';

export function ToggleSwitch({
  checked,
  onChange,
  activeColorClass = 'peer-checked:bg-accent',
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  activeColorClass?: string;
  id?: string;
}) {
  return (
    <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div
        className={`h-6 w-11 rounded-full bg-line after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-line after:bg-white after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white ${activeColorClass}`}
      />
    </label>
  );
}

export function CopyLinkButton({
  value,
  label = 'Copy Link',
  copiedLabel = 'Copied!',
  icon = 'content_copy',
  onCopied,
  variant = 'outline',
  className = '',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  icon?: string;
  onCopied?: () => void;
  variant?: 'outline' | 'primary' | 'indigo' | 'dark';
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopied?.();
    }
  }

  const base = 'btn-tactile font-mono-code inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border px-3.5 py-1.5 text-[11px] font-semibold';
  const variantClass =
    variant === 'primary'
      ? 'border-accent bg-accent text-white hover:bg-accent-hover'
      : variant === 'indigo'
        ? 'border-[#4338CA] bg-[#4338CA] text-white hover:bg-[#3730A3]'
        : variant === 'dark'
          ? 'border-white/15 bg-white/10 text-white hover:bg-white/20'
          : 'border-line bg-white text-ink hover:border-accent hover:text-accent';

  return (
    <button type="button" onClick={() => void handleCopy()} className={`${base} ${variantClass} ${className}`}>
      <span className="material-symbols-outlined text-[15px]">{copied ? 'check' : icon}</span>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}

export interface TabItem<K extends string> {
  key: K;
  label: string;
  count?: number;
  icon?: string;
}

export function TabStrip<K extends string>({
  tabs,
  active,
  onChange,
  rightSlot,
}: {
  tabs: readonly TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  rightSlot?: ReactNode;
}) {
  return (
    <section className="flex flex-col justify-between gap-4 border-b border-line pb-3 md:flex-row md:items-center">
      <div className="flex flex-wrap items-center gap-6">
        {tabs.map((item) => {
          const isCurrent = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={`relative -mb-3 flex cursor-pointer items-center gap-1.5 border-b-2 pb-3 text-[13px] transition-colors ${
                isCurrent
                  ? 'border-accent font-semibold text-ink'
                  : 'border-transparent font-medium text-muted hover:text-ink'
              }`}
            >
              {item.icon && <span className="material-symbols-outlined text-[16px]">{item.icon}</span>}
              <span>{item.label}</span>
              {typeof item.count === 'number' && (
                <span
                  className={`font-mono-code rounded-[3px] border px-1.5 py-0.2 text-[11px] font-bold ${
                    isCurrent ? 'border-accent/25 bg-accent-soft text-accent' : 'border-line bg-paper text-muted'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightSlot && <div className="flex flex-wrap items-center gap-2.5">{rightSlot}</div>}
    </section>
  );
}

export function DarkBanner({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-[6px] border border-[#262B34] bg-[#0D0F12] p-6 text-white sm:p-8 ${className}`}
    >
      {children}
    </section>
  );
}

export function LedgerAnchorBanner({
  badge = 'MERKLE PROVEN',
  meta = 'CRYPTOGRAPHIC ATTESTATION // ED25519',
  title = 'Cryptographically Anchored Evaluation Ledger',
  description = 'Every rubric score, commit SHA freeze, and oral defense report is recorded with tamper-evident audit metadata.',
  actions,
}: {
  badge?: string;
  meta?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col justify-between gap-5 rounded-[6px] border border-line bg-white p-6 md:flex-row md:items-center">
      <div className="space-y-1.5">
        <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 font-bold text-good uppercase">
            {badge}
          </span>
          <span className="text-muted">{meta}</span>
        </div>
        <h3 className="font-serif-heading text-[20px] font-medium text-ink">{title}</h3>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </section>
  );
}
