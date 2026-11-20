/** For students: the courses they are on the roster of, and each assignment with the state of their own submission. */
import { Link } from 'react-router-dom';
import { Badge, DossierPageHeader, PageState, formatDate, linkButton } from '../components/shared';
import { STATUS_LABEL, type EventView } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import type { AssignmentView } from '../lib/courses';

interface MyCourse {
  id: string;
  name: string;
  code: string;
  term: string;
  organization: string | null;
  role: 'student' | 'ta' | 'instructor';
  section: string;
  assignments: (AssignmentView & { my_submission: { status: string; versions_used: number } | null })[];
}

/** What the student should do next for an assignment. */
export function nextStep(a: { status: EventView['status']; due_at: string; my_submission: { status: string } | null }, now = Date.now()): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'accent' } {
  if (a.status === 'published') return { label: 'Results ready', tone: 'accent' };
  if (a.status === 'open' && Date.parse(a.due_at) > now) return a.my_submission ? { label: 'Submitted', tone: 'good' } : { label: 'To do', tone: 'warn' };
  if (!a.my_submission) return { label: 'Missed', tone: 'bad' };
  return { label: 'Being graded', tone: 'neutral' };
}

export function MyCourses() {
  const data = useLoad<{ courses: MyCourse[] }>('/api/me/courses');
  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="list" />;
  const courses = data.data.courses;
  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={<span className="font-semibold tracking-wider text-accent-ink uppercase">My courses</span>}
        title="My courses"
        subtitle="Assignments from your courses. Only the students of each course see them; there is nothing to join."
      />
      {courses.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-white p-8 text-center text-[13px] text-muted">
          You are not on any course roster yet. Your instructor adds you with the email of your SkillProof account.
        </section>
      ) : (
        courses.map((c) => (
          <section key={c.id} className="rounded-[6px] border border-line bg-white">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {[c.organization, c.code, c.term, c.section && `Section ${c.section}`].filter(Boolean).join(' · ')}
                </p>
                <h2 className="font-serif-heading text-[22px] text-ink">{c.name}</h2>
              </div>
              {c.role !== 'student' && <Badge tone="accent">{c.role === 'ta' ? 'TA' : 'Instructor'}</Badge>}
            </header>
            {c.assignments.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted">No assignments published yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.assignments.map((a) => {
                  const step = nextStep(a);
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div>
                        <p className="text-[14px] font-medium text-ink">{a.title}</p>
                        <p className="text-[12px] text-muted">
                          Due {formatDate(a.due_at)} · <span>{STATUS_LABEL[a.status]}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={step.tone}>{step.label}</Badge>
                        <Link to={`/courses/${c.id}/a/${a.id}`} className={linkButton}>
                          {step.label === 'To do' ? 'Submit' : 'Open'}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}
