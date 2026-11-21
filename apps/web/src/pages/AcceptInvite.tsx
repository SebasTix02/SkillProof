import { tr } from '../i18n';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, DossierPageHeader, Notice, linkButtonSecondary } from '../components/shared';
import { useToast } from '../components/toast';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

/** Opened from an invitation link. Joining needs the signed-in account to match the invited email. */
export function AcceptInvite() {
  const { token } = useParams();
  const { me, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/invitations/accept`, { body: { token } });
      await refresh();
      toast.success(tr('You joined the organization.'));
      navigate('/org/events');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <DossierPageHeader
        eyebrow={tr('ORGANIZATION INVITATION')}
        title={tr('Join an organization')}
        subtitle={tr('Accept to get the role you were invited with. The invitation only works for the email it was sent to.')}
      />
      <p className="text-[14px] text-muted">
        {tr('You are signed in as')}{' '}<strong className="text-ink">{me?.email ?? 'unknown'}</strong>.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void accept()} disabled={busy || !token} loading={busy}>
          {busy ? tr('Joining…') : tr('Accept invitation')}
        </Button>
        <Link to="/events" className={linkButtonSecondary}>{tr('Not now')}</Link>
      </div>
    </div>
  );
}
