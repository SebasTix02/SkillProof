import { tr, trn } from '../../i18n';
import { rich } from '../../i18n/rich';
/**
 * Courses, apart from events. A course has a roster (instructors, TAs, students by section) and assignments that only
 * its students can see and submit to. Screens:
 *   /org/courses                               list + new course
 *   /org/courses/:courseId                     overview
 *   /org/courses/:courseId/roster              who is in the course
 *   /org/courses/:courseId/assignments         assignments (+ /new)
 *   /org/courses/:courseId/gradebook           students × assignments
 * The console of one assignment is AssignmentConsole.tsx (/org/courses/:courseId/assignments/:id).
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  DossierPageHeader,
  Field,
  Input,
  NumberedSectionCard,
  PageState,
  Tabs,
  Textarea,
  linkButton,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { notifyCoursesChanged } from '../../lib/navCourses';
import { useLoad } from '../../lib/useLoad';
import { CourseGradebook } from './courses/CourseGradebook';
import { CourseAssignmentsTable, CourseOverview } from './courses/CourseOverviewAndAssignments';
import { CourseRoster } from './courses/CourseRoster';
import type { CourseDetail, CourseSummary } from './courses/types';

export { AdjustGrade } from './courses/CourseGradebook';
export { NewAssignment } from './courses/NewAssignmentPage';

export function CoursesHome() {
  const { org } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const canManage = !!org?.permissions.includes('course.manage');
  const list = useLoad<{ courses: CourseSummary[] }>(org ? `/api/orgs/${org.id}/courses` : null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', term: '', description: '' });
  const [busy, setBusy] = useState(false);

  async function createCourse(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    try {
      const res = await api<{ course: CourseSummary }>(`/api/orgs/${org.id}/courses`, { body: form });
      toast.success(tr('Course {name} created.', { name: res.course.name }));
      notifyCoursesChanged();
      navigate(`/org/courses/${res.course.id}/roster`);
    } catch (err) {
      toast.error(tr('Could not create the course. {error}', { error: errorMessage(err) }));
      setBusy(false);
    }
  }

  const courses = list.data?.courses ?? [];
  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={<span className="font-semibold tracking-wider text-accent-ink uppercase">{tr('Courses ·')}{' '}{org?.name}</span>}
        title={tr('Courses')}
        subtitle={tr('Each course has its roster and its assignments. Only the students on the roster see an assignment and can submit to it.')}
        rightSlot={
          canManage && !creating ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>{tr('New course')}</span>
            </Button>
          ) : null
        }
      />

      {creating && (
        <NumberedSectionCard number="+" icon="school" title={tr('New course')} subtitle={tr('Students are added on its roster afterwards, by email.')} theme="accent">
          <form onSubmit={(e) => void createCourse(e)} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label={tr('Name')}>
              <Input required minLength={2} placeholder={tr('Algorithms')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={tr('Code')}>
              <Input placeholder={tr('CS-201')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label={tr('Term')}>
              <Input placeholder={tr('Fall 2026')} value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </Field>
            <div className="md:col-span-4">
              <Field label={tr('Description')}>
                <Textarea rows={2} placeholder={tr('Optional')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2 md:col-span-4">
              <Button type="submit" loading={busy}>{tr('Create course')}</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                {tr('Cancel')}
              </Button>
            </div>
          </form>
        </NumberedSectionCard>
      )}

      {list.loading || list.error ? (
        <PageState loading={list.loading} error={list.error} kind="cards" />
      ) : courses.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-surface p-8 text-center">
          <p className="font-serif-heading text-[22px] text-ink">{tr('No courses yet')}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
            {tr('A course keeps a roster of students and the assignments only they can submit to, with a gradebook across all of them.')}
          </p>
          {canManage && !creating && (
            <button type="button" onClick={() => setCreating(true)} className={`${linkButton} mt-4 cursor-pointer`}>
              {tr('Create your first course')}
            </button>
          )}
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <Link to={`/org/courses/${c.id}`} className="card-interactive block h-full rounded-[6px] border border-line bg-surface p-5 hover:border-accent-ui">
                <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {[c.code, c.term].filter(Boolean).join(' · ') || tr('Course')}
                </p>
                <p className="font-serif-heading mt-1 text-[22px] leading-[28px] text-ink">{c.name}</p>
                {c.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{c.description}</p>}
                <div className="mt-4 flex gap-4 text-[12px] text-muted">
                  <span>
                    <strong className="text-ink">{c.member_count}</strong>{' '}{tr('on the roster')}
                  </span>
                  <span>
                    {rich(trn('{n} assignment', '{n} assignments', c.assignment_count), { n: <strong className="text-ink">{c.assignment_count}</strong> })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CourseTab = 'overview' | 'roster' | 'assignments' | 'gradebook';
const tabs = (): { key: CourseTab; label: string; icon: string }[] => [
  { key: 'overview', label: tr('Overview'), icon: 'dashboard' },
  { key: 'roster', label: tr('Roster'), icon: 'group' },
  { key: 'assignments', label: tr('Assignments'), icon: 'assignment' },
  { key: 'gradebook', label: tr('Gradebook'), icon: 'table_chart' },
];

export function CoursePage() {
  const { courseId = '', tab = 'overview' } = useParams();
  const active = (tabs().some((t) => t.key === tab) ? tab : 'overview') as CourseTab;
  const detail = useLoad<CourseDetail>(`/api/courses/${courseId}`);
  const { org } = useAuth();
  const canManage = !!org?.permissions.includes('course.manage');

  if (!detail.data) return <PageState loading={detail.loading} error={detail.error} kind="sections" />;
  const { course, assignments, members } = detail.data;
  const students = members.filter((m) => m.role === 'student');

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to="/org/courses" className="text-accent-ink hover:underline">
              {tr('← COURSES')}
            </Link>
            <span className="text-muted">{[course.code, course.term].filter(Boolean).join(' · ')}</span>
          </>
        }
        title={course.name}
        subtitle={course.description || tr('{students} students · {assignments} assignments. Assignments are open only to the students on the roster.', { students: students.length, assignments: assignments.length })}
        rightSlot={
          canManage ? (
            <Link to={`/org/courses/${course.id}/assignments/new`} className={linkButton}>
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>{tr('New assignment')}</span>
            </Link>
          ) : null
        }
      />

      {/* The course's own screens. The side menu has tr('Courses'); these are the sections of one course. */}
      <Tabs
        ariaLabel={tr('Course sections')}
        active={active}
        tabs={tabs().map((t) => ({
          key: t.key,
          label: t.label,
          icon: t.icon,
          to: t.key === 'overview' ? `/org/courses/${course.id}` : `/org/courses/${course.id}/${t.key}`,
          count: t.key === 'roster' ? members.length : t.key === 'assignments' ? assignments.length : undefined,
        }))}
      />

      {active === 'overview' && <CourseOverview detail={detail.data} />}
      {active === 'roster' && <CourseRoster detail={detail.data} onChanged={() => void detail.reload()} canManage={canManage} />}
      {active === 'assignments' && <CourseAssignmentsTable courseId={course.id} assignments={assignments} canManage={canManage} />}
      {active === 'gradebook' && <CourseGradebook courseId={course.id} canManage={canManage} />}
    </div>
  );
}
