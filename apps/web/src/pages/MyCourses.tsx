import { t, tr, trn } from '../i18n';
/**
 * For students, inside My courses (courses are not events: nothing to join, the roster decides):
 *   /courses               my courses, each assignment with what to do next, and group invitations waiting
 *   /courses/:id           one course
 *   /courses/:id/a/:aid    one assignment: instructions, my group, my submission, results and interview
 */
import { AssignmentSubmitSchema, weightedTotal } from '@skillproof/shared';
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
  ScoreBar,
  Select,
  Textarea,
  formatDate,
  linkButton,
  linkButtonSecondary,
  scoreTone,
  useConfirm,
} from '../components/shared';
import { useToast } from '../components/toast';
import { api, errorMessage, existingInterviewId } from '../lib/api';
import { COURSE_STATUS_TONE, groupSizeLabel, nextStep, type AssignmentView, type GroupView, type Person } from '../lib/courses';
import { STATUS_LABEL, type ScoreView } from '../lib/types';
import { useLoad } from '../lib/useLoad';

type MySubmissionSummary = { status: string; versions_used: number; locked_at: string | null } | null;
type MyAssignment = AssignmentView & { my_submission: MySubmissionSummary };

interface MyCourse {
  id: string;
  name: string;
  code: string;
  term: string;
  description: string;
  organization: string | null;
  role: 'student' | 'ta' | 'instructor';
  section: string;
  assignments: MyAssignment[];
}

interface Invite {
  group_id: string;
  group_name: string;
  assignment_id: string;
  assignment_title: string;
  course_id: string;
  closes_at: string;
  invited_by: string | null;
}

const courseMeta = (c: { organization?: string | null; code: string; term: string; section?: string }) =>
  [c.organization, c.code, c.term, c.section && tr('Section {name}', { name: c.section })].filter(Boolean).join(' · ');

function AssignmentRowItem({ courseId, a }: { courseId: string; a: MyAssignment }) {
  const step = nextStep(a);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div>
        <Link to={`/courses/${courseId}/a/${a.id}`} className="text-[14px] font-medium text-ink hover:text-accent-ink">
          {a.title}
        </Link>
        <p className="text-[12px] text-muted">
          {tr('Due')}{' '}{formatDate(a.due_at)} · {groupSizeLabel(a)} · {STATUS_LABEL[a.status]}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone={step.tone}>{step.label}</Badge>
        <Link to={`/courses/${courseId}/a/${a.id}`} className={step.key === 'todo' ? linkButton : linkButtonSecondary}>
          {step.key === 'todo' && a.mode !== 'group' ? tr('Submit') : t('common.open')}
        </Link>
      </div>
    </li>
  );
}

/** Accept or decline an invitation to a group. */
function useRespond(reload: () => unknown) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function respond(groupId: string, groupName: string, accept: boolean) {
    setBusy(`${groupId}-${accept}`);
    try {
      await api(`/api/me/groups/${groupId}/respond`, { body: { accept } });
      toast.success(accept ? tr('You joined {name}.', { name: groupName }) : tr('Invitation to {name} declined.', { name: groupName }));
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return { busy, respond };
}

// ---------------------------------------------------------------------------------------------------------------------
// /courses
// ---------------------------------------------------------------------------------------------------------------------

export function MyCourses() {
  const data = useLoad<{ courses: MyCourse[]; invites: Invite[] }>('/api/me/courses');
  const { busy, respond } = useRespond(data.reload);
  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="list" />;
  const { courses, invites } = data.data;
  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={<span className="font-semibold tracking-wider text-accent-ink uppercase">{tr('My courses')}</span>}
        title={tr('My courses')}
        subtitle={tr('Assignments from the courses you are on. Only the students of each course see them; there is nothing to join.')}
      />

      {invites.length > 0 && (
        <section className="rounded-[6px] border border-accent-ui bg-accent-soft p-4">
          <p className="text-[14px] font-semibold text-accent-ink">{tr('Group invitations')}</p>
          <ul className="mt-2 space-y-2">
            {invites.map((i) => (
              <li key={i.group_id} className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] bg-surface p-3 text-[13px]">
                <span>
                  <strong className="text-ink">{i.invited_by ?? tr('A classmate')}</strong>{' '}{tr('invited you to')}{' '}<strong className="text-ink">{i.group_name}</strong> for{' '}
                  <Link to={`/courses/${i.course_id}/a/${i.assignment_id}`} className="text-accent-ink hover:underline">
                    {i.assignment_title}
                  </Link>
                  <span className="text-muted">{' '}{tr('· groups close')}{' '}{formatDate(i.closes_at)}</span>
                </span>
                <span className="flex gap-2">
                  <Button className="px-3 py-1 text-[12px]" loading={busy === `${i.group_id}-true`} disabled={!!busy} onClick={() => void respond(i.group_id, i.group_name, true)}>
                    {tr('Accept')}
                  </Button>
                  <Button variant="secondary" className="px-3 py-1 text-[12px]" loading={busy === `${i.group_id}-false`} disabled={!!busy} onClick={() => void respond(i.group_id, i.group_name, false)}>
                    {tr('Decline')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {courses.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-surface p-8 text-center text-[13px] text-muted">
          {tr('You are not on any course roster yet. Your instructor adds you with the email of your SkillProof account.')}
        </section>
      ) : (
        courses.map((c) => (
          <section key={c.id} className="rounded-[6px] border border-line bg-surface">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line px-5 py-4">
              <div>
                <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{courseMeta(c)}</p>
                <Link to={`/courses/${c.id}`} className="font-serif-heading text-[22px] text-ink hover:text-accent-ink">
                  {c.name}
                </Link>
              </div>
              {c.role !== 'student' && <Badge tone="accent">{c.role === 'ta' ? 'TA' : tr('Instructor')}</Badge>}
            </header>
            {c.assignments.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-muted">{tr('No assignments yet.')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.assignments.map((a) => (
                  <AssignmentRowItem key={a.id} courseId={c.id} a={a} />
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// /courses/:id
// ---------------------------------------------------------------------------------------------------------------------

export function MyCourse() {
  const { id = '' } = useParams();
  const data = useLoad<{ course: MyCourse; role: MyCourse['role']; assignments: MyAssignment[] }>(`/api/me/courses/${id}`);
  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="list" />;
  const { course, assignments, role } = data.data;
  const todo = assignments.filter((a) => nextStep(a).key === 'todo');
  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to="/courses" className="text-accent-ink hover:underline">
              {tr('← MY COURSES')}
            </Link>
            <span className="text-muted">{courseMeta(course)}</span>
          </>
        }
        title={course.name}
        subtitle={course.description || `${trn('{count} assignment', '{count} assignments', assignments.length)} · ${tr('{n} to do', { n: todo.length })}`}
        rightSlot={role !== 'student' ? <Badge tone="accent">{role === 'ta' ? 'TA' : tr('Instructor')}</Badge> : null}
      />
      <section className="rounded-[6px] border border-line bg-surface">
        {assignments.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted">{tr('No assignments yet.')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {assignments.map((a) => (
              <AssignmentRowItem key={a.id} courseId={course.id} a={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// /courses/:id/a/:aid
// ---------------------------------------------------------------------------------------------------------------------

interface MyAssignmentResponse {
  course: { id: string; name: string; code: string };
  role: MyCourse['role'];
  assignment: AssignmentView;
  group: GroupView | null;
  invites: GroupView[];
  classmates: Person[];
  submission: {
    id: string;
    status: string;
    error: string | null;
    versions_used: number;
    locked_commit_sha: string | null;
    locked_at: string | null;
    current_version: { description: string; video_url: string | null; created_at: string; repos: { owner: string; name: string; url: string } | null } | null;
  } | null;
  versions: { id: string; version_no: number; description: string; video_url: string | null; created_at: string; repos: { owner: string; name: string; url: string } | null }[];
  submissions_left: number | null;
  accepting: boolean;
  groups_open: boolean;
  results: {
    scores: ScoreView[];
    feedback: { strengths_json: string[]; improvements_json: { what: string; where: string; next_step: string }[]; next_steps_json: string[] } | null;
    total: number | null;
    grade: number | null;
    adjustment: { adjusted_total: number; note: string } | null;
    status: string;
    note: string | null;
  } | null;
  interview: { id: string; status: string } | null;
  interview_open: boolean;
}

export function MyAssignmentPage() {
  const { id: courseId = '', aid = '' } = useParams();
  const data = useLoad<MyAssignmentResponse>(`/api/me/assignments/${aid}`);
  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="detail" />;
  const d = data.data;
  const a = d.assignment;
  const isGroup = a.mode === 'group';
  const acceptedCount = d.group?.members.filter((m) => m.status === 'accepted').length ?? 0;
  const groupReady = !isGroup || (!!d.group && acceptedCount >= (a.group_min ?? 1));
  const step = nextStep({ ...a, my_submission: d.submission });

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to={`/courses/${courseId}`} className="text-accent-ink hover:underline">
              ← {d.course.name.toUpperCase()}
            </Link>
            <Badge tone={COURSE_STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            <Badge tone={step.tone}>{step.label}</Badge>
          </>
        }
        title={a.title}
        subtitle={
          <>
            {groupSizeLabel(a)}{' '}{tr('· opens')}{' '}{formatDate(a.opens_at)}{' '}{tr('· due')}{' '}{formatDate(a.due_at)}
            {isGroup && a.groups_close_at && ` · ${tr('groups close {date}', { date: formatDate(a.groups_close_at) })}`}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {(a.instructions || a.learning_goals) && (
            <NumberedSectionCard number="01" icon="assignment" title={tr('What to do')} subtitle={tr('From your instructor.')} theme="accent">
              <div className="space-y-3 text-[14px] leading-relaxed text-ink">
                {a.instructions && <p className="whitespace-pre-line">{a.instructions}</p>}
                {a.learning_goals && (
                  <div className="rounded-[4px] border border-line bg-paper p-3">
                    <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{tr('Learning goals')}</p>
                    <p className="mt-1 text-[13px] whitespace-pre-line">{a.learning_goals}</p>
                  </div>
                )}
              </div>
            </NumberedSectionCard>
          )}

          {d.results ? <Results results={d.results} assignment={a} /> : <SubmitCard data={d} groupReady={groupReady} onSubmitted={() => void data.reload()} />}

          {d.interview_open && <InterviewCard data={d} />}
        </div>

        <div className="space-y-6">
          {isGroup && <MyGroupCard data={d} reload={data.reload} />}
          <RubricCard assignment={a} />
        </div>
      </div>
    </div>
  );
}

/** The submit form while the assignment is accepting, and the current version after. */
function SubmitCard({ data: d, groupReady, onSubmitted }: { data: MyAssignmentResponse; groupReady: boolean; onSubmitted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const a = d.assignment;
  const current = d.submission?.current_version ?? null;
  const [repoUrl, setRepoUrl] = useState(current?.repos?.url ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [videoUrl, setVideoUrl] = useState(current?.video_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const outOfVersions = d.submissions_left === 0;
  const notOpenYet = a.status === 'open' && Date.parse(a.opens_at) > Date.now();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = AssignmentSubmitSchema.safeParse({ repo_url: repoUrl.trim(), description, video_url: videoUrl.trim() || null });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? tr('Check the form.'));
      return;
    }
    if (a.mode === 'group' && !d.group?.locked_at) {
      const ok = await confirm({
        title: tr('Submit for your group?'),
        body: tr('After the first submission nobody can join or leave the group. Any member can still send new versions until the due date.'),
        confirmLabel: tr('Submit'),
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await api<{ version_no: number; submissions_left: number | null }>(`/api/me/assignments/${a.id}/submissions`, { body: parsed.data });
      toast.success(
        `${tr('Version {n} submitted.', { n: res.version_no })}${res.submissions_left != null ? ` ${trn('{count} version left.', '{count} versions left.', res.submissions_left)}` : ''}`,
      );
      onSubmitted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <NumberedSectionCard
      number="02"
      icon="upload"
      title={a.mode === 'group' ? tr('Group submission') : tr('My submission')}
      subtitle={
        d.accepting
          ? `${tr('A public GitHub repository. It is frozen at its latest commit on {date}, then graded.', { date: formatDate(a.due_at) })} ${d.submissions_left != null ? trn('{count} version left.', '{count} versions left.', d.submissions_left) : tr('You can send new versions until then.')}`
          : tr('Submissions are closed.')
      }
      theme={d.submission ? 'good' : 'warn'}
    >
      <div className="space-y-4">
        {d.submission && current && (
          <div className="rounded-[4px] border border-line bg-paper p-3 text-[13px]">
            <p className="text-ink">
              {tr('Version')}{' '}{d.submission.versions_used}
              {current.repos && (
                <>
                  {' · '}
                  <a href={current.repos.url} target="_blank" rel="noreferrer" className="font-mono-code text-accent-ink hover:underline">
                    {current.repos.owner}/{current.repos.name}
                  </a>
                </>
              )}
              <span className="text-muted"> · {formatDate(current.created_at)}</span>
            </p>
            {d.submission.locked_commit_sha && (
              <p className="font-mono-code mt-1 text-[12px] text-muted">{tr('Frozen at commit')}{' '}{d.submission.locked_commit_sha.slice(0, 7)}{' '}{tr('· being graded')}</p>
            )}
            {d.submission.error && <p className="mt-1 text-[12px] text-bad-ink">{d.submission.error}</p>}
          </div>
        )}

        {d.accepting && !groupReady && (
          <Notice tone="warn">
            {d.group
              ? tr('Your group needs at least {n} members to submit. Invite classmates from "My group".', { n: a.group_min })
              : tr('This is a group assignment: create a group or accept an invitation before submitting.')}
          </Notice>
        )}
        {notOpenYet && <Notice tone="info">{tr('This assignment opens')}{' '}{formatDate(a.opens_at)}.</Notice>}
        {!d.accepting && !d.submission && !notOpenYet && <Notice tone="error">{tr('Nothing was submitted before the due date.')}</Notice>}

        {d.accepting && groupReady && !outOfVersions && (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <Field label={tr('GitHub repository')} hint={tr('Public, like https://github.com/you/lab-3')}>
              <Input required value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder={tr('https://github.com/you/lab-3')} />
            </Field>
            <Field label={tr('Notes for your instructor')} hint={tr('Optional. What you built, what is missing, how to run it.')}>
              <Textarea rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label={tr('Demo video')} hint={tr('Optional public YouTube link.')}>
              <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder={tr('https://youtu.be/…')} />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" loading={busy}>
              {d.submission ? tr('Submit a new version') : tr('Submit')}
            </Button>
          </form>
        )}
        {d.accepting && outOfVersions && <Notice tone="info">{tr('You have used every version this assignment allows. The last one is graded.')}</Notice>}

        {d.versions.length > 1 && (
          <details className="text-[12px]">
            <summary className="cursor-pointer text-muted">{tr('All versions (')}{d.versions.length})</summary>
            <ul className="mt-2 space-y-1">
              {d.versions.map((v) => (
                <li key={v.id}>
                  <span className="font-mono-code font-semibold text-ink">v{v.version_no}</span>
                  <span className="text-muted">
                    {' '}
                    · {formatDate(v.created_at)}
                    {v.repos && ` · ${v.repos.owner}/${v.repos.name}`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </NumberedSectionCard>
  );
}

/** Group, invitations to answer, classmates to invite, leave. */
function MyGroupCard({ data: d, reload }: { data: MyAssignmentResponse; reload: () => unknown }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { busy: responding, respond } = useRespond(reload);
  const a = d.assignment;
  const [name, setName] = useState('');
  const [invitee, setInvitee] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const accepted = d.group?.members.filter((m) => m.status === 'accepted') ?? [];
  const invited = d.group?.members.filter((m) => m.status === 'invited') ?? [];
  const room = (a.group_max ?? 0) - accepted.length;

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!d.group) return;
    const ok = await confirm({ title: tr('Leave {name}?', { name: d.group.name }), body: tr('You can create another group or accept another invitation while groups are open.'), confirmLabel: tr('Leave group') });
    if (ok) await run('leave', () => api(`/api/me/groups/${d.group!.id}/leave`, { method: 'POST' }), tr('You left {name}.', { name: d.group.name }));
  }

  return (
    <section className="rounded-[6px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">{tr('My group')}</p>
        <span className="text-[12px] text-muted">{groupSizeLabel(a)}</span>
      </div>

      {d.group ? (
        <div className="mt-3 space-y-3 text-[13px]">
          <p className="font-serif-heading text-[20px] text-ink">{d.group.name}</p>
          <ul className="space-y-1">
            {accepted.map((m) => (
              <li key={m.user_id} className="text-ink">
                {m.display_name}
                {m.github_login && <span className="font-mono-code ml-1.5 text-[11px] text-muted">@{m.github_login}</span>}
              </li>
            ))}
            {invited.map((m) => (
              <li key={m.user_id} className="text-muted">
                {m.display_name} <span className="text-[11px]">{tr('(invited)')}</span>
              </li>
            ))}
          </ul>
          {d.group.locked_at ? (
            <p className="text-[12px] text-muted">{tr('The group closed when it first submitted (')}{formatDate(d.group.locked_at)}{tr('). Ask your instructor for changes.')}</p>
          ) : d.groups_open ? (
            <>
              {room > 0 && (
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-[12px] text-muted">
                    {tr('Invite a classmate without a group (')}{room} {room === 1 ? 'place' : 'places'}{' '}{tr('left).')}
                  </p>
                  {d.classmates.length === 0 ? (
                    <p className="text-[12px] text-muted">{tr('Every classmate already has a group.')}</p>
                  ) : (
                    <div className="flex gap-2">
                      <Select aria-label={tr('Classmate to invite')} value={invitee} onChange={(e) => setInvitee(e.target.value)} className="h-9 text-[13px]">
                        <option value="">{tr('Choose a classmate…')}</option>
                        {d.classmates
                          .filter((c) => !invited.some((m) => m.user_id === c.user_id))
                          .map((c) => (
                            <option key={c.user_id} value={c.user_id}>
                              {c.display_name}
                            </option>
                          ))}
                      </Select>
                      <Button
                        variant="secondary"
                        disabled={!invitee || !!busy}
                        loading={busy === 'invite'}
                        onClick={() =>
                          void run('invite', () => api(`/api/me/groups/${d.group!.id}/invites`, { body: { user_id: invitee } }), tr('Invitation sent. They see it in My courses.')).then(() =>
                            setInvitee(''),
                          )
                        }
                      >
                        {tr('Invite')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <Button variant="ghost" className="px-0 text-[12px]" loading={busy === 'leave'} disabled={!!busy} onClick={() => void leave()}>
                {tr('Leave the group')}
              </Button>
            </>
          ) : (
            <p className="text-[12px] text-muted">{tr('Groups are closed.')}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-[13px]">
          {d.invites.length > 0 && (
            <ul className="space-y-2">
              {d.invites.map((g) => (
                <li key={g.id} className="rounded-[4px] border border-accent-ui bg-accent-soft p-3">
                  <p className="text-ink">
                    {tr('Invitation to')}{' '}<strong>{g.name}</strong>
                  </p>
                  <p className="text-[12px] text-muted">
                    {g.members
                      .filter((m) => m.status === 'accepted')
                      .map((m) => m.display_name)
                      .join(', ') || tr('No members yet')}
                  </p>
                  {d.groups_open && (
                    <div className="mt-2 flex gap-2">
                      <Button className="px-3 py-1 text-[12px]" loading={responding === `${g.id}-true`} disabled={!!responding} onClick={() => void respond(g.id, g.name, true)}>
                        {tr('Accept')}
                      </Button>
                      <Button variant="secondary" className="px-3 py-1 text-[12px]" loading={responding === `${g.id}-false`} disabled={!!responding} onClick={() => void respond(g.id, g.name, false)}>
                        {tr('Decline')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {d.groups_open ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run('create', () => api(`/api/me/assignments/${a.id}/groups`, { body: { name: name.trim() } }), tr('Group {name} created. Invite your classmates.', { name: name.trim() }));
              }}
              className="space-y-2"
            >
              <p className="text-muted">{tr('You are not in a group yet. Create one and invite classmates, or accept an invitation.')}</p>
              <Input required maxLength={80} aria-label={tr('Group name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('Group name')} />
              <Button type="submit" loading={busy === 'create'} disabled={!name.trim()}>
                {tr('Create group')}
              </Button>
            </form>
          ) : (
            <Notice tone="warn">{tr('Groups are closed and you are not in one. Ask your instructor to place you in a group.')}</Notice>
          )}
        </div>
      )}
    </section>
  );
}

function RubricCard({ assignment: a }: { assignment: AssignmentView }) {
  return (
    <section className="rounded-[6px] border border-line bg-surface p-5">
      <p className="text-[14px] font-semibold text-ink">{tr('How it is graded')}</p>
      <ul className="mt-2 space-y-2 text-[13px]">
        {a.rubric_json.map((c) => (
          <li key={c.key}>
            <div className="flex justify-between gap-2">
              <span className="text-ink">{c.name}</span>
              <span className="font-mono-code text-[11px] text-muted">{c.weight}%</span>
            </div>
            {c.description && <p className="text-[12px] text-muted">{c.description}</p>}
          </li>
        ))}
      </ul>
      {a.interviews_enabled && (
        <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">
          {tr('After grading you take a short voice interview about')}{' '}{a.mode === 'group' ? tr('the files you wrote (up to 2 questions)') : tr('your code')}.
        </p>
      )}
    </section>
  );
}

function Results({ results: r, assignment: a }: { results: NonNullable<MyAssignmentResponse['results']>; assignment: AssignmentView }) {
  const total = r.total ?? weightedTotal(a.rubric_json, r.scores);
  return (
    <NumberedSectionCard number="02" icon="grading" title={tr('Results')} subtitle={tr('Your grade and feedback, published by your instructor.')} theme="good">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{tr('Grade')}</p>
            <p className="font-mono-code text-[40px] leading-none font-bold text-ink">
              {r.grade != null ? r.grade.toFixed(1) : '—'}
              <span className="text-[14px] font-normal text-muted"> / 10</span>
            </p>
          </div>
          {r.adjustment && (
            <p className="max-w-sm text-[12px] text-muted">
              {tr('Your instructor set your own grade (the group got')}{' '}{total?.toFixed(1) ?? '—'}).{r.adjustment.note && ` ${r.adjustment.note}`}
            </p>
          )}
        </div>
        {r.note && <Notice tone="warn">{r.note}</Notice>}
        <ul className="space-y-3">
          {a.rubric_json.map((c) => {
            const sc = r.scores.find((x) => x.criterion_key === c.key);
            const v = sc ? (sc.override_score ?? sc.ai_score) : null;
            return (
              <li key={c.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-medium text-ink">{c.name}</span>
                  <Badge tone={scoreTone(v)}>{v ?? '–'}/10</Badge>
                </div>
                <ScoreBar value={(v ?? 0) * 10} max={100} tone={scoreTone(v) === 'bad' ? 'bad' : 'accent'} heightClass="h-1" />
                {sc?.justification && <p className="text-[12px] text-muted">{sc.justification}</p>}
              </li>
            );
          })}
        </ul>
        {r.feedback && (
          <div className="space-y-3 border-t border-line pt-4 text-[13px]">
            {r.feedback.strengths_json.length > 0 && (
              <div>
                <p className="font-semibold text-ink">{tr('What went well')}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  {r.feedback.strengths_json.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            {r.feedback.improvements_json.length > 0 && (
              <div>
                <p className="font-semibold text-ink">{tr('To improve')}</p>
                <ul className="mt-1 space-y-2">
                  {r.feedback.improvements_json.map((x) => (
                    <li key={x.what} className="rounded-[4px] border border-line bg-paper p-2.5">
                      <p className="text-ink">{x.what}</p>
                      {x.where && <p className="font-mono-code text-[11px] text-muted">{x.where}</p>}
                      {x.next_step && <p className="text-muted">{x.next_step}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.feedback.next_steps_json?.length > 0 && (
              <div>
                <p className="font-semibold text-ink">{tr('Next steps')}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">
                  {r.feedback.next_steps_json.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </NumberedSectionCard>
  );
}

/** Starts (or reopens) the student's own voice interview about this submission. */
function InterviewCard({ data: d }: { data: MyAssignmentResponse }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isGroup = d.assignment.mode === 'group';

  async function start() {
    if (!d.submission) return;
    setBusy(true);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', { body: { assignment_submission_id: d.submission.id } });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      const existing = existingInterviewId(err);
      if (existing) navigate(`/interview/${existing}`);
      else toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <NumberedSectionCard
      number="03"
      icon="mic"
      title={tr('Voice interview')}
      subtitle={isGroup ? tr('About 90 seconds, up to 2 questions on the files you wrote. Each member takes their own.') : tr('About 3 minutes, 4 or 5 questions about your own code.')}
      theme="accent"
    >
      {d.interview ? (
        <Link to={`/interview/${d.interview.id}`} className={linkButton}>
          {d.interview.status === 'completed' ? tr('See my interview report') : tr('Open my interview')}
        </Link>
      ) : (
        <Button loading={busy} onClick={() => void start()}>
          <span className="material-symbols-outlined text-[17px]">mic</span>
          <span>{tr('Prepare my interview')}</span>
        </Button>
      )}
    </NumberedSectionCard>
  );
}
