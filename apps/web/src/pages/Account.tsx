import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, Input, Notice } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>{children}</Card>
      {footer && <p className="mt-4 text-sm text-muted">{footer}</p>}
    </div>
  );
}

const link = 'font-medium text-accent hover:underline';

export function SignUp() {
  const [params] = useSearchParams();
  const [type, setType] = useState<'student' | 'organizer'>(params.get('as') === 'organizer' ? 'organizer' : 'student');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        data: { display_name: name, account_type: type, organization_name: type === 'organizer' ? orgName : undefined },
      },
    });
    setBusy(false);
    if (err) return setError(err.message);
    // With email confirmation on, there is no session until the link is clicked.
    if (data.session) navigate(type === 'organizer' ? '/org/events' : '/events');
    else setSent(true);
  }

  if (sent)
    return (
      <AuthCard title="Check your email">
        <p className="text-sm">We sent a confirmation link to <strong>{email}</strong>. Open it to finish creating your account.</p>
      </AuthCard>
    );

  return (
    <AuthCard title="Create your account" footer={<>Already have an account? <Link to="/login" className={link}>Log in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-1 text-sm font-medium">I want to</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['student', 'organizer'] as const).map((t) => (
              <label key={t} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${type === t ? 'border-accent bg-accent-soft' : 'border-line bg-white'}`}>
                <input type="radio" name="type" className="sr-only" checked={type === t} onChange={() => setType(t)} />
                {t === 'student' ? 'Prove my skills' : 'Run hackathons'}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Your name"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        {type === 'organizer' && (
          <Field label="Organization name" hint="Your community, university or company.">
            <Input required maxLength={120} value={orgName} onChange={(e) => setOrgName(e.target.value)} autoComplete="organization" />
          </Field>
        )}
        <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating account…' : 'Sign up'}</Button>
      </form>
    </AuthCard>
  );
}

export function LogIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <AuthCard title="Log in" footer={<>New here? <Link to="/signup" className={link}>Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password"><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Logging in…' : 'Log in'}</Button>
        <p className="text-center text-sm"><Link to="/forgot-password" className={link}>Forgot your password?</Link></p>
      </form>
    </AuthCard>
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
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (err) return setError(err.message);
    setSent(true);
  }

  return (
    <AuthCard title="Reset your password" footer={<Link to="/login" className={link}>Back to log in</Link>}>
      {sent ? (
        <p className="text-sm">If an account exists for <strong>{email}</strong>, a reset link is on its way.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
    </AuthCard>
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

  // The link in the email signs the user in with a recovery session before this form shows.
  if (!loading && !session)
    return (
      <AuthCard title="Reset your password">
        <Notice tone="error">This reset link is not valid any more. <Link to="/forgot-password" className={link}>Request a new one</Link>.</Notice>
      </AuthCard>
    );

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="At least 8 characters.">
          <Input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy || loading} className="w-full">{busy ? 'Saving…' : 'Save password'}</Button>
      </form>
    </AuthCard>
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
  if (!loading && !session)
    return <AuthCard title="Almost there"><p className="text-sm">Your email is confirmed. <Link to="/login" className={link}>Log in</Link> to continue.</p></AuthCard>;
  return <p className="py-16 text-center text-sm text-muted">Signing you in…</p>;
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
      await api('/api/me/profile', { method: 'PATCH', body: { display_name: name, headline, is_public: isPublic } });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (!me) return null;
  const url = me.public_profile ? `${window.location.origin}/p/${me.public_profile.slug}` : null;
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mb-4 text-sm text-muted">{me.email}</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name"><Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Headline" hint="One line shown on your public profile."><Input maxLength={160} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Final-year CS student, backend and data" /></Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>
              <span className="font-medium">Make my profile public</span>
              <span className="block text-muted">Anyone with the link can see your completed interviews, their scores and the quotes used as evidence.</span>
            </span>
          </label>
          {isPublic && url && <Notice>Your profile: <a className={link} href={url}>{url}</a></Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="good">Saved.</Notice>}
          <Button type="submit">Save</Button>
        </form>
      </Card>
    </div>
  );
}
