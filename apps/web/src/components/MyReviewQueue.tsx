import { Link } from 'react-router-dom';
import { Badge, SectionHeader, Spinner } from './shared';
import { useLoad } from '../lib/useLoad';

interface MyAssignment {
  submission_id: string;
  event_id: string;
  events: { name: string; status: string } | null;
  submissions: { team_name: string } | null;
  my_review: { status: 'draft' | 'submitted' } | null;
}

/** For judges: the submissions assigned to them, across events, with the state of their review. */
export function MyReviewQueue() {
  const { data, loading, error } = useLoad<{ assignments: MyAssignment[] }>('/api/me/assignments');
  const list = data?.assignments ?? [];
  if (loading) return <Spinner label="Loading your review queue" />;
  if (error) return null;
  return (
    <section className="space-y-3 rounded-[6px] border border-line bg-white p-5">
      <SectionHeader eyebrow="JUDGE WORKSPACE" title="Your review queue" subtitle="Submissions an organizer assigned to you." />
      {list.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing is assigned to you yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((a) => (
            <li key={a.submission_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <Link to={`/org/events/${a.event_id}/s/${a.submission_id}`} className="font-medium text-ink hover:text-accent">
                {a.submissions?.team_name ?? 'Submission'} <span className="text-muted">· {a.events?.name ?? 'Event'}</span>
              </Link>
              <Badge tone={a.my_review?.status === 'submitted' ? 'good' : a.my_review ? 'warn' : 'neutral'}>
                {a.my_review?.status === 'submitted' ? 'SUBMITTED' : a.my_review ? 'DRAFT' : 'TO REVIEW'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
