import { tr } from '../i18n';
import { useCallback, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  DarkBanner,
  LiveDot,
  Notice,
  TONE_CLASS,
  useConfirm,
} from '../components/shared';
import { useToast } from '../components/toast';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isDirty, useUnsavedChanges } from '../lib/dirty';
import { ConnectionsSection } from './account/ConnectionsSection';
import { ProfileDossierSections } from './account/ProfileDossierSections';
import { SecurityAndPreferencesSections } from './account/SecurityAndPreferencesSections';

export { SignUp } from './account/SignUpView';
export { AuthCallback, ForgotPassword, LogIn, ResetPassword } from './account/AuthViews';

export function MyAccount() {
  const { me, refresh, signOut } = useAuth();
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Privacy preferences are saved as soon as they change, and put back if saving fails.
  const [showQuotes, setShowQuotes] = useState(true);
  const [notifyResults, setNotifyResults] = useState(true);
  const [rotatedUrl, setRotatedUrl] = useState<string | null>(null);
  const [syncedMe, setSyncedMe] = useState(me);
  const toast = useToast();
  const confirm = useConfirm();

  if (me !== syncedMe) {
    setSyncedMe(me);
    if (me) {
      setName(me.profile.display_name);
      setHeadline(me.public_profile?.headline ?? '');
      setIsPublic(me.public_profile?.is_public ?? false);
      setShowQuotes(me.public_profile?.show_quotes ?? true);
      setNotifyResults(me.profile.notify_results ?? true);
    }
  }

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
          <ProfileDossierSections
            name={name}
            onNameChange={setName}
            displayNameFallback={me.profile.display_name}
            email={me.email}
            initials={initials}
            slug={slug}
            url={url}
            headline={headline}
            onHeadlineChange={setHeadline}
            isPublic={isPublic}
            onIsPublicChange={setIsPublic}
          />

          <ConnectionsSection organizations={me.organizations} />

          <SecurityAndPreferencesSections
            slug={slug}
            isPublic={isPublic}
            showQuotes={showQuotes}
            notifyResults={notifyResults}
            onSavePreference={savePreference}
            rotatedUrl={rotatedUrl}
            busy={busy}
            onRevokePublicAccess={revokePublicAccess}
            onSignOut={signOut}
          />

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
