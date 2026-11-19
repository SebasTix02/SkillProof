import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, useConfirm, Input, Notice, NumberedSectionCard, Select, SkeletonTable, SkeletonText, Textarea, formatDate, linkButton } from './shared';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { STATUS_LABEL, type EventView } from '../lib/types';
import { useLoad } from '../lib/useLoad';

interface Course {
  id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  created_at: string;
  member_count: number;
  assignment_count: number;
}

interface CourseDetail {
  course: Omit<Course, 'member_count' | 'assignment_count'>;
  assignments: { id: string; name: string; slug: string; status: EventView['status']; submission_deadline: string }[];
  members: { user_id: string; role: 'instructor' | 'ta' | 'student'; section: string; profiles: { display_name: string; github_login: string | null } | null }[];
}

const EMAIL = /[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g;

/**
 * Teacher & course mode: courses of the organization, their rosters and assignments.
 * Picking a course narrows the gradebook below to its assignments.
 */
export function CoursePanel({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { org } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = !!org?.permissions.includes('course.manage');
  const list = useLoad<{ courses: Course[] }>(org ? `/api/orgs/${org.id}/courses` : null);
  const detail = useLoad<CourseDetail>(selectedId ? `/api/courses/${selectedId}` : null);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', term: '', description: '' });
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<'student' | 'ta' | 'instructor'>('student');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [withoutAccount, setWithoutAccount] = useState<string[]>([]);

  async function run(key: string, fn: () => Promise<unknown>, success: string, failure: string): Promise<boolean> {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(`${failure}. ${errorMessage(err)}`);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createCourse(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    let created: { course: Course } | null = null;
    const ok = await run(
      'create',
      async () => {
        created = await api<{ course: Course }>(`/api/orgs/${org.id}/courses`, { body: form });
      },
      `Course "${form.name}" created.`,
      'Could not create the course',
    );
    if (!ok) return;
    setForm({ name: '', code: '', term: '', description: '' });
    setCreating(false);
    await list.reload();
    if (created) onSelect((created as { course: Course }).course.id);
  }

  async function addMembers() {
    if (!selectedId) return;
    const found = [...new Set((emails.match(EMAIL) ?? []).map((m) => m.toLowerCase()))];
    if (found.length === 0) return;
    setBusy('members');
    try {
      const res = await api<{ added: number; without_account: string[] }>(`/api/courses/${selectedId}/members`, { body: { emails: found, role, section } });
      toast.success(`${res.added} added to the course.`);
      setWithoutAccount(res.without_account);
      setEmails('');
      await Promise.all([detail.reload(), list.reload()]);
    } catch (err) {
      toast.error(`Could not add people. ${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!selectedId) return;
    if (!(await confirm({ title: `Remove ${name} from this course?`, body: 'They lose access to its assignments. You can add them again later.', confirmLabel: 'Remove' }))) return;
    if (await run(`rm-${userId}`, () => api(`/api/courses/${selectedId}/members/${userId}`, { method: 'DELETE' }), `${name} removed.`, 'Could not remove them'))
      await Promise.all([detail.reload(), list.reload()]);
  }

  async function archive() {
    if (!selectedId) return;
    if (!(await confirm({ title: 'Archive this course?', body: 'It disappears from the list; its assignments and grades stay.', confirmLabel: 'Archive' }))) return;
    if (await run('archive', () => api(`/api/courses/${selectedId}/archive`, { method: 'POST' }), 'Course archived.', 'Could not archive the course')) {
      onSelect(null);
      await list.reload();
    }
  }

  const courses = list.data?.courses ?? [];
  const d = detail.data;

  return (
    <NumberedSectionCard
      id="section-courses"
      number="C"
      icon="school"
      title="Courses"
      subtitle="Group assignments by course and keep each roster. Picking a course narrows the gradebook to its assignments."
      sectionTag={`${courses.length} COURSES`}
      theme="emerald"
    >
      {list.loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : list.error ? (
        <Notice tone="error">{list.error}</Notice>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(null)}
              className={`font-mono-code rounded-[3px] border px-2.5 py-1 text-[11px] font-medium ${selectedId === null ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`}
            >
              All events
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={`font-mono-code rounded-[3px] border px-2.5 py-1 text-[11px] font-medium ${selectedId === c.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-muted hover:text-ink'}`}
              >
                {c.code ? `${c.code} · ` : ''}
                {c.name} <span className="text-muted">({c.member_count})</span>
              </button>
            ))}
            {canManage && !creating && (
              <button type="button" onClick={() => setCreating(true)} className="text-[12px] font-semibold text-accent hover:underline">
                + New course
              </button>
            )}
          </div>
          {courses.length === 0 && !creating && <p className="text-[13px] text-muted">No courses yet.{canManage ? ' Create one to keep a roster and group assignments.' : ''}</p>}

          {creating && (
            <form onSubmit={(e) => void createCourse(e)} className="grid grid-cols-1 gap-3 rounded-[4px] border border-line bg-paper/60 p-3 md:grid-cols-4">
              <Input required minLength={2} placeholder="Course name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="md:col-span-2" />
              <Input placeholder="Code (CS-201)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              <Input placeholder="Term (Fall 2026)" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
              <Textarea rows={2} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="md:col-span-4" />
              <div className="flex gap-2 md:col-span-4">
                <Button type="submit" disabled={busy === 'create'} loading={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create course'}</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          )}

          {selectedId && (detail.loading ? (
            <SkeletonText lines={4} />
          ) : detail.error ? (
            <Notice tone="error">{detail.error}</Notice>
          ) : d ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-ink">Assignments</h3>
                  {canManage && (
                    <Link to={`/org/events/new?course=${d.course.id}`} className={linkButton}>
                      New assignment
                    </Link>
                  )}
                </div>
                {d.assignments.length === 0 ? (
                  <p className="text-[12px] text-muted">No assignments in this course yet.</p>
                ) : (
                  <ul className="divide-y divide-line rounded-[4px] border border-line text-[12px]">
                    {d.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <Link to={`/org/events/${a.id}/gradebook`} className="font-medium text-ink hover:text-accent">{a.name}</Link>
                        <span className="flex items-center gap-2 text-muted">
                          <Badge>{STATUS_LABEL[a.status]}</Badge>
                          {formatDate(a.submission_deadline)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (
                  <button type="button" onClick={() => void archive()} disabled={busy === 'archive'} className="text-[12px] font-semibold text-bad hover:underline">
                    Archive course
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-[14px] font-semibold text-ink">Roster ({d.members.length})</h3>
                {d.members.length === 0 ? (
                  <p className="text-[12px] text-muted">Nobody is enrolled yet.</p>
                ) : (
                  <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-[4px] border border-line text-[12px]">
                    {d.members.map((m) => {
                      const name = m.profiles?.display_name || 'Unnamed';
                      return (
                        <li key={m.user_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="text-ink">
                            {name}
                            {m.section && <span className="text-muted"> · {m.section}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={m.role === 'student' ? 'neutral' : 'accent'}>{m.role.toUpperCase()}</Badge>
                            {canManage && (
                              <button type="button" aria-label={`Remove ${name}`} onClick={() => void removeMember(m.user_id, name)} className="text-muted hover:text-bad">
                                ×
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canManage && (
                  <div className="space-y-2 rounded-[4px] border border-line bg-paper/60 p-3">
                    <Textarea rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="Emails, one per line or separated by commas" aria-label="Emails to enrol" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-8 w-32 bg-white text-[12px]" aria-label="Role">
                        <option value="student">Student</option>
                        <option value="ta">TA</option>
                        <option value="instructor">Instructor</option>
                      </Select>
                      <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section (optional)" className="h-8 w-40 bg-white text-[12px]" />
                      <Button type="button" disabled={busy === 'members' || !emails.match(EMAIL)} loading={busy === 'members'} onClick={() => void addMembers()}>
                        {busy === 'members' ? 'Adding…' : 'Add to course'}
                      </Button>
                    </div>
                    {withoutAccount.length > 0 && (
                      <Notice tone="warn">
                        These emails have no SkillProof account yet. Ask them to sign up, then add them again: {withoutAccount.join(', ')}
                      </Notice>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null)}
        </div>
      )}
    </NumberedSectionCard>
  );
}
