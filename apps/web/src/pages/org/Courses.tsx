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
import { CreateAssignmentSchema, DEFAULT_GROUP_MAX, DEFAULT_GROUP_MIN, DEFAULT_RUBRIC, type Rubric } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  DossierPageHeader,
  Field,
  Input,
  Notice,
  NumberedSectionCard,
  PageState,
  Select,
  Textarea,
  ToggleSwitch,
  formatDate,
  linkButton,
  linkButtonSecondary,
  scoreTone,
  useConfirm,
} from '../../components/shared';
import { RubricEditor, keyFromName } from '../../components/RubricEditor';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { COURSE_STATUS_TONE, groupSizeLabel, localInput, type AssignmentMode, type AssignmentView } from '../../lib/courses';
import { STATUS_LABEL } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';

interface CourseSummary {
  id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  member_count: number;
  assignment_count: number;
  archived_at: string | null;
}

interface Member {
  user_id: string;
  role: 'instructor' | 'ta' | 'student';
  section: string;
  created_at: string;
  profiles: { display_name: string; github_login: string | null } | null;
}

interface CourseDetail {
  course: CourseSummary & { organization_id: string; created_at: string };
  assignments: AssignmentView[];
  members: Member[];
  access: 'staff' | 'student' | 'ta';
}

const ROLE_LABEL: Record<Member['role'], string> = { instructor: 'Instructor', ta: 'TA', student: 'Student' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// ---------------------------------------------------------------------------------------------------------------------
// /org/courses
// ---------------------------------------------------------------------------------------------------------------------

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
      toast.success(`Course ${res.course.name} created.`);
      navigate(`/org/courses/${res.course.id}/roster`);
    } catch (err) {
      toast.error(`Could not create the course. ${errorMessage(err)}`);
      setBusy(false);
    }
  }

  const courses = list.data?.courses ?? [];
  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={<span className="font-semibold tracking-wider text-accent-ink uppercase">Courses · {org?.name}</span>}
        title="Courses"
        subtitle="Each course has its roster and its assignments. Only the students on the roster see an assignment and can submit to it."
        rightSlot={
          canManage && !creating ? (
            <Button type="button" onClick={() => setCreating(true)}>
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>New course</span>
            </Button>
          ) : null
        }
      />

      {creating && (
        <NumberedSectionCard number="+" icon="school" title="New course" subtitle="Students are added on its roster afterwards, by email." theme="accent">
          <form onSubmit={(e) => void createCourse(e)} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Name">
              <Input required minLength={2} placeholder="Algorithms" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Code">
              <Input placeholder="CS-201" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Term">
              <Input placeholder="Fall 2026" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </Field>
            <div className="md:col-span-4">
              <Field label="Description">
                <Textarea rows={2} placeholder="Optional" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            <div className="flex gap-2 md:col-span-4">
              <Button type="submit" loading={busy}>Create course</Button>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </NumberedSectionCard>
      )}

      {list.loading || list.error ? (
        <PageState loading={list.loading} error={list.error} kind="cards" />
      ) : courses.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-white p-8 text-center">
          <p className="font-serif-heading text-[22px] text-ink">No courses yet</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
            A course keeps a roster of students and the assignments only they can submit to, with a gradebook across all of them.
          </p>
          {canManage && !creating && (
            <button type="button" onClick={() => setCreating(true)} className={`${linkButton} mt-4 cursor-pointer`}>
              Create your first course
            </button>
          )}
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => (
            <li key={c.id}>
              <Link to={`/org/courses/${c.id}`} className="card-interactive block h-full rounded-[6px] border border-line bg-white p-5 hover:border-accent-ui">
                <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {[c.code, c.term].filter(Boolean).join(' · ') || 'Course'}
                </p>
                <p className="font-serif-heading mt-1 text-[22px] leading-[28px] text-ink">{c.name}</p>
                {c.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{c.description}</p>}
                <div className="mt-4 flex gap-4 text-[12px] text-muted">
                  <span>
                    <strong className="text-ink">{c.member_count}</strong> on the roster
                  </span>
                  <span>
                    <strong className="text-ink">{c.assignment_count}</strong> {c.assignment_count === 1 ? 'assignment' : 'assignments'}
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

// ---------------------------------------------------------------------------------------------------------------------
// /org/courses/:courseId[/tab]
// ---------------------------------------------------------------------------------------------------------------------

type CourseTab = 'overview' | 'roster' | 'assignments' | 'gradebook';
const TABS: { key: CourseTab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: 'dashboard' },
  { key: 'roster', label: 'Roster', icon: 'group' },
  { key: 'assignments', label: 'Assignments', icon: 'assignment' },
  { key: 'gradebook', label: 'Gradebook', icon: 'table_chart' },
];

export function CoursePage() {
  const { courseId = '', tab = 'overview' } = useParams();
  const active = (TABS.some((t) => t.key === tab) ? tab : 'overview') as CourseTab;
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
              ← COURSES
            </Link>
            <span className="text-muted">{[course.code, course.term].filter(Boolean).join(' · ')}</span>
          </>
        }
        title={course.name}
        subtitle={course.description || `${students.length} students · ${assignments.length} assignments. Assignments are open only to the students on the roster.`}
        rightSlot={
          canManage ? (
            <Link to={`/org/courses/${course.id}/assignments/new`} className={linkButton}>
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>New assignment</span>
            </Link>
          ) : null
        }
      />

      {/* The course's own screens. The side menu has "Courses"; these are the sections of one course. */}
      <nav aria-label="Course sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={t.key === 'overview' ? `/org/courses/${course.id}` : `/org/courses/${course.id}/${t.key}`}
            aria-current={active === t.key ? 'page' : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
              active === t.key ? 'border-accent-ui text-accent-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {t.icon}
            </span>
            {t.label}
            {t.key === 'roster' && <span className="font-mono-code text-[11px] text-muted">{members.length}</span>}
            {t.key === 'assignments' && <span className="font-mono-code text-[11px] text-muted">{assignments.length}</span>}
          </Link>
        ))}
      </nav>

      {active === 'overview' && <Overview detail={detail.data} />}
      {active === 'roster' && <Roster detail={detail.data} onChanged={() => void detail.reload()} canManage={canManage} />}
      {active === 'assignments' && <Assignments courseId={course.id} assignments={assignments} canManage={canManage} />}
      {active === 'gradebook' && <Gradebook courseId={course.id} canManage={canManage} />}
    </div>
  );
}

function Overview({ detail }: { detail: CourseDetail }) {
  const { course, assignments, members } = detail;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { org } = useAuth();
  const students = members.filter((m) => m.role === 'student').length;
  const staff = members.length - students;
  const now = Date.now();
  const upcoming = assignments.filter((a) => a.status === 'open' && Date.parse(a.due_at) > now);
  const toGrade = assignments.filter((a) => a.status === 'judging' || a.status === 'review');

  async function archive() {
    const ok = await confirm({ title: `Archive ${course.name}?`, body: 'It leaves the course list. Its assignments, submissions and grades stay.', confirmLabel: 'Archive course' });
    if (!ok) return;
    try {
      await api(`/api/courses/${course.id}/archive`, { method: 'POST' });
      toast.success('Course archived.');
      navigate('/org/courses');
    } catch (err) {
      toast.error(`Could not archive the course. ${errorMessage(err)}`);
    }
  }

  const tiles = [
    { label: 'Students', value: students, hint: staff === 1 ? '1 instructor or TA' : `${staff} instructors and TAs` },
    { label: 'Assignments', value: assignments.length, hint: `${upcoming.length} open now` },
    { label: 'To grade', value: toGrade.length, hint: 'judging or in review' },
    { label: 'Submissions', value: assignments.reduce((n, a) => n + a.submission_count, 0), hint: 'across all assignments' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[6px] border border-line bg-white p-4">
            <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{t.label}</p>
            <p className="font-serif-heading mt-1 text-[28px] leading-none text-ink">{t.value}</p>
            <p className="mt-1 text-[12px] text-muted">{t.hint}</p>
          </div>
        ))}
      </div>
      <NumberedSectionCard number="→" icon="event_upcoming" title="Next due" subtitle="Open assignments, by due date." theme="accent">
        {upcoming.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing is open right now.{' '}
            <Link to={`/org/courses/${course.id}/assignments`} className="font-semibold text-accent-ink hover:underline">
              See all assignments
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
                  Due {formatDate(a.due_at)} · {a.submission_count}/{a.student_count} submitted
                </span>
              </li>
            ))}
          </ul>
        )}
      </NumberedSectionCard>
      {org?.permissions.includes('course.manage') && (
        <NumberedSectionCard number="!" icon="archive" title="Archive course" subtitle="Hide it from the list when the term is over." theme="bad">
          <Button type="button" variant="danger" onClick={() => void archive()}>
            Archive course
          </Button>
        </NumberedSectionCard>
      )}
    </div>
  );
}

function Roster({ detail, onChanged, canManage }: { detail: CourseDetail; onChanged: () => void; canManage: boolean }) {
  const { course, members } = detail;
  const toast = useToast();
  const confirm = useConfirm();
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<Member['role']>('student');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [withoutAccount, setWithoutAccount] = useState<string[]>([]);
  const [filter, setFilter] = useState('');

  const parsed = emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const valid = parsed.length > 0 && parsed.every((e) => EMAIL.test(e));

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy('add');
    try {
      const res = await api<{ added: number; without_account: string[] }>(`/api/courses/${course.id}/members`, {
        body: { emails: parsed, role, section: section.trim() },
      });
      setWithoutAccount(res.without_account);
      setEmails('');
      toast.success(`${res.added} added to ${course.name}.`);
      onChanged();
    } catch (err) {
      toast.error(`Could not add them. ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: Member) {
    const name = m.profiles?.display_name ?? 'this person';
    const ok = await confirm({
      title: `Remove ${name} from ${course.name}?`,
      body: m.role === 'student' ? 'They stop seeing the course assignments. Their past submissions stay. You can add them again later.' : 'They stop helping run this course.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(m.user_id);
    try {
      await api(`/api/courses/${course.id}/members/${m.user_id}`, { method: 'DELETE' });
      toast.success(`${name} removed.`);
      onChanged();
    } catch (err) {
      toast.error(`Could not remove them. ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  const sections = [...new Set(members.map((m) => m.section).filter(Boolean))].sort();
  const shown = members.filter((m) => !filter || m.section === filter);
  return (
    <div className="space-y-6">
      {canManage && (
        <NumberedSectionCard number="+" icon="person_add" title="Add to the roster" subtitle="By email. Students get every assignment of the course; instructors and TAs help run it." theme="accent">
          <form onSubmit={(e) => void add(e)} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
            <Field label="Emails" hint="Separate them with commas, spaces or new lines.">
              <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ana@uni.edu, cy@uni.edu" />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as Member['role'])}>
                <option value="student">Student</option>
                <option value="ta">TA</option>
                <option value="instructor">Instructor</option>
              </Select>
            </Field>
            <Field label="Section">
              <Input value={section} maxLength={40} onChange={(e) => setSection(e.target.value)} placeholder="A" />
            </Field>
            <Button type="submit" disabled={!valid} loading={busy === 'add'}>
              Add
            </Button>
          </form>
          {withoutAccount.length > 0 && (
            <div className="mt-3">
              <Notice tone="warn">
                No SkillProof account yet: {withoutAccount.join(', ')}. Ask them to sign up with that email, then add them again.
              </Notice>
            </div>
          )}
        </NumberedSectionCard>
      )}

      <section className="rounded-[6px] border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-[14px] font-semibold text-ink">
            {members.length} {members.length === 1 ? 'person' : 'people'}
          </p>
          {sections.length > 0 && (
            <div className="w-44">
            <Select aria-label="Section" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All sections</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  Section {s}
                </option>
              ))}
            </Select>
            </div>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted">Nobody on the roster yet. Add students by email above.</p>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Name</th>
                <th className="px-5 py-2.5 font-semibold">Role</th>
                <th className="px-5 py-2.5 font-semibold">Section</th>
                <th className="px-5 py-2.5 font-semibold">Added</th>
                {canManage && <th className="px-5 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((m) => (
                <tr key={m.user_id}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink">{m.profiles?.display_name ?? 'Unnamed'}</span>
                    {m.profiles?.github_login && <span className="font-mono-code ml-2 text-[11px] text-muted">@{m.profiles.github_login}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.role === 'student' ? 'neutral' : 'accent'}>{ROLE_LABEL[m.role]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{m.section || '—'}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(m.created_at)}</td>
                  {canManage && (
                    <td className="px-5 py-3 text-right">
                      <Button type="button" variant="ghost" loading={busy === m.user_id} onClick={() => void remove(m)} className="px-2.5 py-1 text-[12px]">
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Assignments({ courseId, assignments, canManage }: { courseId: string; assignments: AssignmentView[]; canManage: boolean }) {
  if (assignments.length === 0)
    return (
      <section className="rounded-[6px] border border-line bg-white p-8 text-center">
        <p className="font-serif-heading text-[22px] text-ink">No assignments yet</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">
          An assignment is open to the students on the roster: they submit a repository before the due date and SkillProof grades it with your rubric.
        </p>
        {canManage && (
          <Link to={`/org/courses/${courseId}/assignments/new`} className={`${linkButton} mt-4`}>
            New assignment
          </Link>
        )}
      </section>
    );
  return (
    <section className="overflow-x-auto rounded-[6px] border border-line bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
          <tr>
            <th className="px-5 py-2.5 font-semibold">Assignment</th>
            <th className="px-5 py-2.5 font-semibold">Status</th>
            <th className="px-5 py-2.5 font-semibold">Work</th>
            <th className="px-5 py-2.5 font-semibold">Opens</th>
            <th className="px-5 py-2.5 font-semibold">Due</th>
            <th className="px-5 py-2.5 font-semibold">Submitted</th>
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
                {a.interviews_enabled && <span className="ml-2 text-[11px] text-muted">· voice interview</span>}
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
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface GradeCell {
  submission_id: string;
  status: string;
  total: number | null;
  grade: number | null;
  adjusted: boolean;
  group: string | null;
}

interface GradebookResponse {
  assignments: AssignmentView[];
  students: { user_id: string; display_name: string; github_login: string | null; section: string; grades: Record<string, GradeCell> }[];
}

/**
 * Students × assignments. In a group assignment every member gets the group total; staff can set another total for
 * one student (the change is marked, and "Use the group grade" removes it).
 */
function Gradebook({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const book = useLoad<GradebookResponse>(`/api/courses/${courseId}/gradebook`);
  const [editing, setEditing] = useState<{ assignmentId: string; userId: string } | null>(null);
  if (!book.data) return <PageState loading={book.loading} error={book.error} kind="table" />;
  const { assignments, students } = book.data;

  function exportCsv() {
    const header = ['student', 'section', ...assignments.map((a) => a.title)];
    const lines = students.map((s) => [s.display_name, s.section, ...assignments.map((a) => s.grades[a.id]?.grade?.toFixed(1) ?? '')]);
    const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gradebook.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (students.length === 0 || assignments.length === 0)
    return (
      <section className="rounded-[6px] border border-line bg-white p-8 text-center text-[13px] text-muted">
        The gradebook fills in once the course has students and assignments.
      </section>
    );
  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-[13px] text-muted">
          Grade out of 10 per assignment. Group work: each member gets the group grade unless you adjust it (<span className="font-mono-code text-accent-ink">adj.</span>). Empty: no submission.
        </p>
        <Button type="button" variant="secondary" onClick={exportCsv}>
          <span className="material-symbols-outlined text-[16px]">file_download</span>
          <span>Export CSV</span>
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
            <tr>
              <th className="sticky left-0 bg-paper px-5 py-2.5 font-semibold">Student</th>
              <th className="px-3 py-2.5 font-semibold">Section</th>
              {assignments.map((a) => (
                <th key={a.id} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                  {a.title}
                  {a.mode === 'group' && <span className="ml-1 font-normal normal-case">· group</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.map((s) => (
              <tr key={s.user_id}>
                <td className="sticky left-0 bg-white px-5 py-2.5 font-medium text-ink">{s.display_name}</td>
                <td className="px-3 py-2.5 text-muted">{s.section || '—'}</td>
                {assignments.map((a) => {
                  const g = s.grades[a.id];
                  const open = editing?.assignmentId === a.id && editing.userId === s.user_id;
                  return (
                    <td key={a.id} className="px-3 py-2.5 align-top">
                      {!g ? (
                        <span className="text-faint">—</span>
                      ) : open ? (
                        <AdjustGrade
                          assignmentId={a.id}
                          userId={s.user_id}
                          student={s.display_name}
                          cell={g}
                          onDone={() => {
                            setEditing(null);
                            void book.reload();
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Link to={`/org/courses/${courseId}/assignments/${a.id}/s/${g.submission_id}`} className="hover:underline" title={g.group ? `Group: ${g.group}` : undefined}>
                            {g.grade != null ? (
                              <Badge tone={scoreTone(g.grade)}>{g.grade.toFixed(1)}</Badge>
                            ) : (
                              <span className="text-[12px] text-muted">{g.status}</span>
                            )}
                          </Link>
                          {g.adjusted && <span className="font-mono-code text-[10px] text-accent-ink" title={`Group grade ${g.total?.toFixed(1) ?? '—'}`}>adj.</span>}
                          {canManage && a.mode === 'group' && g.total != null && (
                            <button
                              type="button"
                              onClick={() => setEditing({ assignmentId: a.id, userId: s.user_id })}
                              aria-label={`Adjust the grade of ${s.display_name} on ${a.title}`}
                              className="cursor-pointer rounded-[3px] p-0.5 text-muted hover:bg-well hover:text-ink"
                            >
                              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">edit</span>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Sets or removes one student's own total on a group assignment. */
export function AdjustGrade({ assignmentId, userId, student, cell, onDone }: { assignmentId: string; userId: string; student: string; cell: Pick<GradeCell, 'total' | 'grade' | 'adjusted'>; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(cell.grade ?? cell.total ?? ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const target = userId;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/adjustments/${target}`, { method: 'PUT', body: { adjusted_total: Number(value), note } });
      toast.success(`Grade of ${student} set to ${Number(value).toFixed(1)}.`);
      onDone();
    } catch (err) {
      toast.error(`The grade was not saved. ${errorMessage(err)}`);
      setBusy(false);
    }
  }

  async function reset() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/adjustments/${target}`, { method: 'DELETE' });
      toast.success(`${student} has the group grade again.`);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="w-56 space-y-2 rounded-[4px] border border-line bg-paper p-2.5">
      <p className="text-[11px] text-muted">Group grade: {cell.total?.toFixed(1) ?? '—'}</p>
      <Input type="number" min={0} max={10} step={0.1} required aria-label={`Grade for ${student}`} value={value} onChange={(e) => setValue(e.target.value)} />
      <Input aria-label="Reason" placeholder="Reason (optional)" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        <Button type="submit" loading={busy} className="px-2.5 py-1 text-[12px]">Save</Button>
        {cell.adjusted && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void reset()} className="px-2.5 py-1 text-[12px]">
            Use the group grade
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone} className="px-2.5 py-1 text-[12px]">Cancel</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// /org/courses/:courseId/assignments/new
// ---------------------------------------------------------------------------------------------------------------------

export function NewAssignment() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const detail = useLoad<CourseDetail>(`/api/courses/${courseId}`);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [learningGoals, setLearningGoals] = useState('');
  const [mode, setMode] = useState<AssignmentMode>('individual');
  const [groupMin, setGroupMin] = useState(DEFAULT_GROUP_MIN);
  const [groupMax, setGroupMax] = useState(DEFAULT_GROUP_MAX);
  const [lockEarly, setLockEarly] = useState(false);
  const [groupLockAt, setGroupLockAt] = useState(() => localInput(new Date(Date.now() + 3 * 24 * 3600_000)));
  const [opensAt, setOpensAt] = useState(() => localInput(new Date()));
  const [dueAt, setDueAt] = useState(() => localInput(new Date(Date.now() + 7 * 24 * 3600_000)));
  const [unlimited, setUnlimited] = useState(true);
  const [maxSubmissions, setMaxSubmissions] = useState(3);
  const [interviews, setInterviews] = useState(false);
  const [rubric, setRubric] = useState<Rubric>(() => DEFAULT_RUBRIC.map((c) => ({ ...c, anchors: { ...c.anchors } })));
  const [busy, setBusy] = useState<'draft' | 'open' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!detail.data) return <PageState loading={detail.loading} error={detail.error} kind="sections" />;
  const { course, members } = detail.data;
  const students = members.filter((m) => m.role === 'student').length;

  async function submit(e: FormEvent, publish: boolean) {
    e.preventDefault();
    setError(null);
    const parsed = CreateAssignmentSchema.safeParse({
      title: title.trim(),
      instructions,
      learning_goals: learningGoals,
      mode,
      group_min: mode === 'group' ? groupMin : null,
      group_max: mode === 'group' ? groupMax : null,
      group_lock_at: mode === 'group' && lockEarly ? new Date(groupLockAt).toISOString() : null,
      opens_at: new Date(opensAt).toISOString(),
      due_at: new Date(dueAt).toISOString(),
      max_submissions: unlimited ? null : maxSubmissions,
      interviews_enabled: interviews,
      rubric: rubric.map((c) => ({ ...c, key: c.key || keyFromName(c.name) })),
      publish,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? `${issue.path.join(' › ') || 'Form'}: ${issue.message}` : 'Check the form and try again.');
      return;
    }
    setBusy(publish ? 'open' : 'draft');
    try {
      const res = await api<{ assignment: AssignmentView }>(`/api/courses/${courseId}/assignments`, { body: parsed.data });
      navigate(`/org/courses/${courseId}/assignments/${res.assignment.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e, true)} className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <Link to={`/org/courses/${courseId}/assignments`} className="text-accent-ink hover:underline">
            ← {course.name.toUpperCase()} · ASSIGNMENTS
          </Link>
        }
        title="New assignment"
        subtitle={`For the ${students} ${students === 1 ? 'student' : 'students'} on the roster of ${course.name}. Students added later get it too.`}
      />

      <NumberedSectionCard number="01" icon="assignment" title="Assignment" subtitle="What students must build and when it is due." theme="accent">
        <div className="space-y-4">
          <Field label="Title">
            <Input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lab 3: Sorting algorithms" />
          </Field>
          <Field label="Instructions" hint="Shown to the students of the course.">
            <Textarea rows={4} maxLength={4000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What to build, what to include in the README, how it is graded…" />
          </Field>
          <Field label="Learning goals" hint="What students should show they understand. The grader and the voice interview look for it.">
            <Textarea rows={2} maxLength={2000} value={learningGoals} onChange={(e) => setLearningGoals(e.target.value)} placeholder="Divide and conquer; time complexity; tests for edge cases" />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Opens">
              <Input type="datetime-local" required value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </Field>
            <Field label="Due" hint="Every repository is frozen at its latest commit at this moment.">
              <Input type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </Field>
          </div>
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="02" icon="groups" title="Individual or group" subtitle="Who can submit is the course roster. In a group assignment students form groups by inviting classmates." theme="neutral">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Kind of work" className="grid gap-3 md:grid-cols-2">
            {(
              [
                { key: 'individual', title: 'Individual', desc: 'Each student submits their own repository.', icon: 'person' },
                { key: 'group', title: 'Group', desc: 'One repository per group. Each member gets the group grade; you can adjust one student.', icon: 'groups' },
              ] as const
            ).map((o) => (
              <label
                key={o.key}
                className={`flex cursor-pointer items-start gap-3 rounded-[4px] border p-4 ${mode === o.key ? 'border-accent-ui bg-accent-soft' : 'border-line bg-paper'}`}
              >
                <input type="radio" name="mode" className="mt-1 accent-accent" checked={mode === o.key} onChange={() => setMode(o.key)} />
                <span>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{o.icon}</span>
                    {o.title}
                  </span>
                  <span className="block text-[12px] text-muted">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {mode === 'group' && (
            <div className="grid gap-4 rounded-[4px] border border-line bg-paper p-4 md:grid-cols-3">
              <Field label="Smallest group" hint="A group can submit once it has this many members.">
                <Input type="number" min={1} max={20} value={groupMin} onChange={(e) => { const v = Number(e.target.value); setGroupMin(v); if (v > groupMax) setGroupMax(v); }} />
              </Field>
              <Field label="Largest group">
                <Input type="number" min={groupMin} max={20} value={groupMax} onChange={(e) => setGroupMax(Number(e.target.value))} />
              </Field>
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">Close groups before the due date</p>
                    <p className="text-[12px] text-muted">Otherwise groups can change until it is due. A group also closes when it first submits.</p>
                  </div>
                  <ToggleSwitch checked={lockEarly} onChange={setLockEarly} />
                </div>
                {lockEarly && <Input type="datetime-local" aria-label="Groups close" value={groupLockAt} onChange={(e) => setGroupLockAt(e.target.value)} />}
              </div>
            </div>
          )}
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="03" icon="tune" title="Submissions" subtitle="Versions and voice interviews." theme="neutral">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <div>
              <p className="text-[13px] font-semibold text-ink">Unlimited versions until the due date</p>
              <p className="text-[12px] text-muted">{mode === 'group' ? 'Any member can update the group submission' : 'Students can update their submission'}; only the latest version is graded.</p>
            </div>
            <ToggleSwitch checked={unlimited} onChange={setUnlimited} />
          </div>
          {!unlimited && (
            <Field label={mode === 'group' ? 'Versions per group' : 'Versions per student'}>
              <Input type="number" min={1} max={100} value={maxSubmissions} onChange={(e) => setMaxSubmissions(Number(e.target.value))} className="w-32" />
            </Field>
          )}
          <div className="flex items-start justify-between gap-4 rounded-[4px] border border-line bg-paper p-4">
            <div>
              <p className="text-[13px] font-semibold text-ink">{mode === 'group' ? 'Short voice interview for each member' : '3-minute voice interview'}</p>
              <p className="text-[12px] text-muted">
                {mode === 'group'
                  ? 'After grading, each member answers up to 2 questions (about 90 seconds) on the files they wrote.'
                  : 'After grading, each student answers 4 or 5 questions about their own code.'}
              </p>
            </div>
            <ToggleSwitch checked={interviews} onChange={setInterviews} />
          </div>
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard number="04" icon="fact_check" title="Rubric" subtitle="How each submission is graded." theme="neutral">
        <RubricEditor rubric={rubric} setRubric={setRubric} />
      </NumberedSectionCard>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap justify-end gap-3 rounded-[6px] border border-line bg-white p-5">
        <Button type="button" variant="secondary" disabled={busy !== null} loading={busy === 'draft'} onClick={(e) => void submit(e, false)}>
          Save as draft
        </Button>
        <Button type="submit" disabled={busy !== null} loading={busy === 'open'}>
          Create and open to students
        </Button>
      </div>
      {students === 0 && (
        <Notice tone="warn">
          The roster has no students yet.{' '}
          <Link to={`/org/courses/${courseId}/roster`} className="font-semibold underline">
            Add them
          </Link>{' '}
          before or after creating the assignment.
        </Notice>
      )}
    </form>
  );
}
