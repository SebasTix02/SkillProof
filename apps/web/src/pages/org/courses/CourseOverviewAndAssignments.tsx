import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Button,
  NumberedSectionCard,
  formatDate,
  linkButton,
  linkButtonSecondary,
  useConfirm,
} from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { t, tr } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { COURSE_STATUS_TONE, groupSizeLabel, type AssignmentView } from '../../../lib/courses';
import { notifyCoursesChanged } from '../../../lib/navCourses';
import { STATUS_LABEL } from '../../../lib/types';
import type { CourseDetail } from './types';

export function CourseOverview({ detail }: { detail: CourseDetail }) {
  const { course, assignments, members } = detail;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { org } = useAuth();
  const [now] = useState(() => Date.now());
  const students = members.filter((m) => m.role === 'student').length;
  const staff = members.length - students;
  const upcoming = assignments.filter((a) => a.status === 'open' && Date.parse(a.due_at) > now);
  const toGrade = assignments.filter((a) => a.status === 'judging' || a.status === 'review');

  async function archive() {
    const ok = await confirm({
      title: tr('Archive {name}?', { name: course.name }),
      body: tr('It leaves the course list. Its assignments, submissions and grades stay.'),
      confirmLabel: tr('Archive course'),
    });
    if (!ok) return;
    try {
      await api(`/api/courses/${course.id}/archive`, { method: 'POST' });
      toast.success(tr('Course archived.'));
      notifyCoursesChanged();
      navigate('/org/courses');
    } catch (err) {
      toast.error(tr('Could not archive the course. {error}', { error: errorMessage(err) }));
    }
  }

  const tiles = [
    { label: tr('Students'), value: students, hint: staff === 1 ? tr('1 instructor or TA') : tr('{n} instructors and TAs', { n: staff }) },
    { label: tr('Assignments'), value: assignments.length, hint: `${upcoming.length} open now` },
    { label: tr('To grade'), value: toGrade.length, hint: tr('judging or in review') },
    { label: tr('Submissions'), value: assignments.reduce((n, a) => n + a.submission_count, 0), hint: 'across all assignments' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[6px] border border-line bg-surface p-4">
            <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{tile.label}</p>
            <p className="font-serif-heading mt-1 text-[28px] leading-none text-ink">{tile.value}</p>
            <p className="mt-1 text-[12px] text-muted">{tile.hint}</p>
          </div>
        ))}
      </div>
      <NumberedSectionCard number="→" icon="event_upcoming" title={tr('Next due')} subtitle={tr('Open assignments, by due date.')} theme="accent">
        {upcoming.length === 0 ? (
          <p className="text-[13px] text-muted">
            {tr('Nothing is open right now.')}{' '}
            <Link to={`/org/courses/${course.id}/assignments`} className="font-semibold text-accent-ink hover:underline">
              {tr('See all assignments')}
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.slice(0, 5).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                <Link to={`/org/courses/${course.id}/assignments/${a.id}`} className="font-medium text-ink hover:text-accent-ink">
                  {a.title}
                </Link>
                <span className="text-muted">
                  {tr('Due {date} · {done}/{total} submitted', { date: formatDate(a.due_at), done: a.submission_count, total: a.student_count })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </NumberedSectionCard>
      {org?.permissions.includes('course.manage') && (
        <NumberedSectionCard number="!" icon="archive" title={tr('Archive course')} subtitle={tr('Hide it from the list when the term is over.')} theme="bad">
          <Button type="button" variant="danger" onClick={() => void archive()}>
            {tr('Archive course')}
          </Button>
        </NumberedSectionCard>
      )}
    </div>
  );
}

export function CourseAssignmentsTable({
  courseId,
  assignments,
  canManage,
}: {
  courseId: string;
  assignments: AssignmentView[];
  canManage: boolean;
}) {
  if (assignments.length === 0)
    return (
      <section className="rounded-[6px] border border-line bg-surface p-8 text-center">
        <p className="font-serif-heading text-[22px] text-ink">{tr('No assignments yet')}</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
          {tr('An assignment is open to the students on the roster: they submit a repository before the due date and SkillProof grades it with your rubric.')}
        </p>
        {canManage && (
          <Link to={`/org/courses/${courseId}/assignments/new`} className={`${linkButton} mt-4`}>
            {tr('New assignment')}
          </Link>
        )}
      </section>
    );
  return (
    <section className="overflow-x-auto rounded-[6px] border border-line bg-surface">
      <table className="w-full text-left text-[13px]">
        <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
          <tr>
            <th className="px-5 py-2.5 font-semibold">{tr('Assignment')}</th>
            <th className="px-5 py-2.5 font-semibold">{tr('Status')}</th>
            <th className="px-5 py-2.5 font-semibold">{tr('Work')}</th>
            <th className="px-5 py-2.5 font-semibold">{tr('Opens')}</th>
            <th className="px-5 py-2.5 font-semibold">{tr('Due')}</th>
            <th className="px-5 py-2.5 font-semibold">{tr('Submitted')}</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {assignments.map((a) => (
            <tr key={a.id}>
              <td className="px-5 py-3">
                <Link to={`/org/courses/${courseId}/assignments/${a.id}`} className="font-medium text-ink hover:text-accent-ink">
                  {a.title}
                </Link>
                {a.interviews_enabled && <span className="ml-2 text-[11px] text-muted">{tr('· voice interview')}</span>}
              </td>
              <td className="px-5 py-3">
                <Badge tone={COURSE_STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              </td>
              <td className="px-5 py-3 text-muted">{groupSizeLabel(a)}</td>
              <td className="px-5 py-3 text-muted">{formatDate(a.opens_at)}</td>
              <td className="px-5 py-3 text-muted">{formatDate(a.due_at)}</td>
              <td className="font-mono-code px-5 py-3 text-ink">
                {a.submission_count} / {a.student_count}
              </td>
              <td className="px-5 py-3 text-right">
                <Link to={`/org/courses/${courseId}/assignments/${a.id}`} className={linkButtonSecondary}>
                  {t('common.open')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
