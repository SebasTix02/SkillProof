import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Notice } from '../components/ui';
import { api, errorMessage } from '../lib/api';
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
                <span>ED25519 CRYPTOGRAPHIC HANDSHAKE</span>
              </div>
              <span className="font-mono-code text-[11px] tracking-wider text-muted uppercase">
                PROTOCOL // AUTH-V1.0.4
              </span>
            </div>

            {/* Feature Image Frame */}
            <div className="relative my-3 overflow-hidden rounded-[4px] border border-line bg-paper">
              <img
                src={AUTH_IMAGE}
                alt="Cryptographic identity and repository verification key"
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
                  HASH: #8a3f..e92
                </span>
              </div>
            </div>

            {/* Editorial Narrative */}
            <div className="space-y-2 pt-1">
              <h2 className="font-serif-heading text-[22px] leading-[29px] font-medium text-ink sm:text-[26px] sm:leading-[33px]">
                Immutable provenance for verifiable credentials and high-stakes evaluations.
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
                Security Certificate Stamp
              </span>
              <span className="rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[10px] font-bold text-good">
                {badgeLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-line pt-2">
              <div>
                <span className="font-mono-code block text-[10px] text-muted uppercase">Verification Mode</span>
                <span className="font-mono-code text-[11px] font-medium text-ink">Email + Role Attestation</span>
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

        <Button type="submit" disabled={busy} className="w-full py-2.5">
          <span>{busy ? 'Creating account…' : 'Create Cryptographic Identity'}</span>
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

        <Button type="submit" disabled={busy} className="w-full py-2.5">
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
      subtitle="Dispatch a cryptographic recovery link to your registered email"
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
          <Button type="submit" disabled={busy} className="w-full py-2.5">
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
        <Button type="submit" disabled={busy || loading} className="w-full py-2.5">
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
        subtitle="Your cryptographic identity is ready"
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
  const { me, refresh } = useAuth();
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setName(me.profile.display_name);
    setHeadline(me.public_profile?.headline ?? '');
    setIsPublic(me.public_profile?.is_public ?? false);
  }, [me]);

  async function submit(e: FormEvent) {
    e.preventDefault();
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
    }
  }

  if (!me) return null;
  const url = me.public_profile ? `${window.location.origin}/p/${me.public_profile.slug}` : null;

  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <div className="flex flex-col justify-between gap-2 border-b border-line pb-4 sm:flex-row sm:items-end">
        <div>
          <span className="font-mono-code text-[11px] font-semibold tracking-wider text-accent uppercase">
            IDENTITY &amp; PUBLIC DOSSIER SETTINGS
          </span>
          <h1 className="font-serif-heading mt-1 text-[28px] leading-[34px] font-medium text-ink">
            Account &amp; Credential Profile
          </h1>
          <p className="font-mono-code mt-0.5 text-[12px] text-muted">{me.email}</p>
        </div>
        <span className="font-mono-code rounded-[3px] border border-line bg-white px-2.5 py-1 text-[11px] text-muted">
          ID: <span className="font-semibold text-ink">{me.profile.id.slice(0, 8)}</span>
        </span>
      </div>

      <section className="rounded-[6px] border border-line bg-white p-6">
        <form onSubmit={submit} className="space-y-5">
          <Field label="Display Name">
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field
            label="Professional Headline"
            hint="Shown at the top of your public recruiter dossier (/p/:slug)."
          >
            <Input
              maxLength={160}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Systems Engineer • Distributed Consensus, Rust & TypeScript"
            />
          </Field>

          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <label htmlFor="public-profile-toggle" className="cursor-pointer space-y-1 text-[13px]">
              <span className="block font-semibold text-ink">Make my verification dossier public</span>
              <span className="block text-[12px] text-muted">
                Anyone with your public link can inspect your completed voice interviews, ownership scores, and cited
                transcript quotes.
              </span>
            </label>
            <input
              id="public-profile-toggle"
              type="checkbox"
              className="mt-1 h-4 w-4 accent-accent cursor-pointer"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
          </div>

          {isPublic && url && (
            <Notice tone="info">
              <span className="font-mono-code text-[11px] font-semibold uppercase">Public Recruiter Dossier: </span>
              <a className="font-mono-code text-[12px] font-semibold text-accent hover:underline" href={url}>
                {url}
              </a>
            </Notice>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="good">Profile settings updated and saved.</Notice>}

          <div className="flex items-center justify-end border-t border-line pt-4">
            <Button type="submit">Save Profile Changes</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
