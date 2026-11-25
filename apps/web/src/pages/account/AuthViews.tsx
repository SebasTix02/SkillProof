import { tr } from '../../i18n';
import { rich } from '../../i18n/rich';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Notice } from '../../components/shared';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { AuthPortalShell } from './AuthPortalShell';

export function LogIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) return setError(err.message);
    const next = params.get('next');
    navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/events');
  }

  return (
    <AuthPortalShell
      mode="login"
      title={tr('Authentication Dossier')}
      subtitle={tr('Sign in with your registered email and passphrase')}
      statusText={tr('Ready for Session Handshake')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={tr('Identity Email')}>
          <Input
            required
            type="email"
            className="font-mono-code"
            placeholder={tr('developer@institution.edu')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase">
              {tr('Secret Passphrase')}
            </label>
            <Link to="/forgot-password" className="font-mono-code text-[11px] font-medium text-accent hover:underline">
              {tr('Forgot passphrase?')}
            </Link>
          </div>
          <div className="relative flex items-center">
            <Input
              id="login-password"
              required
              type={showPassword ? 'text' : 'password'}
              className="font-mono-code pr-10"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              aria-label={tr('Toggle password visibility')}
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2.5 cursor-pointer p-1 text-muted hover:text-ink"
            >
              <span className="material-symbols-outlined text-[18px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" disabled={busy} loading={busy} className="w-full py-2.5">
          <span>{busy ? tr('Authenticating…') : tr('Authenticate with Identity')}</span>
          <span className="arrow-nudge font-mono-code text-[12px]">→</span>
        </Button>

        <p className="pt-1 text-center text-[12px] text-muted">
          {tr('New to SkillProof?')}{' '}
          <Link to="/signup" className="font-semibold text-accent hover:underline">
            {tr('Create an account')}
          </Link>
        </p>
      </form>
    </AuthPortalShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  return (
    <AuthPortalShell
      mode="recovery"
      title={tr('Reset your passphrase')}
      subtitle={tr('We email you a link to choose a new passphrase')}
      statusText={sent ? tr('Recovery Link Dispatched') : tr('Recovery Dispatch Standby')}
      badgeLabel={sent ? tr('DISPATCH VERIFIED') : tr('RECOVERY MODE')}
    >
      {sent ? (
        <div className="space-y-4">
          <Notice tone="good">
            {rich(tr('If an account exists for {email}, a password reset link is on its way.'), { email: <strong className="font-mono-code">{email}</strong> })}
          </Notice>
          <p className="text-[13px] text-muted">
            <Link to="/login" className="font-semibold text-accent hover:underline">
              {tr('← Return to Sign In')}
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={tr('Registered Identity Email')} hint={tr('We will send a single-use recovery link to this address.')}>
            <Input
              required
              type="email"
              className="font-mono-code"
              placeholder={tr('developer@institution.edu')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy} loading={busy} className="w-full py-2.5">
            <span>{busy ? tr('Sending recovery link…') : tr('Send Recovery Link')}</span>
            <span className="arrow-nudge font-mono-code text-[12px]">→</span>
          </Button>
          <p className="pt-1 text-center text-[12px] text-muted">
            {tr('Remembered your passphrase?')}{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              {tr('Back to Sign In')}
            </Link>
          </p>
        </form>
      )}
    </AuthPortalShell>
  );
}

export function ResetPassword() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    navigate('/events');
  }

  if (!loading && !session) {
    return (
      <AuthPortalShell
        mode="recovery"
        title={tr('Reset your passphrase')}
        subtitle={tr('Recovery token expired or invalid')}
        statusText={tr('Token Invalid')}
        badgeLabel={tr('EXPIRED')}
      >
        <Notice tone="error">
          {rich(tr('This reset link is no longer valid. {link}.'), {
            link: (
              <Link to="/forgot-password" className="font-semibold underline">
                {tr('Request a new recovery link')}
              </Link>
            ),
          })}
        </Notice>
      </AuthPortalShell>
    );
  }

  return (
    <AuthPortalShell
      mode="recovery"
      title={tr('Choose a new passphrase')}
      subtitle={tr('Enter a new passphrase for your SkillProof identity')}
      statusText={tr('Recovery Session Active')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={tr('New Passphrase')} hint={tr('At least 8 characters.')}>
          <Input
            required
            type="password"
            minLength={8}
            className="font-mono-code"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy || loading} loading={busy} className="w-full py-2.5">
          {busy ? tr('Saving passphrase…') : tr('Save New Passphrase')}
        </Button>
      </form>
    </AuthPortalShell>
  );
}

/** Landing point of the confirmation email. Supabase puts the session in the URL; we wait for it and move on. */
export function AuthCallback() {
  const { session, loading, org } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (session) navigate(org ? '/org/events' : '/events', { replace: true });
  }, [session, loading, org, navigate]);

  if (!loading && !session) {
    return (
      <AuthPortalShell
        mode="login"
        title={tr('Email Confirmed')}
        subtitle={tr('Your account is ready')}
        statusText={tr('Email Verified')}
        badgeLabel={tr('VERIFIED')}
      >
        <div className="space-y-4">
          <Notice tone="good">{tr('Your email address is confirmed.')}</Notice>
          <Link
            to="/login"
            className="btn-tactile inline-flex w-full items-center justify-center gap-2 rounded-[4px] border border-accent bg-accent px-4 py-2.5 text-[13px] font-medium text-on-accent hover:bg-accent-hover"
          >
            <span>{tr('Continue to Sign In')}</span>
            <span className="arrow-nudge font-mono-code text-[12px]">→</span>
          </Link>
        </div>
      </AuthPortalShell>
    );
  }

  return <p className="font-mono-code py-16 text-center text-[12px] text-muted">{tr('VERIFYING SESSION HANDSHAKE…')}</p>;
}
