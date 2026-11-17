import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      {...props}
      className={cx(
        'btn-tactile inline-flex cursor-pointer items-center justify-center gap-2 rounded-[4px] px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border border-accent bg-accent text-white hover:border-accent-hover hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:border-muted hover:bg-paper',
        variant === 'danger' && 'border border-bad bg-bad text-white hover:border-bad-hover hover:bg-bad-hover',
        variant === 'ghost' && 'border border-transparent bg-transparent text-muted hover:bg-paper hover:text-ink',
        className,
      )}
    />
  );
}

export const linkButton =
  'btn-tactile inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-accent bg-accent px-4 py-2 text-[13px] font-medium text-white hover:border-accent-hover hover:bg-accent-hover';
export const linkButtonSecondary =
  'btn-tactile inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper';

const field =
  'w-full rounded-[4px] border border-line bg-white px-3 py-2 text-[13px] text-ink placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none';

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
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx(field, props.className)} />;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-[6px] border border-line bg-white p-5', className)}>{children}</section>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'good' | 'warn'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-[4px] border border-line border-l-[3px] bg-white px-3.5 py-2.5 text-[13px] leading-[20px]',
        tone === 'info' && 'border-l-accent bg-accent-soft/40 text-ink',
        tone === 'error' && 'border-bad/40 border-l-bad bg-bad-surface text-bad',
        tone === 'good' && 'border-good/30 border-l-good bg-good-soft/60 text-good',
        tone === 'warn' && 'border-warn/30 border-l-warn bg-warn-soft/60 text-warn',
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
        tone === 'neutral' && 'border-line bg-paper text-muted',
        tone === 'good' && 'border-good/30 bg-good-soft text-good',
        tone === 'warn' && 'border-warn/30 bg-warn-soft text-warn',
        tone === 'bad' && 'border-bad/30 bg-bad-soft text-bad',
        tone === 'accent' && 'border-accent/25 bg-accent-soft text-accent',
      )}
    >
      {dot && (
        <span
          className={cx(
            'h-1.5 w-1.5 rounded-full',
            tone === 'neutral' && 'bg-muted',
            tone === 'good' && 'bg-good',
            tone === 'warn' && 'bg-warn',
            tone === 'bad' && 'bg-bad',
            tone === 'accent' && 'bg-accent',
          )}
        />
      )}
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="font-mono-code inline-flex items-center gap-2 text-[12px] text-muted" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function PageState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <div className="py-16 text-center">
        <Spinner />
      </div>
    );
  if (error)
    return (
      <div className="py-8">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  const { session, me, org, signOut } = useAuth();
  const location = useLocation();
  const isLanding = location.pathname === '/';

  const nav = ({ isActive }: { isActive: boolean }) =>
    cx(
      'rounded-[4px] px-2.5 py-1 text-[13px] transition-colors',
      isActive ? 'bg-accent-soft font-semibold text-accent' : 'font-medium text-muted hover:bg-paper hover:text-ink',
    );

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-50 h-14 border-b border-line bg-white">
        <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link to="/" className="group flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-line bg-white transition-colors group-hover:border-accent">
                <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className="font-serif-heading text-[18px] font-semibold tracking-tight text-ink">SkillProof</span>
            </Link>

            <span className="hidden h-4 w-[1px] bg-line sm:inline-block" />

            <div className="hidden items-center gap-2 md:flex">
              <span className="status-dot-live bg-good text-good" />
              <span className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                Ledger Spec v1.0.4 // Realtime Attestation
              </span>
            </div>

            {session && (
              <>
                <span className="hidden h-4 w-[1px] bg-line md:inline-block" />
                <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
                  <NavLink to="/events" className={nav}>
                    Events
                  </NavLink>
                  <NavLink to="/interview/new" className={nav}>
                    Interviews
                  </NavLink>
                  {org && (
                    <NavLink to="/org/events" className={nav}>
                      {org.name}
                    </NavLink>
                  )}
                </nav>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            {!session && isLanding && (
              <nav className="mr-2 hidden items-center gap-5 text-[13px] font-medium text-muted lg:flex" aria-label="Sections">
                <a href="#specimen" className="transition-colors hover:text-accent">
                  Forensic AST
                </a>
                <a href="#organizers" className="transition-colors hover:text-accent">
                  Workflows
                </a>
                <a href="#registry" className="transition-colors hover:text-accent">
                  Dossier Registry
                </a>
              </nav>
            )}

            {session ? (
              <>
                <NavLink
                  to="/me"
                  className={({ isActive }) =>
                    cx(
                      'font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      isActive ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-paper text-ink hover:border-muted',
                    )
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-good" />
                  <span>{me?.profile.display_name || 'Account'}</span>
                </NavLink>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-line bg-white px-2.5 py-1 text-[11px] font-medium text-muted hover:border-muted hover:bg-paper hover:text-ink"
                >
                  SIGN OUT
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="btn-tactile font-mono-code rounded-[4px] border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-ink hover:border-muted hover:bg-paper"
                >
                  Log in
                </Link>
                <Link to="/signup" className={cx(linkButton, 'px-3.5 py-1.5 text-[12px]')}>
                  <span>Sign up</span>
                  <span className="arrow-nudge font-mono-code text-[11px]">→</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function scoreTone(score: number | null | undefined, max = 10): 'good' | 'warn' | 'bad' | 'neutral' {
  if (score == null) return 'neutral';
  const ratio = score / max;
  return ratio >= 0.7 ? 'good' : ratio >= 0.45 ? 'warn' : 'bad';
}
