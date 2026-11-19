import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
} from '../components/shared';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/toast';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

const AUTH_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDK9J9aTWLySdYxV9_OQKTnAmfB807sEiNDUiEIR97gcAGCkdWaC1DP5JN21rgnzoLoNjlWupv80tV1R0xRdmQsxMbLfZAbefEievTfjbR6IUbaQ2qZANuYXChss3CMAtf5ld4H5OWdaEkTPHwW9kkgTaOpuiax5YWQx4Y7_VxF15diaekYtEOwGqktgRf6dH8c5Nb8G8yGkKUbL7z5ZcbktnAwcHEbV1WGwLBki4A';

function AuthPortalShell({
  mode,
  title,
  subtitle,
  children,
  statusText = 'Active Session Handshake Ready',
  badgeLabel = 'RLS ENFORCED',
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
        <section className=" flex flex-col justify-between rounded-[6px] border border-line bg-white p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-mono-code inline-flex items-center gap-2 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
                <span className="status-dot-live bg-accent text-accent" />
                <span>SECURED BY SUPABASE AUTH</span>
              </div>
              <span className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                PROTOCOL // AUTH-V1.0.4
              </span>
            </div>

            {/* Feature Image Frame */}
            <div className="relative my-3 overflow-hidden rounded-[4px] border border-line bg-paper">
              <img
                src={AUTH_IMAGE}
                alt="SkillProof sign-in"
                className="block h-[240px] w-full object-cover sm:h-[280px]"
              />
              <div className="flex items-center justify-between border-t border-[#262B34] bg-[#14161A] px-4 py-2.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-[#79d9ae]">verified_user</span>
                  <span className="font-mono-code text-[11px] tracking-wide">
                    Verified Repository &amp; Voice Credential Binding
                  </span>
                </div>
                <span className="font-mono-code rounded-[3px] border border-[#262B34] bg-[#0D0F12] px-2 py-0.5 text-[10px] text-[#EDEDEC]">
                  EMAIL + PASSWORD
                </span>
              </div>
            </div>

            {/* Editorial Narrative */}
            <div className="space-y-2 pt-1">
              <h2 className="font-serif-heading text-[22px] leading-[29px] font-medium text-ink sm:text-[26px] sm:leading-[33px]">
                Evidence-backed scores and voice interviews about your own code.
              </h2>
              <p className="text-[13px] leading-[21px] text-muted">
                Authenticate as a candidate to defend your GitHub repositories in 3-minute voice interviews and publish
                your recruiter dossier, or register an organization to run commit-locked hackathons.
              </p>
            </div>
          </div>

          {/* Protocol Status Footprint */}
          <div className="mt-6 grid grid-cols-3 gap-2.5 border-t border-line pt-4 sm:gap-3">
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">Session Security</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-ink">Supabase RLS</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">Repo Scope</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-good">Read-Only SHA</div>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-2.5">
              <div className="font-mono-code text-[10px] text-muted uppercase">Oral Engine</div>
              <div className="font-mono-code mt-0.5 text-[12px] font-semibold text-accent">Gemini Live 3m</div>
            </div>
          </div>
        </section>

        {/* Right: Authentication Dossier Portal (6 cols) */}
        <section className="flex flex-col justify-between rounded-[6px] border border-line bg-white p-6 sm:p-8 lg:col-span-6">
          <div className="space-y-5">
            {/* Header & Identity Icon */}
            <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
              <div className="space-y-1">
                <span className="font-mono-code text-[10px] font-semibold tracking-wider text-accent uppercase">
                  IDENTITY &amp; ACCESS CONTROL
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
            <div className="flex items-center justify-between border-b border-line">
              <div className="flex items-center gap-6">
                <Link
                  to={`/login${search}`}
                  className={`font-mono-code -mb-[1px] border-b-2 pb-2.5 text-[12px] font-semibold tracking-wider uppercase transition-colors ${
                    mode === 'login'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Sign In
                </Link>
                <Link
                  to={`/signup${search}`}
                  className={`font-mono-code -mb-[1px] border-b-2 pb-2.5 text-[12px] font-semibold tracking-wider uppercase transition-colors ${
                    mode === 'signup'
                      ? 'border-accent text-accent'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Request Access / Register
                </Link>
              </div>
              <Link
                to="/forgot-password"
                className={`font-mono-code -mb-[1px] flex items-center gap-1 border-b-2 pb-2.5 text-[11px] font-medium transition-colors ${
                  mode === 'recovery'
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-accent'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">key</span>
                <span>Reset Key</span>
              </Link>
            </div>

            {/* Active Form / View Content */}
            <div className="pt-1">{children}</div>
          </div>

          {/* Cryptographic Signature Status Stamp Card */}
          <div className="mt-6 space-y-2.5 rounded-[4px] border border-line bg-paper p-3.5">
            <div className="font-mono-code flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                <span className="h-2 w-2 rounded-full bg-good" />
                Account Security
              </span>
              <span className="rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good">
                {badgeLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
              <div>
                <span className="font-mono-code block text-[10px] text-muted uppercase">Verification Mode</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">Email + role</span>
              </div>
              <div className="text-right">
                <span className="font-mono-code block text-[10px] text-muted uppercase">Status</span>
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
        title="Check your email"
        subtitle="Identity verification link dispatched"
        statusText="Awaiting Email Confirmation"
        badgeLabel="DISPATCH VERIFIED"
      >
        <div className="space-y-4">
          <Notice tone="good">
            We sent a confirmation link to <strong className="font-mono-code">{email}</strong>. Open it to finish
            creating your SkillProof account.
          </Notice>
          <p className="text-[13px] text-muted">
            Once confirmed, you will be redirected automatically to your workspace. Already confirmed?{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              Proceed to Sign In →
            </Link>
          </p>
        </div>
      </AuthPortalShell>
    );
  }

  return (
    <AuthPortalShell
      mode="signup"
      title="Create your account"
      subtitle="Register your candidate or organizer credential identity"
      statusText={type === 'organizer' ? 'Organizer Provisioning' : 'Candidate Provisioning'}
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Segmented Role Selector */}
        <fieldset>
          <legend className="font-mono-code mb-1.5 block text-[11px] font-semibold tracking-wider text-muted uppercase">
            Select Operational Role
          </legend>
          <div className="grid grid-cols-2 gap-1.5 rounded-[4px] border border-line bg-paper p-1">
            {(
              [
                { key: 'student', label: 'Candidate / Student', sub: 'Prove my skills' },
                { key: 'organizer', label: 'Organizer / Academic', sub: 'Run hackathons' },
              ] as const
            ).map((role) => {
              const active = type === role.key;
              return (
                <label
                  key={role.key}
                  className={`btn-tactile cursor-pointer rounded-[3px] border px-3 py-2 text-center ${
                    active
                      ? 'border-accent bg-white text-ink font-semibold'
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

        <Field label="Your Name">
          <Input
            required
            maxLength={80}
            placeholder="Alex Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </Field>

        {type === 'organizer' && (
          <Field
            label="Accreditation / Organization Name"
            hint="Your hackathon community, university lab, or engineering organization."
          >
            <Input
              required
              maxLength={120}
              placeholder="e.g. Stanford ACM, TreeHacks, MIT Blueprint"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              autoComplete="organization"
            />
          </Field>
        )}

        <Field label="Identity Email">
          <Input
            required
            type="email"
            className="font-mono-code"
            placeholder="developer@institution.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>

        <Field label="Secret Passphrase" hint="Minimum 8 characters required.">
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
              aria-label="Toggle password visibility"
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
          <span>{busy ? 'Creating account…' : 'Create Account'}</span>
          <span className="arrow-nudge font-mono-code text-[12px]">→</span>
        </Button>

        <p className="pt-1 text-center text-[12px] text-muted">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Log in to your dossier
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
      title="Authentication Dossier"
      subtitle="Sign in with your registered email and passphrase"
      statusText="Ready for Session Handshake"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Identity Email">
          <Input
            required
            type="email"
            className="font-mono-code"
            placeholder="developer@institution.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase">
              Secret Passphrase
            </label>
            <Link to="/forgot-password" className="font-mono-code text-[11px] font-medium text-accent hover:underline">
              Forgot passphrase?
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
              aria-label="Toggle password visibility"
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
          <span>{busy ? 'Authenticating…' : 'Authenticate with Identity'}</span>
          <span className="arrow-nudge font-mono-code text-[12px]">→</span>
        </Button>

        <p className="pt-1 text-center text-[12px] text-muted">
          New to SkillProof?{' '}
          <Link to="/signup" className="font-semibold text-accent hover:underline">
            Create an account
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
      title="Reset your passphrase"
      subtitle="We email you a link to choose a new passphrase"
      statusText={sent ? 'Recovery Link Dispatched' : 'Recovery Dispatch Standby'}
      badgeLabel={sent ? 'DISPATCH VERIFIED' : 'RECOVERY MODE'}
    >
      {sent ? (
        <div className="space-y-4">
          <Notice tone="good">
            If an account exists for <strong className="font-mono-code">{email}</strong>, a password reset link is on
            its way.
          </Notice>
          <p className="text-[13px] text-muted">
            <Link to="/login" className="font-semibold text-accent hover:underline">
              ← Return to Sign In
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Registered Identity Email" hint="We will send a single-use recovery link to this address.">
            <Input
              required
              type="email"
              className="font-mono-code"
              placeholder="developer@institution.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy} loading={busy} className="w-full py-2.5">
            <span>{busy ? 'Sending recovery link…' : 'Send Recovery Link'}</span>
            <span className="arrow-nudge font-mono-code text-[12px]">→</span>
          </Button>
          <p className="pt-1 text-center text-[12px] text-muted">
            Remembered your passphrase?{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              Back to Sign In
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
        title="Reset your passphrase"
        subtitle="Recovery token expired or invalid"
        statusText="Token Invalid"
        badgeLabel="EXPIRED"
      >
        <Notice tone="error">
          This reset link is no longer valid.{' '}
          <Link to="/forgot-password" className="font-semibold underline">
            Request a new recovery link
          </Link>
          .
        </Notice>
      </AuthPortalShell>
    );
  }

  return (
    <AuthPortalShell
      mode="recovery"
      title="Choose a new passphrase"
      subtitle="Enter a new passphrase for your SkillProof identity"
      statusText="Recovery Session Active"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="New Passphrase" hint="At least 8 characters.">
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
          {busy ? 'Saving passphrase…' : 'Save New Passphrase'}
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
        title="Email Confirmed"
        subtitle="Your account is ready"
        statusText="Email Verified"
        badgeLabel="VERIFIED"
      >
        <div className="space-y-4">
          <Notice tone="good">Your email address is confirmed.</Notice>
          <Link
            to="/login"
            className="btn-tactile inline-flex w-full items-center justify-center gap-2 rounded-[4px] border border-accent bg-accent px-4 py-2.5 text-[13px] font-medium text-white hover:bg-accent-hover"
          >
            <span>Continue to Sign In</span>
            <span className="arrow-nudge font-mono-code text-[12px]">→</span>
          </Link>
        </div>
      </AuthPortalShell>
    );
  }

  return <p className="font-mono-code py-16 text-center text-[12px] text-muted">VERIFYING SESSION HANDSHAKE…</p>;
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

  useEffect(() => {
    if (!me) return;
    setName(me.profile.display_name);
    setHeadline(me.public_profile?.headline ?? '');
    setIsPublic(me.public_profile?.is_public ?? false);
    setShowQuotes(me.public_profile?.show_quotes ?? true);
    setNotifyResults(me.profile.notify_results ?? true);
  }, [me]);

  async function savePreference(field: 'show_quotes' | 'notify_results', value: boolean) {
    const set = field === 'show_quotes' ? setShowQuotes : setNotifyResults;
    set(value);
    try {
      await api('/api/me/profile', { method: 'PATCH', body: { [field]: value } });
      toast.success(field === 'show_quotes' ? (value ? 'Quotes are shown on your public profile.' : 'Quotes are hidden from your public profile.') : value ? 'You will be told when results are published.' : 'Result notices are off.');
      await refresh();
    } catch (err) {
      set(!value);
      toast.error(`Could not save your preference. ${errorMessage(err)}`);
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
    if (!window.confirm('Create a new public link? Every link you shared before will stop working.')) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api<{ slug: string }>('/api/me/profile/rotate-slug', { method: 'POST' });
      const next = `${window.location.origin}/p/${res.slug}`;
      setRotatedUrl(next);
      toast.success('Old links no longer work. Your new public link is ready.');
      await refresh();
    } catch (err) {
      toast.error(`Could not revoke the link. ${errorMessage(err)}`);
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

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-[1160px] space-y-8">
      {/* 1. Dark Dossier Header & Context Strip */}
      <DarkBanner>
        <div className="flex flex-col space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono-code rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-1 text-[11px] tracking-wider text-accent-soft uppercase">
                SEC-CFG // IDENTITY_V1.0.4
              </span>
              <span className="text-white/30">/</span>
              <span className="font-mono-code flex items-center gap-2 rounded-[3px] border border-good/40 bg-good/20 px-2.5 py-1 text-[11px] text-[#79d9ae]">
                <LiveDot tone="mint" />
                <span>RLS SESSION ACTIVE</span>
              </span>
            </div>
            <div className="font-mono-code flex items-center gap-2 rounded-[3px] border border-white/10 bg-[#15181E] px-3 py-1 text-[11px] text-[#8E95A3]">
              <span>USER_ID:</span>
              <span className="font-medium tracking-wide text-accent-soft">
                {me.profile.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-[720px] space-y-2">
              <h1 className="font-serif-heading text-[30px] leading-[1.15] font-normal tracking-tight text-white sm:text-[36px]">
                Account &amp; Verification Identity
              </h1>
              <p className="text-[14px] leading-[22px] text-[#8E95A3] sm:text-[15px]">
                Manage your public recruiter dossier, professional headline, connected verification signals, and access
                controls.
              </p>
            </div>

            {url && (
              <div className="shrink-0 self-start lg:self-auto">
                <Link
                  to={`/p/${slug}`}
                  className="btn-tactile font-mono-code inline-flex items-center gap-2 rounded-[4px] border border-accent bg-accent px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-accent-hover"
                >
                  <span>PREVIEW PUBLIC DOSSIER</span>
                  <span className="material-symbols-outlined text-[16px]">north_east</span>
                </Link>
              </div>
            )}
          </div>

          {/* Segmented Navigation Rail */}
          <nav className="flex items-center gap-2 overflow-x-auto border-t border-white/10 pt-3 text-[13px]">
            <button
              type="button"
              onClick={() => scrollToSection('section-profile')}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[4px] border border-white/20 bg-white/15 px-3.5 py-2 font-medium text-white"
            >
              <span className="material-symbols-outlined text-[17px] text-accent-soft">person_pin</span>
              <span>General &amp; Profile</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('section-visibility')}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-2 text-[#8E95A3] transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="material-symbols-outlined text-[17px] text-[#79d9ae]">verified_user</span>
              <span>Public Dossier</span>
              <span
                className={`font-mono-code rounded-[2px] border px-1.5 py-0.2 text-[10px] ${
                  isPublic
                    ? 'border-good/40 bg-good/20 text-[#79d9ae]'
                    : 'border-white/15 bg-white/10 text-[#8E95A3]'
                }`}
              >
                {isPublic ? 'LIVE' : 'PRIVATE'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('section-integrations')}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-2 text-[#8E95A3] transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="material-symbols-outlined text-[17px] text-[#C4B5FD]">terminal</span>
              <span>Verification Signals</span>
              <span className="font-mono-code rounded-[2px] border border-[#C4B5FD]/30 bg-[#C4B5FD]/15 px-1.5 py-0.2 text-[10px] font-semibold text-[#DDD6FE]">
                3
              </span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('section-privacy')}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-2 text-[#8E95A3] transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="material-symbols-outlined text-[17px] text-[#FBBF24]">tune</span>
              <span>Privacy Controls</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('section-danger')}
              className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[4px] px-3.5 py-2 text-[#8E95A3] transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="material-symbols-outlined text-[17px] text-[#F87171]">key</span>
              <span>Security &amp; Access</span>
            </button>
          </nav>
        </div>
      </DarkBanner>

      {/* 2. Main Workspace Grid: Left Index Rail (3 cols) + Right Settings Sections (9 cols) */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left Interactive Index & Proof Status Card */}
        <aside className="sticky top-20 hidden space-y-5 lg:col-span-3 lg:block">
          <div className="space-y-3 rounded-[6px] border border-line bg-white p-4">
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <span className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                Section Index
              </span>
              <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                5 MODULES
              </span>
            </div>

            <ul className="space-y-1.5 text-[13px]">
              <li>
                <a
                  href="#section-profile"
                  className="flex items-center justify-between rounded-[4px] border border-accent/25 bg-accent-soft/60 px-2.5 py-2 font-medium text-accent transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <span>01. Profile &amp; Bio</span>
                  </div>
                  <span className="font-mono-code rounded-[2px] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    EDIT
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="#section-visibility"
                  className="flex items-center justify-between rounded-[4px] border border-transparent px-2.5 py-2 font-medium text-ink transition-colors hover:border-line hover:bg-paper"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-[#4338CA]" />
                    <span>02. Dossier Address</span>
                  </div>
                  <span
                    className={`font-mono-code rounded-[2px] border px-1.5 py-0.5 text-[10px] font-semibold ${
                      isPublic
                        ? 'border-good/30 bg-good-soft text-good'
                        : 'border-line bg-paper text-muted'
                    }`}
                  >
                    {isPublic ? 'ACTIVE' : 'OFF'}
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="#section-integrations"
                  className="flex items-center justify-between rounded-[4px] border border-transparent px-2.5 py-2 font-medium text-ink transition-colors hover:border-line hover:bg-paper"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-good" />
                    <span>03. Signal Feeds</span>
                  </div>
                  <span className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                    3 / 3
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="#section-privacy"
                  className="flex items-center justify-between rounded-[4px] border border-transparent px-2.5 py-2 font-medium text-ink transition-colors hover:border-line hover:bg-paper"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-warn" />
                    <span>04. Privacy Telemetry</span>
                  </div>
                  <span className="font-mono-code rounded-[2px] border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn">
                    OPT
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="#section-danger"
                  className="flex items-center justify-between rounded-[4px] border border-transparent px-2.5 py-2 font-medium text-bad transition-colors hover:border-bad/30 hover:bg-bad-soft/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-bad" />
                    <span>05. Danger Zone</span>
                  </div>
                  <span className="font-mono-code rounded-[2px] border border-bad/30 bg-bad-soft px-1.5 py-0.5 text-[10px] font-semibold text-bad">
                    CRIT
                  </span>
                </a>
              </li>
            </ul>
          </div>

          {/* Cryptographic Seal Card */}
          <div className="space-y-3 rounded-[6px] border border-good/30 bg-good-soft/35 p-4 text-[12px]">
            <div className="font-mono-code flex items-center justify-between text-[11px]">
              <span className="font-semibold text-ink">PROFILE STATUS</span>
              <span className="inline-flex items-center gap-1.5 rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 font-semibold text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                SAVED
              </span>
            </div>
            <p className="leading-[19px] text-muted">
              Profile updates sync directly to your public recruiter dossier at{' '}
              <code className="font-mono-code rounded-[2px] border border-line bg-white px-1 py-0.5 text-[11px] text-ink">
                /p/{slug}
              </code>
              .
            </p>
            <div className="font-mono-code flex flex-col space-y-1 border-t border-good/20 pt-2 text-[10px] text-muted">
              <div className="flex justify-between">
                <span>EMAIL:</span>
                <span className="truncate pl-2 font-medium text-ink">{me.email}</span>
              </div>
              <div className="flex justify-between">
                <span>ORGANIZATIONS:</span>
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
            theme="cobalt"
            title="Public Identity & Recruiter Persona"
            subtitle="Identity and engineering headline displayed on your public recruiter dossier."
            sectionTag="SECTION 01 // IDENTITY"
          >
            <div className="space-y-5">
              {/* User Persona Preview Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
                <div className="flex items-center gap-3.5">
                  <div className="relative">
                    <div className="font-mono-code flex h-12 w-12 items-center justify-center rounded-full border border-accent/30 bg-accent text-[15px] font-bold text-white">
                      {initials}
                    </div>
                    <span
                      className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-good text-white"
                      title="Verified Account"
                    >
                      <span className="material-symbols-outlined text-[10px]">check</span>
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-ink">
                        {name || me.profile.display_name}
                      </span>
                      <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                        /p/{slug}
                      </span>
                    </div>
                    <p className="font-mono-code text-[11px] text-muted">{me.email}</p>
                  </div>
                </div>

                {url && (
                  <Link
                    to={`/p/${slug}`}
                    className="btn-tactile font-mono-code inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                  >
                    <span>Open Recruiter View</span>
                    <span>↗</span>
                  </Link>
                )}
              </div>

              <Field
                label="Full Display Name"
                hint="Publicly visible to hiring managers, peer review panels, and hackathon judges."
              >
                <Input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                />
              </Field>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="account-headline"
                    className="font-mono-code text-[11px] font-semibold tracking-wider text-ink uppercase"
                  >
                    Professional Headline &amp; Technical Focus
                  </label>
                  <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {headline.length} / 160
                  </span>
                </div>
                <Input
                  id="account-headline"
                  maxLength={160}
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Distributed Systems & Infrastructure Engineer • Rust, Go & Consensus Protocols"
                />
                <p className="font-mono-code text-[11px] text-muted">
                  One-line summary displayed at the top of your public recruiter dossier alongside oral defense quotes.
                </p>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 02. Public Dossier Visibility & Immutable URL (Indigo Accent) */}
          <NumberedSectionCard
            id="section-visibility"
            number="02"
            theme="indigo"
            title="Dossier Visibility & Public Address"
            subtitle="Configure public read-only access for your verified interview reports."
            sectionTag="SECTION 02 // PUBLIC_URL"
          >
            <div className="space-y-5">
              {/* Toggle Switch Card */}
              <div className="flex items-start justify-between gap-4 rounded-[4px] border border-[#C7D2FE] bg-[#EEF2FF]/45 p-4">
                <div className="space-y-1 pr-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">Enable Public Recruiter Dossier</span>
                    <span
                      className={`font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border px-2 py-0.5 text-[10px] font-bold ${
                        isPublic
                          ? 'border-good/30 bg-good-soft text-good'
                          : 'border-line bg-white text-muted'
                      }`}
                    >
                      <LiveDot tone={isPublic ? 'good' : 'muted'} pulse={false} />
                      {isPublic ? 'ACTIVE & RESOLVABLE' : 'PRIVATE ONLY'}
                    </span>
                  </div>
                  <p className="text-[12px] leading-[19px] text-muted">
                    When enabled, anyone with your link can view your completed interviews, ownership scores, and cited
                    transcript quotes without logging in.
                  </p>
                </div>

                <ToggleSwitch
                  checked={isPublic}
                  onChange={setIsPublic}
                  activeColorClass="peer-checked:bg-[#4338CA]"
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
                      Your Canonical Public Dossier URL
                    </label>
                    <span className="font-mono-code rounded-[3px] border border-[#C7D2FE] bg-[#EEF2FF] px-2 py-0.5 text-[10px] text-[#3730A3]">
                      SLUG: {slug}
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
                      variant="indigo"
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
            theme="emerald"
            title="Connected Verification Signals & Hardware"
            subtitle="Repository analysis engine, organization memberships, and oral defense microphone status."
            sectionTag="SECTION 03 // FEEDS_SYNC"
          >
            <div className="space-y-4">
              {/* GitHub Repository Analyzer Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-white p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-ink text-white">
                    <span className="material-symbols-outlined text-[20px]">code</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">GitHub Repository Analyzer</span>
                      <span className="font-mono-code rounded-[2px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold text-good">
                        READ-ONLY PUBLIC REPOS
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      Selective Git tree reader and blob SHA cache active for hackathons and personal interviews.
                    </p>
                  </div>
                </div>
                <Link
                  to="/interview/new"
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-white px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                >
                  Start Repo Interview →
                </Link>
              </div>

              {/* Organizations & Roles Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-white p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-accent/25 bg-accent-soft text-accent">
                    <span className="material-symbols-outlined text-[20px]">corporate_fare</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">Organization Memberships</span>
                      <span className="font-mono-code rounded-[2px] border border-line bg-paper px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        {me.organizations.length} {me.organizations.length === 1 ? 'ORG' : 'ORGS'}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      {me.organizations.length > 0
                        ? me.organizations.map((o) => `${o.name} (${o.roles.join(', ')})`).join(' • ')
                        : 'Standard Candidate Account • Eligible to join public and access-code events.'}
                    </p>
                  </div>
                </div>
                <Link
                  to={me.organizations.length > 0 ? '/org/events' : '/events'}
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-white px-3.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
                >
                  {me.organizations.length > 0 ? 'Organizer Console →' : 'Browse Events →'}
                </Link>
              </div>

              {/* Audio Verification Hardware Card */}
              <div className="flex flex-col justify-between gap-4 rounded-[4px] border border-line bg-white p-4 md:flex-row md:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] border border-good/30 bg-good-soft text-good">
                    <span className="material-symbols-outlined text-[20px]">mic</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-ink">Oral Defense Capture Device</span>
                      <span
                        className={`font-mono-code rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          micStatus === 'ok'
                            ? 'border-good/30 bg-good-soft text-good'
                            : micStatus === 'denied'
                              ? 'border-bad/30 bg-bad-soft text-bad'
                              : 'border-line bg-paper text-muted'
                        }`}
                      >
                        {micStatus === 'ok'
                          ? 'PERMISSION GRANTED'
                          : micStatus === 'denied'
                            ? 'PERMISSION BLOCKED'
                            : 'READY TO TEST'}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted">
                      Browser microphone with echo cancellation &amp; noise suppression for 3-minute Gemini Live exams.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void testMicrophone()}
                  className="btn-tactile font-mono-code inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[4px] border border-line bg-white px-3.5 text-[11px] font-semibold text-ink hover:border-good hover:text-good"
                >
                  <span className="material-symbols-outlined text-[15px] text-good">graphic_eq</span>
                  <span>{micStatus === 'testing' ? 'Checking…' : 'Test Mic Access'}</span>
                </button>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 04. Privacy Controls & Notification Telemetry (Amber Accent) */}
          <NumberedSectionCard
            id="section-privacy"
            number="04"
            theme="amber"
            title="Privacy Controls & Verification Telemetry"
            subtitle="Visibility boundaries for interview attempts and event notifications."
            sectionTag="SECTION 04 // AUDIT_PRIVACY"
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
                    Display verbatim transcript quotes on my public profile
                  </span>
                  <span className="block text-[12px] text-muted">
                    Recruiters inspecting your public dossier can read the exact quotes that proved each skill.
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
                    Tell me when results of my events are published
                  </span>
                  <span className="block text-[12px] text-muted">
                    Email notices are coming soon. Your choice is saved and used as soon as they are.
                  </span>
                </div>
              </label>

              <div className="flex items-start justify-between gap-4 rounded-[4px] border border-warn/30 bg-warn-soft/45 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">
                      Hide failed or incomplete interview attempts from public profile
                    </span>
                    <span className="font-mono-code rounded-[2px] border border-warn/30 bg-warn-soft px-1.5 py-0.5 text-[10px] font-bold text-warn">
                      ENFORCED BY PROTOCOL
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    Only completed interviews with a finalized ownership report are returned on `/p/{slug}`. Failed or
                    in-progress sessions remain strictly private to your account.
                  </p>
                </div>
              </div>
            </div>
          </NumberedSectionCard>

          {/* 05. Danger Zone & Access Revocation (Crimson Accent) */}
          <NumberedSectionCard
            id="section-danger"
            icon="warning"
            theme="crimson"
            title="Danger Zone & Access Revocation"
            subtitle="Immediate public link revocation and passphrase rotation routines."
            sectionTag="SECURITY CONTROLS"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-white p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                    <span className="material-symbols-outlined text-[18px] text-bad">link_off</span>
                    <span>Revoke Public Dossier Link</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    Moves your dossier from `/p/{slug}` to a new address, so every link you shared before stops
                    working. Your profile stays {isPublic ? 'public' : 'private'}.
                  </p>
                  {rotatedUrl && (
                    <p className="font-mono-code break-all rounded-[3px] border border-line bg-paper px-2 py-1 text-[11px] text-ink">
                      New link: {rotatedUrl}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revokePublicAccess()}
                  className="btn-tactile font-mono-code h-9 w-full cursor-pointer rounded-[4px] border border-bad/40 bg-bad-soft text-[11px] font-bold tracking-wider text-bad uppercase hover:bg-bad hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? 'CREATING NEW LINK…' : 'REVOKE AND CREATE A NEW LINK'}
                </button>
              </div>

              <div className="flex flex-col justify-between space-y-4 rounded-[4px] border border-bad/30 bg-white p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
                    <span className="material-symbols-outlined text-[18px] text-bad">lock_reset</span>
                    <span>Passphrase &amp; Session Control</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted">
                    Rotate your account passphrase or terminate your active browser session immediately.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/reset-password"
                    className="btn-tactile font-mono-code flex h-9 items-center justify-center rounded-[4px] border border-line bg-paper text-[11px] font-bold text-ink uppercase hover:border-ink"
                  >
                    Rotate Key
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="btn-tactile font-mono-code h-9 cursor-pointer rounded-[4px] border border-bad bg-bad text-[11px] font-bold text-white uppercase hover:bg-bad-hover"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </NumberedSectionCard>

          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="good">Account and public dossier settings anchored and saved.</Notice>}
        </div>
      </div>

      {/* 3. Persistent Sticky Bottom Action Bar */}
      <div className="sticky bottom-4 z-40 flex flex-col items-center justify-between gap-3 rounded-[6px] border border-line bg-white p-4 sm:flex-row sm:px-6">
        <div className="font-mono-code flex items-center gap-2 text-[12px] text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${saved ? 'bg-good' : 'bg-accent'}`} />
          <span>
            {saved
              ? 'All profile changes saved and synchronized.'
              : `Editing profile for ${me.email}`}
          </span>
        </div>

        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          <button
            type="button"
            onClick={discardChanges}
            className="btn-tactile h-10 cursor-pointer rounded-[4px] border border-line bg-paper px-4 text-[13px] font-medium text-muted hover:border-muted hover:text-ink"
          >
            Discard
          </button>
          <Button type="submit" disabled={busy} loading={busy} className="h-10 px-6">
            <span className="material-symbols-outlined text-[17px]">save</span>
            <span>{busy ? 'Saving…' : 'Save Changes'}</span>
          </Button>
        </div>
      </div>
    </form>
  );
}
