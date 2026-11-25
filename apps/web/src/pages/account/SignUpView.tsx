import { getLocale, tr } from '../../i18n';
import { rich } from '../../i18n/rich';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, Notice } from '../../components/shared';
import { supabase } from '../../lib/supabase';
import { AuthPortalShell } from './AuthPortalShell';

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
            {rich(tr('We sent a confirmation link to {email}. Open it to finish creating your SkillProof account.'), { email: <strong className="font-mono-code">{email}</strong> })}
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
