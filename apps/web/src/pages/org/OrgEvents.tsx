import { Link } from 'react-router-dom';
import { Badge, PageState, formatDate, linkButton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { STATUS_LABEL, VISIBILITY_LABEL, type EventView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

type OrgEvent = EventView & { submission_count: number; participant_count: number };

export function OrgEvents() {
  const { org } = useAuth();
  const { data, error, loading } = useLoad<{ events: OrgEvent[] }>(org ? `/api/orgs/${org.id}/events` : null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{org?.name}</h1>
          <p className="mt-1 text-sm text-muted">Your events</p>
        </div>
        <Link to="/org/events/new" className={`${linkButton} ml-auto`}>Create event</Link>
      </div>
      <PageState loading={loading} error={error} />
      {data && data.events.length === 0 && (
        <p className="text-sm text-muted">No events yet. Create one, share its link, and SkillProof judges every submission at the deadline.</p>
      )}
      {data && data.events.length > 0 && (
        <ul className="space-y-3">
          {data.events.map((e) => (
            <li key={e.id}>
              <Link to={`/org/events/${e.id}`} className="block rounded-xl border border-line bg-white p-4 hover:border-accent">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{e.name}</h2>
                  <Badge tone={e.status === 'open' ? 'good' : e.status === 'review' ? 'warn' : 'neutral'}>{STATUS_LABEL[e.status]}</Badge>
                  <Badge>{VISIBILITY_LABEL[e.visibility]}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {e.participant_count} participants · {e.submission_count} submissions · closes {formatDate(e.submission_deadline)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
