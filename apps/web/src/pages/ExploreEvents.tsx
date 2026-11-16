import { Link } from 'react-router-dom';
import { Badge, Card, PageState, formatDate } from '../components/ui';
import { STATUS_LABEL, type EventView } from '../lib/types';
import { useLoad } from '../lib/useLoad';

function EventList({ events, empty }: { events: EventView[]; empty: string }) {
  if (events.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {events.map((e) => (
        <li key={e.id}>
          <Link to={`/e/${e.slug}`} className="block rounded-xl border border-line bg-white p-4 hover:border-accent">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{e.name}</h3>
              <Badge tone={e.status === 'open' ? 'good' : 'neutral'}>{STATUS_LABEL[e.status]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{e.organization?.name}</p>
            <p className="mt-2 text-sm text-muted">Submissions close {formatDate(e.submission_deadline)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ExploreEvents() {
  const mine = useLoad<{ events: EventView[] }>('/api/me/events');
  const open = useLoad<{ events: EventView[] }>('/api/events');
  const joined = new Set(mine.data?.events.map((e) => e.id));
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="mt-1 text-sm text-muted">Have a link to a private event? Open it and enter the access code there.</p>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-semibold">My events</h2>
        <PageState loading={mine.loading} error={mine.error} />
        {mine.data && <EventList events={mine.data.events} empty="You have not joined an event yet." />}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open to everyone</h2>
        <PageState loading={open.loading} error={open.error} />
        {open.data && <EventList events={open.data.events.filter((e) => !joined.has(e.id))} empty="No other public events are open right now." />}
      </section>
      <Card className="text-sm text-muted">
        No event? You can still <Link to="/interview/new" className="font-medium text-accent hover:underline">take an interview on any repository you wrote</Link>.
      </Card>
    </div>
  );
}
