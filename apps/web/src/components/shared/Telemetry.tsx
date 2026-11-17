import type { ReactNode } from 'react';

const TONE_DOT: Record<'good' | 'accent' | 'warn' | 'bad' | 'muted' | 'mint', string> = {
  good: 'bg-good text-good',
  accent: 'bg-accent text-accent',
  warn: 'bg-warn text-warn',
  bad: 'bg-bad text-bad',
  muted: 'bg-muted text-muted',
  mint: 'bg-[#79d9ae] text-[#79d9ae]',
};

export function LiveDot({
  tone = 'good',
  pulse = true,
  className = '',
}: {
  tone?: keyof typeof TONE_DOT;
  pulse?: boolean;
  className?: string;
}) {
  if (!pulse) {
    return <span className={`inline-block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone].split(' ')[0]} ${className}`} />;
  }
  return <span className={`status-dot-live ${TONE_DOT[tone]} ${className}`} />;
}

export function ScoreBar({
  value,
  max = 100,
  tone = 'good',
  heightClass = 'h-1.5',
  trackClass = 'bg-line',
}: {
  value: number | null | undefined;
  max?: number;
  tone?: 'good' | 'accent' | 'warn' | 'bad' | 'ink';
  heightClass?: string;
  trackClass?: string;
}) {
  const ratio = value != null && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fillClass =
    tone === 'good'
      ? 'bg-good'
      : tone === 'accent'
        ? 'bg-accent'
        : tone === 'warn'
          ? 'bg-warn'
          : tone === 'bad'
            ? 'bg-bad'
            : 'bg-ink';

  return (
    <div className={`w-full overflow-hidden rounded-full ${heightClass} ${trackClass}`}>
      <div className={`score-bar-fill h-full w-full ${fillClass}`} style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}

export function KpiGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`grid grid-cols-1 divide-y divide-line overflow-hidden rounded-[6px] border border-line bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function KpiCell({
  label,
  icon,
  badge,
  children,
  footer,
  tinted = false,
}: {
  label: string;
  icon?: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div className={`flex flex-col justify-between space-y-2.5 p-5 ${tinted ? 'bg-[#FBFDFB]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{label}</span>
        {badge ?? (icon ? <span className="material-symbols-outlined text-[18px] text-accent">{icon}</span> : null)}
      </div>
      <div>{children}</div>
      {footer && <div className="font-mono-code border-t border-line pt-2 text-[11px] text-muted">{footer}</div>}
    </div>
  );
}

export function MetricTile({
  label,
  value,
  sub,
  valueClassName = 'font-mono-code text-[15px] font-bold text-ink',
  className = '',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-[4px] border border-line bg-paper p-3 ${className}`}>
      <div className="font-mono-code text-[10px] tracking-wider text-muted uppercase">{label}</div>
      <div className={`mt-0.5 ${valueClassName}`}>{value}</div>
      {sub && <div className="font-mono-code mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

export function TopAccentKpiCard({
  accent = 'cobalt',
  eyebrow,
  icon,
  value,
  unit,
  description,
  progress,
  footerLeft,
  footerRight,
}: {
  accent?: 'cobalt' | 'emerald' | 'amber' | 'indigo';
  eyebrow: string;
  icon: string;
  value: ReactNode;
  unit?: ReactNode;
  description?: ReactNode;
  progress?: number;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
}) {
  const palette = {
    cobalt: {
      border: 'border-accent/25',
      bar: 'bg-accent',
      label: 'text-accent',
      iconPill: 'bg-accent-soft text-accent',
      scoreTone: 'accent' as const,
    },
    emerald: {
      border: 'border-good/30',
      bar: 'bg-good',
      label: 'text-good',
      iconPill: 'bg-good-soft text-good',
      scoreTone: 'good' as const,
    },
    amber: {
      border: 'border-warn/30',
      bar: 'bg-warn',
      label: 'text-warn',
      iconPill: 'bg-warn-soft text-warn',
      scoreTone: 'warn' as const,
    },
    indigo: {
      border: 'border-[#C7D2FE]',
      bar: 'bg-[#4338CA]',
      label: 'text-[#4338CA]',
      iconPill: 'bg-[#EEF2FF] text-[#4338CA]',
      scoreTone: 'accent' as const,
    },
  }[accent];

  return (
    <div
      className={`relative flex flex-col justify-between space-y-3 overflow-hidden rounded-[6px] border bg-white p-4 ${palette.border}`}
    >
      <div className={`absolute top-0 right-0 left-0 h-[3px] ${palette.bar}`} />
      <div className="flex items-center justify-between pt-0.5">
        <span className={`font-mono-code text-[11px] font-semibold tracking-wider uppercase ${palette.label}`}>
          {eyebrow}
        </span>
        <span className={`material-symbols-outlined rounded-[4px] p-1.5 text-[17px] ${palette.iconPill}`}>{icon}</span>
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-serif-heading text-[28px] leading-none font-semibold tracking-tight text-ink">
            {value}
          </span>
          {unit && <span className="font-mono-code text-[12px] font-medium text-muted">{unit}</span>}
        </div>
        {description && <p className="mt-1 text-[12px] leading-snug text-muted">{description}</p>}
      </div>

      {typeof progress === 'number' && (
        <ScoreBar value={progress} max={100} tone={palette.scoreTone} heightClass="h-1.5" />
      )}

      {(footerLeft || footerRight) && (
        <div className="font-mono-code flex items-center justify-between border-t border-line pt-2 text-[11px]">
          <span className="text-muted uppercase">{footerLeft}</span>
          <span className={`font-semibold ${palette.label}`}>{footerRight}</span>
        </div>
      )}
    </div>
  );
}

const DEFAULT_EQUALIZER_BARS = [35, 50, 70, 85, 60, 40, 65, 90, 100, 75, 55, 30, 60, 45, 25, 18];

export function WaveformVisualizer({
  bars = DEFAULT_EQUALIZER_BARS,
  active = false,
  variant = 'light',
}: {
  bars?: number[];
  active?: boolean;
  variant?: 'light' | 'dark';
}) {
  if (variant === 'dark') {
    return (
      <div className="flex h-11 items-center justify-between gap-1 px-1" aria-label="Audio Waveform Visualizer">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`w-1 rounded-full ${active ? (i < 10 ? 'bg-accent' : 'bg-white/75') : 'bg-white/25'}`}
            style={{ height: `${Math.max(8, Math.round((h / 100) * 44))}px` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-label="Microphone Amplitude Visualizer"
      className="flex h-8 items-end justify-between gap-1 rounded-[3px] border border-line bg-[#F0F6FF] p-1"
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-full bg-accent transition-transform duration-200"
          style={{
            height: '100%',
            transformOrigin: 'bottom',
            transform: `scaleY(${active ? h / 100 : 0.2})`,
          }}
        />
      ))}
    </div>
  );
}
