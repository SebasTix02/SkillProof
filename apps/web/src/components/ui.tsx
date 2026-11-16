import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:bg-[#184bd1]',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-paper',
        variant === 'danger' && 'bg-bad text-white hover:opacity-90',
        className,
      )}
    />
  );
}

export const linkButton =
  'inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-[#184bd1]';
export const linkButtonSecondary =
  'inline-flex items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper';

const field = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx(field, props.className)} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={cx(field, props.className)} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx(field, props.className)} />;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-line bg-white p-5', className)}>{children}</section>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'good' | 'warn'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-3 py-2 text-sm',
        tone === 'info' && 'border-line bg-accent-soft text-ink',
        tone === 'error' && 'border-bad/30 bg-bad/5 text-bad',
        tone === 'good' && 'border-good/30 bg-good/5 text-good',
        tone === 'warn' && 'border-warn/30 bg-warn/5 text-warn',
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-paper text-muted ring-1 ring-line',
        tone === 'good' && 'bg-good/10 text-good',
        tone === 'warn' && 'bg-warn/10 text-warn',
        tone === 'bad' && 'bg-bad/10 text-bad',
        tone === 'accent' && 'bg-accent-soft text-accent',
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </span>
  );
}

export function PageState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="py-16 text-center"><Spinner /></div>;
  if (error) return <div className="py-8"><Notice tone="error">{error}</Notice></div>;
  return null;
}

export function Layout({ children }: { children: ReactNode }) {
  const { session, me, org, signOut } = useAuth();
  const nav = ({ isActive }: { isActive: boolean }) => cx('rounded-md px-2 py-1 text-sm', isActive ? 'text-ink font-medium' : 'text-muted hover:text-ink');
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="text-base font-semibold tracking-tight">
            Skill<span className="text-accent">Proof</span>
          </Link>
          {session && (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
              <NavLink to="/events" className={nav}>Events</NavLink>
              <NavLink to="/interview/new" className={nav}>Interviews</NavLink>
              {org && <NavLink to="/org/events" className={nav}>{org.name}</NavLink>}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            {session ? (
              <>
                <NavLink to="/me" className={nav}>{me?.profile.display_name || 'Account'}</NavLink>
                <button onClick={() => void signOut()} className="text-sm text-muted hover:text-ink">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm text-muted hover:text-ink">Log in</Link>
                <Link to="/signup" className={linkButton}>Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
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
