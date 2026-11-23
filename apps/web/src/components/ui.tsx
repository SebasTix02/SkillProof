import { formatDateTime, tr } from '../i18n';
import { PreferenceControls } from './ThemeControl';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useDelayed } from '../lib/loading';
import { AppShell, Logo, TopProgress } from './AppShell';
import { PageSkeleton, type PageSkeletonKind } from './shared/Skeleton';
import { TONE_CLASS } from './shared/tokens';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  loading = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Shows a small spinner and disables the button while its action runs. */
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'btn-tactile inline-flex cursor-pointer items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-surface text-ink hover:border-muted hover:bg-paper',
        variant === 'danger' && 'border border-bad bg-bad text-on-bad hover:border-bad-hover hover:bg-bad-hover',
        variant === 'ghost' && 'border border-transparent bg-transparent text-muted hover:bg-paper hover:text-ink',
        className,
      )}
    >
      {loading && (
        <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
      )}
      {children}
    </button>
  );
}

export const linkButton =
  'btn-tactile inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-on-accent hover:border-accent-hover hover:bg-accent-hover';
export const linkButtonSecondary =
  'btn-tactile inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper';

const field =
  'w-full rounded-[4px] border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono-code mb-1.5 block text-[11px] font-semibold tracking-wider text-ink uppercase">{label}</span>
      {children}
      {hint && <span className="font-mono-code mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx(field, props.className)} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={cx(field, props.className)} />;
/** Size and layout classes go on the wrapper (so the arrow sits inside the box); the rest stay on the <select>. */
const WRAPPER_CLASS = /^(?:[\w-]+:)*(?:w|max-w|min-w|flex|basis|shrink|grow|self|order|col-span|row-span)-/;

/**
 * A native <select> (keyboard, screen readers and the phone's own picker work as usual) drawn like the rest of the
 * fields: its own arrow, a pointer, a stronger border on hover, a dimmed look when disabled. Width classes in
 * `className` (w-64, max-w-xl, flex-1…) size it; `multiple` lists keep the plain look.
 */
export function Select({ className = '', multiple, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  if (multiple) return <select {...props} multiple className={cx(field, className)} />;
  const classes = className.split(/\s+/).filter(Boolean);
  const outer = classes.filter((c) => WRAPPER_CLASS.test(c));
  const inner = classes.filter((c) => !WRAPPER_CLASS.test(c));
  // On the dark headers the select is white on white/10: the arrow follows.
  const onDark = inner.some((c) => /^text-white/.test(c));
  return (
    <span className={cx('relative block', outer.length ? outer.join(' ') : 'w-full')}>
      <select
        {...props}
        className={cx(
          field,
          'cursor-pointer appearance-none pr-9 hover:border-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line-strong',
          inner.join(' '),
        )}
      />
      <span
        className={cx(
          'material-symbols-outlined pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[18px]',
          onDark ? 'text-white/70' : 'text-muted',
        )}
        aria-hidden="true"
      >
        expand_more
      </span>
    </span>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-[6px] border border-line bg-surface p-5', className)}>{children}</section>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'good' | 'warn'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-[4px] border border-line border-l-[3px] bg-surface px-3.5 py-2.5 text-[13px] leading-[20px]',
        tone === 'info' && 'border-l-accent bg-accent-soft/40 text-ink',
        tone === 'error' && 'border-bad/40 border-l-bad bg-bad-surface text-bad',
        tone === 'good' && 'border-good/30 border-l-good bg-good-soft/60 text-good-ink',
        tone === 'warn' && 'border-warn/30 border-l-warn bg-warn-soft/60 text-warn-ink',
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        TONE_CLASS[tone].chip,
      )}
    >
      {dot && (
        <span
          className={cx('h-1.5 w-1.5 rounded-full', TONE_CLASS[tone].dot)}
        />
      )}
      {children}
    </span>
  );
}

export function Spinner({ label = tr('Loading') }: { label?: string }) {
  return (
    <span className="font-mono-code inline-flex items-center gap-2 text-[12px] text-muted" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

/**
 * Loading or error state of a page (or a block of one). While loading it shows the skeleton of `kind`, only after
 * 150 ms so quick loads do not flicker.
 */
export function PageState({ loading, error, kind = 'page' }: { loading: boolean; error: string | null; kind?: PageSkeletonKind }) {
  const slow = useDelayed(loading);
  if (loading) return slow ? <PageSkeleton kind={kind} /> : <div aria-busy="true" className="min-h-[40vh]" />;
  if (error)
    return (
      <div className="py-8">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  return null;
}

/** Pages that keep the public header even when signed in. */
const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback'];

/**
 * Signed in: the app shell with the side menu (AppShell). Signed out, and on the landing and sign-in pages: a simple
 * public header.
 */
export function Layout({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';

  if (session && !PUBLIC_PATHS.includes(location.pathname)) return <AppShell>{children}</AppShell>;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <TopProgress />
      <a
        href="#main"
        className="sr-only z-[60] rounded-[4px] bg-accent px-3 py-2 text-[13px] font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {tr('Skip to content')}
      </a>
      <header className="no-print sticky top-0 z-50 h-14 border-b border-line bg-surface">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Logo />
            <span className="hidden h-4 w-[1px] bg-line sm:inline-block" />
            <div className="hidden items-center gap-2 xl:flex">
              <span className="status-dot-live bg-good text-good" />
              <span className="font-mono-code text-[11px] tracking-wider whitespace-nowrap text-muted uppercase">
                {tr('Commit-frozen judging // Gemini AI')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {isLanding && (
              <nav className="mr-2 hidden items-center gap-5 text-[13px] font-medium whitespace-nowrap text-muted lg:flex" aria-label={tr('Sections')}>
                <a href="#specimen" className="transition-colors hover:text-accent">
                  {tr('Forensic AST')}
                </a>
                <a href="#organizers" className="transition-colors hover:text-accent">
                  {tr('Workflows')}
                </a>
                <a href="#registry" className="transition-colors hover:text-accent">
                  {tr('Dossier Registry')}
                </a>
              </nav>
            )}

            <PreferenceControls />
            {session ? (
              <>
                <Link to="/events" className={cx(linkButton, 'px-3.5 py-1.5 text-[12px] whitespace-nowrap')}>
                  <span>{tr('Open app')}</span>
                  <span className="arrow-nudge font-mono-code text-[11px]">→</span>
                </Link>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted hover:border-muted hover:bg-paper hover:text-ink"
                >
                  {tr('SIGN OUT')}
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn-tactile font-mono-code rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[12px] font-medium whitespace-nowrap text-ink hover:border-muted hover:bg-paper"
                >
                  {tr('Log in')}
                </Link>
                <Link to="/signup" className={cx(linkButton, 'px-3.5 py-1.5 text-[12px] whitespace-nowrap')}>
                  <span>{tr('Sign up')}</span>
                  <span className="arrow-nudge font-mono-code text-[11px]">→</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1240px] px-4 py-8 focus:outline-none sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}

export function formatDate(iso: string): string {
  return formatDateTime(iso);
}

export function scoreTone(score: number | null | undefined, max = 10): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score == null) return 'neutral';
  const ratio = score / max;
  return ratio >= 0.7 ? 'good' : ratio >= 0.45 ? 'warn' : 'bad';
}
