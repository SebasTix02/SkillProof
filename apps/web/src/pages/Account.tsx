import { getLocale, t, tr, trn } from '../i18n';
import { rich } from '../i18n/rich';
import { LanguageChoice } from '../components/LanguageControl';
import { ThemeChoice } from '../components/ThemeControl';
import { useEffect, useState, type FormEvent, type ReactNode, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  CopyLinkButton,
  DarkBanner,
  Field,
  Input,
  LiveDot,
  Notice,
  NumberedSectionCard,
  ToggleSwitch,
  useConfirm,
  TONE_CLASS,
  Tabs,
} from '../components/shared';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/toast';
import { useAuth } from '../lib/auth';
import { isDirty, useUnsavedChanges } from '../lib/dirty';
import { supabase } from '../lib/supabase';

const AUTH_IMAGE = '/images/auth.webp';

function AuthPortalShell({
  mode,
  title,
  subtitle,
  children,
  statusText = tr('Active Session Handshake Ready'),
  badgeLabel = tr('RLS ENFORCED'),
}: {
  mode: 'login' | 'signup' | 'recovery';
  title: string;
  subtitle: string;
  children: ReactNode;
  statusText?: string;
  badgeLabel?: string;
}) {
  const location = useLocation();
  const search = location.search;

  return (
    <div className="mx-auto max-w-[1160px] py-2">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left: Technical Editorial Showcase Hero Card (6 cols) */}
        <section className=" flex flex-col justify-between rounded-[6px] border border-line bg-surface p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
                <span className="status-dot-live bg-accent text-accent" />
                <span>{tr('SECURED BY SUPABASE AUTH')}</span>
              </div>
              <span className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                {tr('SECURE SIGN-IN')}
              </span>
            </div>

            {/* Feature Image Frame */}
            <div className="relative my-3 overflow-hidden rounded-[4px] border border-line bg-paper">
              <img
                src={AUTH_IMAGE}
                alt={tr('SkillProof sign-in')}
                className="block h-[240px] w-full object-cover sm:h-[280px]"
              />
              <div className="flex items-center justify-between border-t border-dark-hairline bg-dark-inset px-4 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-good-on-dark">verified_user</span>
                  <span className="font-mono-code text-[11px] tracking-wide">
                    {tr('Verified Repository & Voice Credential Binding')}
                  </span>
                </div>
                <span className="font-mono-code rounded-[3px] border border-dark-hairline bg-dark-canvas px-2 py-0.5 text-[10px] text-dark-ink">
                  {tr('EMAIL + PASSWORD')}
                </span>
              </div>
            </div>

            {/* Editorial Narrative */}
            <div className="space-y-2 pt-1">
              <h2 className="font-serif-heading text-[22px] leading-[29px] font-medium text-ink sm:text-[26px] sm:leading-[33px]">
                {tr('Evidence-backed scores and voice interviews about your own code.')}
              </h2>
              <p className="text-[13px] leading-[21px] text-muted">
                {tr('Authenticate as a candidate to defend your GitHub repositories in 3-minute voice interviews and publish your recruiter dossier, or register an organization to run commit-locked hackathons.')}
              </p>
            </div>
          </div>

          {/* Protocol Status Footprint */}
          <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-line pt-4 sm:gap-3">
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Session Security')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-ink">{tr('Supabase RLS')}</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Repo Scope')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-good">{tr('Read-Only SHA')}</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">{tr('Oral Engine')}</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-accent">{tr('Gemini Live 3m')}</div>
            </div>
          </div>
        </section>

        {/* Right: Authentication Dossier Portal (6 cols) */}
        <section className="flex flex-col justify-between rounded-[6px] border border-line bg-surface p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-5">
            {/* Header & Identity Icon */}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div className="space-y-1">
                <span className="font-mono-code text-[10px] font-semibold tracking-wider text-accent uppercase">
                  {tr('IDENTITY & ACCESS CONTROL')}
                </span>
                <h1 className="font-serif-heading text-[24px] leading-[30px] font-medium text-ink sm:text-[28px] sm:leading-[34px]">
                  {title}
                </h1>
                <p className="text-[13px] text-muted">{subtitle}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-line bg-paper text-accent">
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
              </div>
            </div>

            {/* Auth Mode Navigation Tabs */}
            <Tabs
              ariaLabel={tr('Account access')}
              size="sm"
              active={mode}
              tabs={[
                { key: 'login', label: tr('Sign In'), icon: 'login', to: `/login${search}` },
                { key: 'signup', label: tr('Request Access / Register'), icon: 'person_add', to: `/signup${search}` },
                { key: 'recovery', label: tr('Reset Key'), icon: 'key', to: '/forgot-password' },
              ]}
            />

            {/* Active Form / View Content */}
            <div className="pt-1">{children}</div>
          </div>

          {/* Cryptographic Signature Status Stamp Card */}
          <div className="mt-6 space-y-2.5 rounded-[4px] border border-line bg-paper p-3.5">
            <div className="font-mono-code flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span className="h-2 w-2 rounded-full bg-good" />
                {tr('Account Security')}
              </span>
              <span className="rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good-ink">
                {badgeLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
              <div>
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Verification Mode')}</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">{tr('Email + role')}</span>
              </div>
              <div className="text-right">
                <span className="font-mono-code block text-[10px] text-muted uppercase">{tr('Status')}</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">{statusText}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function SignUp() {
  const [params] = useSearchParams();
  const [type, setType] = useState<'student' | 'organizer'>(
    params.get('as') === 'organizer' ? 'organizer' : 'student',
  );
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          display_name: name,
          account_type: type,
          organization_name: type === 'organizer' ? orgName : undefined,
          locale: getLocale(),
        },
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    if (data.session) navigate(type === 'organizer' ? '/org/events' : '/events');
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthPortalShell
        mode="signup"
        title={tr('Check your email')}
        subtitle={tr('Identity verification link dispatched')}
        statusText={tr('Awaiting Email Confirmation')}
        badgeLabel={tr('DISPATCH VERIFIED')}
      >
        <div className="space-y-4">
          <Notice tone="good">
            {tr('We sent a confirmation link to')}{' '}<strong className="font-mono-code">{email}</strong>{tr('. Open it to finish creating your SkillProof account.')}
          </Notice>
          <p className="text-[13px] text-muted">
            {tr('Once confirmed, you will be redirected automatically to your workspace. Already confirmed?')}{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              {tr('Proceed to Sign In →')}
            </Link>
          </p>
        </div>
      </AuthPortalShell>
    );
  }

  return (
    <AuthPortalShell
      mode="signup"
      title={tr('Create your account')}
      subtitle={tr('Register your candidate or organizer credential identity')}
      statusText={type === 'organizer' ? tr('Organizer Provisioning') : tr('Candidate Provisioning')}
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Segmented Role Selector */}
        <fieldset>
          <legend className="font-mono-code mb-1.5 block text-[11px] font-semibold tracking-wider text-muted uppercase">
            {tr('Select Operational Role')}
          </legend>
          <div className="grid grid-cols-2 gap-1.5 rounded-[4px] border border-line bg-paper p-1">
            {(
              [
                { key: 'student', label: tr('Candidate / Student'), sub: tr('Prove my skills') },
                { key: 'organizer', label: tr('Organizer / Academic'), sub: tr('Run hackathons') },
              ] as const
            ).map((role) => {
              const active = type === role.key;
              return (
                <label
                  key={role.key}
                  className={`btn-tactile cursor-pointer rounded-[3px] border px-3 py-2 text-center ${
                    active
                      ? 'border-accent bg-surface text-ink font-semibold'
                      : 'border-transparent bg-transparent text-muted hover:text-ink'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    className="sr-only"
                    checked={active}
                    onChange={() => setType(role.key)}
                  />
                  <span className="block text-[12px] leading-tight">{role.label}</span>
                  <span className="font-mono-code mt-0.5 block text-[10px] text-muted">{role.sub}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <Field label={tr('Your Name')}>
          <Input
            required
            maxLength={80}
            placeholder={tr('Alex Rivera')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </Field>

        {type === 'organizer' && (
          <Field
            label={tr('Accreditation / Organization Name')}
            hint={tr('Your hackathon community, university lab, or engineering organization.')}
          >
            <Input
              required
              maxLength={120}
              placeholder={tr('e.g. Stanford ACM, TreeHacks, MIT Blueprint')}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              autoComplete="organization"
            />
          </Field>
        )}

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

        <Field label={tr('Secret Passphrase')} hint={tr('Minimum 8 characters required.')}>
          <div className="relative flex items-center">
            <Input
              required
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              className="font-mono-code pr-10"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
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
        </Field>

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" disabled={busy} loading={busy} className="w-full py-2.5">
          <span>{busy ? tr('Creating account…') : tr('Create Account')}</span>
          <span className="arrow-nudge font-mono-code text-[12px]">→</span>
        </Button>

        <p className="pt-1 text-center text-[12px] text-muted">
          {tr('Already registered?')}{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            {tr('Log in to your dossier')}
          </Link>
        </p>
      </form>
    </AuthPortalShell>
  );
}

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
            {tr('If an account exists for')}{' '}<strong className="font-mono-code">{email}</strong>{tr(', a password reset link is on its way.')}
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

export function MyAccount() {
  const { me, refresh, signOut } = useAuth();
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle');
  // Privacy preferences are saved as soon as they change, and put back if saving fails.
  const [showQuotes, setShowQuotes] = useState(true);
  const [notifyResults, setNotifyResults] = useState(true);
  const [rotatedUrl, setRotatedUrl] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (!me) return;
    setName(me.profile.display_name);
    setHeadline(me.public_profile?.headline ?? '');
    setIsPublic(me.public_profile?.is_public ?? false);
    setShowQuotes(me.public_profile?.show_quotes ?? true);
    setNotifyResults(me.profile.notify_results ?? true);
  }, [me]);

  // Save and Discard only do something when the form differs from what was loaded; leaving asks first.
  const loaded = me ? { name: me.profile.display_name, headline: me.public_profile?.headline ?? '', isPublic: me.public_profile?.is_public ?? false } : null;
  const dirty = !!loaded && isDirty(loaded, { name, headline, isPublic });
  const askToLeave = useCallback(
    () =>
      confirm({
        title: tr('Leave without saving?'),
        body: tr('Your changes to the profile will be lost.'),
        confirmLabel: tr('Leave'),
        cancelLabel: tr('Stay'),
      }),
    [confirm],
  );
  useUnsavedChanges(dirty, askToLeave);

  async function savePreference(field: 'show_quotes' | 'notify_results', value: boolean) {
    const set = field === 'show_quotes' ? setShowQuotes : setNotifyResults;
    set(value);
    try {
      await api('/api/me/profile', { method: 'PATCH', body: { [field]: value } });
      toast.success(field === 'show_quotes' ? (value ? tr('Quotes are shown on your public profile.') : tr('Quotes are hidden from your public profile.')) : value ? tr('You will be told when results are published.') : tr('Result notices are off.'));
      await refresh();
    } catch (err) {
      set(!value);
      toast.error(tr('Could not save your preference. {error}', { error: errorMessage(err) }));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api('/api/me/profile', {
        method: 'PATCH',
        body: { display_name: name, headline, is_public: isPublic },
      });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function discardChanges() {
    if (!me) return;
    setName(me.profile.display_name);
    setHeadline(me.public_profile?.headline ?? '');
    setIsPublic(me.public_profile?.is_public ?? false);
    setError(null);
    setSaved(false);
  }

  /** Gives the public profile a new address, so every link shared before stops working. */
  async function revokePublicAccess() {
    if (!(await confirm({ title: tr('Create a new public link?'), body: tr('Every link you shared before stops working.'), confirmLabel: tr('Create new link'), undoable: false }))) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ slug: string }>('/api/me/profile/rotate-slug', { method: 'POST' });
      const next = `${window.location.origin}/p/${res.slug}`;
      setRotatedUrl(next);
      toast.success(tr('Old links no longer work. Your new public link is ready.'));
      await refresh();
    } catch (err) {
      toast.error(tr('Could not revoke the link. {error}', { error: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function testMicrophone() {
    setMicStatus('testing');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('ok');
    } catch {
      setMicStatus('denied');
    }
  }

  if (!me) return null;
  const slug = me.public_profile?.slug ?? 'candidate';
  const url = me.public_profile ? `${window.location.origin}/p/${me.public_profile.slug}` : null;
  const initials = (name || me.profile.display_name || 'SP')
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');


  return (
    <form onSubmit={submit} className="mx-auto max-w-[1160px] space-y-8">
      {/* 1. Dark Dossier Header & Context Strip */}
      <DarkBanner>
        <div className="flex flex-col space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono-code rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-1 text-[11px] tracking-wider text-accent-on-dark uppercase">
                {tr('Your account')}
              </span>
              <span className="font-mono-code flex items-center gap-2 rounded-[3px] border border-good/40 bg-good/20 px-2.5 py-1 text-[11px] text-good-on-dark">
                <LiveDot tone="mint" />
                <span>{tr('SIGNED IN')}</span>
              </span>
            </div>
            {me.email && (
              <div className="font-mono-code flex items-center gap-2 rounded-[3px] border border-white/10 bg-dark-surface px-3 py-1 text-[11px] text-dark-muted">
                <span>{tr('Signed in as')}</span>
                <span className="font-medium tracking-wide text-accent-on-dark">{me.email}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-[720px] space-y-2">
              <h1 className="font-serif-heading text-[30px] leading-[1.15] font-normal tracking-tight text-white sm:text-[36px]">
                {tr('Account & Verification Identity')}
              </h1>
              <p className="text-[14px] leading-[22px] text-dark-muted sm:text-[15px]">
                {tr('Manage your public recruiter dossier, professional headline, connected verification signals, and access controls.')}
              </p>
            </div>

            {url && (
              <div className="shrink-0 self-start lg:self-auto">
                <Link
                  to={`/p/${slug}`}
                  className="btn-tactile font-mono-code inline-flex items-center gap-2 rounded-[4px] border border-accent bg-accent px-4 py-2.5 text-[12px] font-semibold text-on-accent hover:bg-accent-hover"
                >
                  <span>{tr('PREVIEW PUBLIC DOSSIER')}</span>
                  <span className="material-symbols-outlined text-[16px]">north_east</span>
                </Link>
              </div>
            )}
          </div>

        </div>
      </DarkBanner>

      {/* 2. Main Workspace Grid: Left Index Rail (3 cols) + Right Settings Sections (9 cols) */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left Interactive Index & Proof Status Card */}
        <aside className="sticky top-20 hidden space-y-5 lg:col-span-3 lg:block">
          {/* Sections are reached from the side menu (Account → Profile, Public dossier…), not from a second index. */}
          {/* Cryptographic Seal Card */}
          <div className="space-y-3 rounded-[6px] border border-good/30 bg-good-soft/35 p-4 text-[12px]">
            <div className="font-mono-code flex items-center justify-between text-[11px]">
              <span className="font-semibold text-ink">{tr('PROFILE STATUS')}</span>
              <span className={`inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 font-semibold ${TONE_CLASS[dirty ? 'warn' : 'good'].chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${TONE_CLASS[dirty ? 'warn' : 'good'].dot}`} />
                {dirty ? tr('UNSAVED') : tr('SAVED')}
              </span>
            </div>
            <p className="leading-[19px] text-muted">
              {tr('Profile updates sync directly to your public recruiter dossier at')}{' '}
              <code className="font-mono-code rounded-[2px] border border-line bg-surface px-1 py-0.5 text-[11px] text-ink">
                /p/{slug}
              </code>
              .
            </p>
            <div className="font-mono-code flex flex-col space-y-1 border-t border-good/20 pt-2 text-[10px] text-muted">
              <div className="flex justify-between">
                <span>{tr('EMAIL:')}</span>
                <span className="truncate pl-2 font-medium text-ink">{me.email}</span>
              </div>
              <div className="flex justify-between">
                <span>{tr('ORGANIZATIONS:')}</span>
                <span className="font-semibold text-good">{me.organizations.length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Central Form Content Pane */}
        <div className="space-y-7 lg:col-span-9">
          {/* 01. Public Profile Configuration (Cobalt Accent) */}
          <NumberedSectionCard
            id="section-profile"
            number="01"
            theme="accent"
            title={tr('Public Identity & Recruiter Persona')}
            subtitle={tr('Identity and engineering headline displayed on your public recruiter dossier.')}
            sectionTag={tr('SECTION 01 // IDENTITY')}
          >
            <div className="space-y-5">
              {/* User Persona Preview Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <div className="font-mono-code flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent text-[15px] font-bold text-on-accent">
                      {initials}
                    </div>
                    <span
                      className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-good text-on-good"
                      title={tr('Verified Account')}
                    >
                      <span className="material-symbols-outlined text-[10px]">check</span>
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">
                        {name || me.profile.display_name}
                      </span>
                      <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
                        /p/{slug}
                      </span>
                    </div>
                    <p className="font-mono-code text-[11px] text-muted">{me.email}</p>
                  </div>
                </div>

                {url && (
                  <Link
                    to={`/p/${slug}`}
                    className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                  >
                    <span>{tr('Open Recruiter View')}</span>
                    <span>↗</span>
                  </Link>
                )}
              </div>

              <Field
                label={tr('Full Display Name')}
                hint={tr('Publicly visible to hiring managers, peer review panels, and hackathon judges.')}
              >
                <Input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tr('Alex Rivera')}
                />
              </Field>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="account-headline"
                    className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase"
                  >
                    {tr('Professional Headline & Technical Focus')}
                  </label>
                  <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">
                    {headline.length} / 160
                  </span>
                </div>
                <Input
                  id="account-headline"
                  maxLength={160}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder={tr('Distributed Systems & Infrastructure Engineer • Rust, Go & Consensus Protocols')}
                />
                <p className="font-mono-code text-[11px] text-muted">
                  {tr('One-line summary displayed at the top of your public recruiter dossier alongside oral defense quotes.')}
                </p>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 02. Public Dossier Visibility & Immutable URL (Indigo Accent) */}
          <NumberedSectionCard
            id="section-visibility"
            number="02"
            theme="accent"
            title={tr('Dossier Visibility & Public Address')}
            subtitle={tr('Configure public read-only access for your verified interview reports.')}
            sectionTag={tr('SECTION 02 // PUBLIC LINK')}
          >
            <div className="space-y-5">
              {/* Toggle Switch Card */}
              <div className="flex items-start justify-between gap-4 rounded-[4px] border border-accent/30 bg-accent-soft/45 p-4">
                <div className="space-y-1 pr-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{tr('Enable Public Recruiter Dossier')}</span>
                    <span
                      className={`font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold ${
                        isPublic
                          ? 'border-good/30 bg-good-soft text-good-ink'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      <LiveDot tone={isPublic ? 'good' : 'muted'} pulse={false} />
                      {isPublic ? tr('ACTIVE & RESOLVABLE') : tr('PRIVATE ONLY')}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[19px] text-muted">
                    {tr('When enabled, anyone with your link can view your completed interviews, ownership scores, and cited transcript quotes without logging in.')}
                  </p>
                </div>

                <ToggleSwitch
                  checked={isPublic}
                  onChange={setIsPublic}
                  activeColorClass="peer-checked:bg-accent"
                />
              </div>

              {/* Share Link Read-Only Input Group */}
              {url && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="dossier-url-input"
                      className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase"
                    >
                      {tr('Your Canonical Public Dossier URL')}
                    </label>
                    <span className="font-mono-code rounded-[3px] border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] text-accent-ink">
                      {tr('SLUG:')}{' '}{slug}
                    </span>
                  </div>

                  <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">
                        <span className="material-symbols-outlined text-[17px]">link</span>
                      </span>
                      <input
                        id="dossier-url-input"
                        type="text"
                        readOnly
                        value={url}
                        className="font-mono-code h-10 w-full rounded-[4px] border border-line bg-paper pr-3 pl-9 text-[12px] text-ink select-all focus:border-accent focus:outline-none"
                      />
                    </div>
                    <CopyLinkButton
                      value={url}
                      variant="primary"
                      className="h-10 shrink-0 px-4 text-[12px]"
                    />
                  </div>
                </div>
              )}
            </div>
          </NumberedSectionCard>

          {/* 03. Connected Verification Signals & Organizations (Emerald Accent) */}
          <NumberedSectionCard
            id="section-integrations"
            number="03"
            theme="neutral"
            title={tr('Connected Verification Signals & Hardware')}
            subtitle={tr('Repository analysis engine, organization memberships, and oral defense microphone status.')}
            sectionTag={tr('SECTION 03 // CONNECTIONS')}
          >
            <div className="space-y-4">
              {/* GitHub Repository Analyzer Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-ink text-paper">
                    <span className="material-symbols-outlined text-[20px]">code</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{tr('GitHub Repository Analyzer')}</span>
                      <span className="font-mono-code rounded-[2px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold text-good-ink">
                        {tr('READ-ONLY PUBLIC REPOS')}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {tr('Selective Git tree reader and blob SHA cache active for hackathons and personal interviews.')}
                    </p>
                  </div>
                </div>
                <Link
                  to="/interview/new"
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                >
                  {tr('Start Repo Interview →')}
                </Link>
              </div>

              {/* Organizations & Roles Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-accent/25 bg-accent-soft text-accent-ink">
                    <span className="material-symbols-outlined text-[20px]">corporate_fare</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{tr('Organization Memberships')}</span>
                      <span className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        {trn('{count} ORG', '{count} ORGS', me.organizations.length)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {me.organizations.length > 0
                        ? me.organizations.map((o) => `${o.name} (${o.roles.join(', ')})`).join(' • ')
                        : tr('Standard Candidate Account • Eligible to join public and access-code events.')}
                    </p>
                  </div>
                </div>
                <Link
                  to={me.organizations.length > 0 ? '/org/events' : '/events'}
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                >
                  {me.organizations.length > 0 ? tr('Organizer Console →') : tr('Browse Events →')}
                </Link>
              </div>

              {/* Audio Verification Hardware Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-surface p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-good/30 bg-good-soft text-good-ink">
                    <span className="material-symbols-outlined text-[20px]">mic</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">{tr('Oral Defense Capture Device')}</span>
                      <span
                        className={`font-mono-code rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          micStatus === 'ok'
                            ? 'border-good/30 bg-good-soft text-good-ink'
                            : micStatus === 'denied'
                              ? 'border-bad/30 bg-bad-soft text-bad'
                              : 'border-line bg-paper text-muted'
                        }`}
                      >
                        {micStatus === 'ok'
                          ? tr('PERMISSION GRANTED')
                          : micStatus === 'denied'
                            ? tr('PERMISSION BLOCKED')
                            : tr('READY TO TEST')}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {tr('Browser microphone with echo cancellation & noise suppression for 3-minute Gemini Live exams.')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void testMicrophone()}
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border border-line bg-surface px-3.5 text-[11px] font-semibold text-ink hover:border-good hover:text-good"
                >
                  <span className="material-symbols-outlined text-[15px] text-good">graphic_eq</span>
                  <span>{micStatus === 'testing' ? tr('Checking…') : tr('Test Mic Access')}</span>
                </button>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 04. Appearance: light or dark page, for this browser */}
          <NumberedSectionCard
            id="section-appearance"
            number="04"
            theme="neutral"
            title={t('theme.appearance')}
            subtitle={t('theme.appearanceHint')}
            sectionTag={tr('SECTION 04 // APPEARANCE')}
          >
            <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
              <div className="space-y-1.5">
                <p className="text-[12px] font-semibold text-ink">{t('theme.label')}</p>
                <ThemeChoice />
              </div>
              <div className="space-y-1.5">
                <p className="text-[12px] font-semibold text-ink">{t('language.label')}</p>
                <LanguageChoice id="account-language" />
                <p className="text-[12px] text-muted">{t('language.hint')}</p>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 05. Privacy Controls & Notification Telemetry */}
          <NumberedSectionCard
            id="section-privacy"
            number="05"
            theme="neutral"
            title={tr('Privacy Controls & Verification Telemetry')}
            subtitle={tr('Visibility boundaries for interview attempts and event notifications.')}
            sectionTag={tr('SECTION 05 // PRIVACY')}
          >
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-[4px] border border-line bg-paper/50 p-3.5">
                <input
                  type="checkbox"
                  checked={showQuotes}
                  onChange={(e) => void savePreference('show_quotes', e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
                />
                <div className="space-y-0.5">
                  <span className="block text-[13px] font-semibold text-ink">
                    {tr('Display verbatim transcript quotes on my public profile')}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {tr('Recruiters inspecting your public dossier can read the exact quotes that proved each skill.')}
                  </span>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-[4px] border border-line bg-paper/50 p-3.5">
                <input
                  type="checkbox"
                  checked={notifyResults}
                  onChange={(e) => void savePreference('notify_results', e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer accent-accent"
                />
                <div className="space-y-0.5">
                  <span className="block text-[13px] font-semibold text-ink">
                    {tr('Tell me when results of my events are published')}
                  </span>
                  <span className="block text-[12px] text-muted">
                    {tr('Email notices are coming soon. Your choice is saved and used as soon as they are.')}
                  </span>
                </div>
              </label>

              <div className="flex items-start justify-between gap-4 rounded-[4px] border border-warn/30 bg-warn-soft/45 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">
                      {tr('Hide failed or incomplete interview attempts from public profile')}
                    </span>
                    <span className="font-mono-code rounded-[2px] border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn-ink">
                      {tr('ENFORCED BY PROTOCOL')}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    {tr('Only completed interviews with a finalized ownership report are shown on {path}. Failed or in-progress sessions remain strictly private to your account.', { path: `/p/${slug}` })}
                  </p>
                </div>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 05. Danger Zone & Access Revocation (Crimson Accent) */}
          <NumberedSectionCard
            id="section-danger"
            icon="warning"
            theme="bad"
            title={tr('Danger Zone & Access Revocation')}
            subtitle={tr('Immediate public link revocation and passphrase rotation routines.')}
            sectionTag={tr('SECURITY CONTROLS')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-surface p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                    <span className="material-symbols-outlined text-[18px] text-bad">link_off</span>
                    <span>{tr('Revoke Public Dossier Link')}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    {isPublic
                      ? tr('Moves your dossier from {path} to a new address, so every link you shared before stops working. Your profile stays public.', { path: `/p/${slug}` })
                      : tr('Moves your dossier from {path} to a new address, so every link you shared before stops working. Your profile stays private.', { path: `/p/${slug}` })}
                  </p>
                  {rotatedUrl && (
                    <p className="font-mono-code break-all rounded-[3px] border border-line bg-paper px-2 py-1 text-[11px] text-ink">
                      {tr('New link:')}{' '}{rotatedUrl}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revokePublicAccess()}
                  className="btn-tactile font-mono-code h-9 w-full cursor-pointer rounded-[4px] border border-bad/40 bg-bad-soft text-[11px] font-bold tracking-wider text-bad uppercase hover:bg-bad hover:text-on-bad disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? tr('CREATING NEW LINK…') : tr('REVOKE AND CREATE A NEW LINK')}
                </button>
              </div>

              <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-surface p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                    <span className="material-symbols-outlined text-[18px] text-bad">lock_reset</span>
                    <span>{tr('Passphrase & Session Control')}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    {tr('Rotate your account passphrase or terminate your active browser session immediately.')}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/reset-password"
                    className="btn-tactile font-mono-code flex h-9 items-center justify-center rounded-[4px] border border-line bg-paper text-[11px] font-bold text-ink uppercase hover:border-ink"
                  >
                    {tr('Rotate Key')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="btn-tactile font-mono-code h-9 cursor-pointer rounded-[4px] border border-bad bg-bad text-[11px] font-bold text-on-bad uppercase hover:bg-bad-hover"
                  >
                    {tr('Sign Out')}
                  </button>
                </div>
              </div>
            </div>
          </NumberedSectionCard>

          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="good">{tr('Account and public dossier settings anchored and saved.')}</Notice>}
        </div>
      </div>

      {/* 3. Persistent Sticky Bottom Action Bar */}
      <div className="sticky bottom-4 z-40 flex flex-col items-center justify-between gap-3 rounded-[6px] border border-line bg-surface p-4 sm:flex-row sm:px-6">
        <div className="font-mono-code flex items-center gap-2 text-[12px] text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${dirty ? 'bg-warn' : saved ? 'bg-good' : 'bg-line-strong'}`} />
          <span role="status" className={dirty ? 'font-semibold text-warn-ink' : undefined}>
            {dirty ? tr('Unsaved changes') : saved ? tr('All changes saved.') : tr('No changes to save.')}
          </span>
        </div>

        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          <button
            type="button"
            onClick={discardChanges}
            disabled={!dirty || busy}
            className="btn-tactile h-10 cursor-pointer rounded-[4px] border border-line bg-paper px-4 text-[13px] font-medium text-muted hover:border-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tr('Discard')}
          </button>
          <Button type="submit" disabled={!dirty || busy} loading={busy} className="h-10 px-6">
            <span className="material-symbols-outlined text-[17px]">save</span>
            <span>{busy ? tr('Saving…') : tr('Save Changes')}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
