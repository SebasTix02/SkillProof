import { lazy, t, tr } from '../../i18n';
import { ContestLanguageField, StarterRepoField } from '../../components/LanguageControl';
/**
 * The console of one course assignment (its own screen, not the event console):
 *   /org/courses/:courseId/assignments/:id          status, actions, submissions, groups, missing, similarity
 *   /org/courses/:courseId/assignments/:id/s/:sid   one submission: scores, feedback, members, interviews, integrity
 */
import { UpdateAssignmentSchema, weightedTotal, type CommitProfile, type RepoMap, type Rubric } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../../components/AiActivity';
import { SubmissionJudgingControls } from '../../components/JudgingControls';
import { one } from '../../components/Report';
import {
  Badge,
  Button,
  DossierPageHeader,
  Field,
  Input,
  LiveDot,
  Notice,
  NumberedSectionCard,
  PageState,
  SIMILARITY_SIGNAL_LABEL,
  SUBMISSION_STATUS_LABEL,
  Select,
  Tabs,
  Textarea,
  ToggleSwitch,
  formatDate,
  linkButtonSecondary,
  scoreTone,
  useConfirm,
} from '../../components/shared';
import { useToast } from '../../components/toast';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  COURSE_STATUS_TONE,
  groupSizeLabel,
  localInput,
  type AssignmentConsoleResponse,
  type AssignmentSubmissionRow,
  type AssignmentView,
  type GroupView,
  type Person,
} from '../../lib/courses';
import { STATUS_LABEL, type ScoreView } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';
import { AdjustGrade } from './Courses';
import { ScoreCalibrationRow } from './SubmissionDetail';

const WORKING = new Set(['queued', 'analyzing']);
const SUB_BASE = '/api/assignment-submissions';

/** Runs one POST with a toast, an optional confirmation, and a reload. */
function useAction(reload: () => unknown) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(key: string, path: string, success: string, question?: string, body?: unknown) {
    if (question && !(await confirm({ title: question, confirmLabel: tr('Continue') }))) return;
    setBusy(key);
    try {
      await api(path, body === undefined ? { method: 'POST' } : { body });
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}

type ConsoleTab = 'submissions' | 'groups' | 'missing' | 'similarity';

export function AssignmentConsole() {
  const { courseId = '', id = '' } = useParams();
  const { org } = useAuth();
  const canManage = !!org?.permissions.includes('course.manage');
  const data = useLoad<AssignmentConsoleResponse>(
    `/api/assignments/${id}/console`,
    (d) => d.assignment.status === 'judging' || d.submissions.some((s) => WORKING.has(s.status)),
  );
  const { busy, act } = useAction(data.reload);
  const [tab, setTab] = useState<ConsoleTab>('submissions');
  const [editing, setEditing] = useState(false);

  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="console" />;
  const { assignment: a, course, submissions, groups, ungrouped, missing, similarity_flags: flags } = data.data;
  const isGroup = a.mode === 'group';
  const graded = submissions.filter((s) => s.total != null);
  const average = graded.length ? graded.reduce((n, s) => n + (s.total ?? 0), 0) / graded.length : null;
  const groupsReady = groups.filter((g) => g.members.filter((m) => m.status === 'accepted').length >= (a.group_min ?? 1)).length;

  const tiles = [
    { label: tr('Submitted'), value: `${submissions.length}`, hint: isGroup ? tr('{n} groups formed', { n: groups.length }) : tr('of {n} students', { n: a.student_count }) },
    { label: tr('Graded'), value: `${graded.length}`, hint: tr('{n} being graded', { n: submissions.filter((s) => WORKING.has(s.status)).length }) },
    { label: tr('Average'), value: average != null ? average.toFixed(1) : '—', hint: tr('out of 10') },
    isGroup
      ? { label: tr('Without a group'), value: `${ungrouped.length}`, hint: tr('{n} groups can submit', { n: groupsReady }) }
      : { label: tr('Missing'), value: `${missing.length}`, hint: tr('no submission yet') },
  ];

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to={`/org/courses/${course.id}/assignments`} className="text-accent-ink hover:underline">
              ← {course.name.toUpperCase()}{' '}{tr('· ASSIGNMENTS')}
            </Link>
            <Badge tone={COURSE_STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            <span className="text-muted">{groupSizeLabel(a)}</span>
          </>
        }
        title={a.title}
        subtitle={
          <>
            {tr('Opens')}{' '}{formatDate(a.opens_at)}{' '}{tr('· due')}{' '}{formatDate(a.due_at)}
            {isGroup && a.groups_close_at && ` · ${tr('groups close {date}', { date: formatDate(a.groups_close_at) })}`}
            {a.interviews_enabled && ' · voice interview after grading'}
          </>
        }
        rightSlot={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {(a.status === 'draft' || a.status === 'open') && !editing && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <span className="material-symbols-outlined text-[17px]">edit</span>
                  <span>{tr('Edit')}</span>
                </Button>
              )}
              {a.status === 'draft' && (
                <Button loading={busy === 'open'} disabled={!!busy} onClick={() => void act('open', `/api/assignments/${a.id}/open`, tr('The assignment is open to the students on the roster.'))}>
                  {tr('Open to students')}
                </Button>
              )}
              {a.status === 'open' && (
                <Button
                  loading={busy === 'close'}
                  disabled={!!busy}
                  onClick={() =>
                    void act(
                      'close',
                      `/api/assignments/${a.id}/close`,
                      tr('Submissions closed. Grading started.'),
                      tr('Close {title} now? Every repository is frozen at its latest commit and grading starts. Students can no longer submit.', { title: a.title }),
                    )
                  }
                >
                  {tr('Close and grade now')}
                </Button>
              )}
              {a.status === 'judging' &&
                (a.judging_paused_at ? (
                  <Button loading={busy === 'resume-all'} disabled={!!busy} onClick={() => void act('resume-all', `/api/assignments/${a.id}/judging/resume`, tr('Grading resumed.'))}>
                    {tr('Resume grading')}
                  </Button>
                ) : (
                  <Button variant="secondary" loading={busy === 'pause-all'} disabled={!!busy} onClick={() => void act('pause-all', `/api/assignments/${a.id}/judging/pause`, tr('Grading paused. Running submissions stop at their next checkpoint.'))}>
                    {tr('Pause grading')}
                  </Button>
                ))}
              {a.status === 'judging' && (
                <Button
                  variant="danger"
                  loading={busy === 'cancel-all'}
                  disabled={!!busy}
                  onClick={() =>
                    void act('cancel-all', `/api/assignments/${a.id}/judging/cancel`, tr('Grading canceled. What was graded stays.'), tr('Cancel the grading that is left? Graded submissions keep their scores; the rest can be graded again later.'))
                  }
                >
                  {tr('Cancel grading')}
                </Button>
              )}
              {a.status === 'review' && (
                <Button
                  loading={busy === 'publish'}
                  disabled={!!busy}
                  onClick={() => void act('publish', `/api/assignments/${a.id}/publish`, tr('Results published. Students see their grades and feedback.'), tr('Publish the results? Each student sees their grade and feedback.'))}
                >
                  {tr('Publish results')}
                </Button>
              )}
            </div>
          ) : null
        }
      />

      {a.judging_paused_at && a.status === 'judging' && <Notice tone="warn">{tr('Grading is paused since')}{' '}{formatDate(a.judging_paused_at)}.</Notice>}

      {editing && <EditAssignment assignment={a} onDone={() => { setEditing(false); void data.reload(); }} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[6px] border border-line bg-surface p-4">
            <p className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{t.label}</p>
            <p className="font-serif-heading mt-1 text-[28px] leading-none text-ink">{t.value}</p>
            <p className="mt-1 text-[12px] text-muted">{t.hint}</p>
          </div>
        ))}
      </div>

      <Tabs
        ariaLabel={tr('Assignment sections')}
        tabs={[
          { key: 'submissions' as const, label: tr('Submissions'), count: submissions.length, icon: 'inventory_2' },
          ...(isGroup ? [{ key: 'groups' as const, label: tr('Groups'), count: groups.length, icon: 'groups' }] : []),
          { key: 'missing' as const, label: tr('Missing'), count: missing.length, icon: 'person_off' },
          { key: 'similarity' as const, label: tr('Similarity'), count: flags.length, icon: 'schema' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'submissions' && (
        <SubmissionsTable courseId={courseId} assignment={a} rows={submissions} canManage={canManage} busy={busy} act={act} />
      )}
      {tab === 'groups' && isGroup && <GroupsPanel assignment={a} groups={groups} ungrouped={ungrouped} canManage={canManage} reload={data.reload} />}
      {tab === 'missing' && <MissingList people={missing} isGroup={isGroup} />}
      {tab === 'similarity' && (
        <section className="rounded-[6px] border border-line bg-surface p-5">
          {flags.length === 0 ? (
            <p className="text-[13px] text-muted">{tr('No similarity between submissions was found.')}</p>
          ) : (
            <ul className="space-y-2">
              {flags.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-[4px] border border-line bg-paper p-3 text-[13px]">
                  <Badge tone="warn">{SIMILARITY_SIGNAL_LABEL[f.signal]}</Badge>
                  {f.signal === 'shared_code' && <span className="font-mono-code font-bold text-ink">{Math.round(Number(f.score) * 100)}%</span>}
                  <strong className="text-ink">{submissions.find((s) => s.id === f.submission_a)?.label ?? tr('Submission')}</strong>
                  <span className="text-muted">↔</span>
                  <strong className="text-ink">{submissions.find((s) => s.id === f.submission_b)?.label ?? tr('Submission')}</strong>
                  {f.explanation && <span className="text-muted">· {f.explanation}</span>}
                  <Link to={`/org/courses/${courseId}/assignments/${a.id}/compare?flag=${f.id}`} className="ml-auto font-semibold text-accent-ink hover:underline">
                    {tr('Compare side by side →')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to={`/org/integrity?assignment=${a.id}`} className={`${linkButtonSecondary} mt-4`}>
            {tr('Open in Integrity')}
          </Link>
        </section>
      )}
    </div>
  );
}

function SubmissionsTable({
  courseId,
  assignment: a,
  rows,
  canManage,
  busy,
  act,
}: {
  courseId: string;
  assignment: AssignmentView;
  rows: AssignmentSubmissionRow[];
  canManage: boolean;
  busy: string | null;
  act: (key: string, path: string, success: string, confirm?: string) => Promise<void>;
}) {
  if (rows.length === 0)
    return (
      <section className="rounded-[6px] border border-line bg-surface p-8 text-center text-[13px] text-muted">
        {a.status === 'draft' ? tr('Open the assignment so students can submit.') : tr('No submissions yet.')}
      </section>
    );
  return (
    <section className="overflow-x-auto rounded-[6px] border border-line bg-surface">
      <table className="w-full text-left text-[13px]">
        <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
          <tr>
            <th className="px-5 py-2.5 font-semibold">{a.mode === 'group' ? tr('Group') : tr('Student')}</th>
            <th className="px-3 py-2.5 font-semibold">{tr('Repository')}</th>
            <th className="px-3 py-2.5 font-semibold">{tr('Status')}</th>
            <th className="px-3 py-2.5 text-right font-semibold">{tr('Grade')}</th>
            {a.interviews_enabled && <th className="px-3 py-2.5 text-right font-semibold">{tr('Ownership')}</th>}
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => {
            const repo = s.current_version?.repos;
            const working = WORKING.has(s.status);
            return (
              <tr key={s.id} className="align-top">
                <td className="px-5 py-3">
                  <Link to={`/org/courses/${courseId}/assignments/${a.id}/s/${s.id}`} className="font-medium text-ink hover:text-accent-ink">
                    {s.label}
                  </Link>
                  {s.members && <p className="text-[12px] text-muted">{s.members.map((m) => m.display_name).join(', ')}</p>}
                  <p className="text-[11px] text-muted">
                    {s.versions_used} {s.versions_used === 1 ? 'version' : 'versions'}
                    {s.submitted_by_name && s.members && ` · last by ${s.submitted_by_name}`}
                  </p>
                </td>
                <td className="font-mono-code px-3 py-3 text-[12px]">
                  {repo ? (
                    <a href={repo.url} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
                      {repo.owner}/{repo.name}
                    </a>
                  ) : (
                    '—'
                  )}
                  {s.locked_commit_sha && <p className="text-[11px] text-muted">@{s.locked_commit_sha.slice(0, 7)}</p>}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5">
                    {working && <LiveDot />}
                    <Badge tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}>{SUBMISSION_STATUS_LABEL[s.status]}</Badge>
                  </span>
                  {s.error && <p className="mt-1 max-w-xs text-[11px] text-bad-ink">{s.error}</p>}
                </td>
                <td className="font-mono-code px-3 py-3 text-right">
                  {s.total != null ? <Badge tone={scoreTone(s.total)}>{s.total.toFixed(1)}</Badge> : <span className="text-muted">—</span>}
                </td>
                {a.interviews_enabled && (
                  <td className="font-mono-code px-3 py-3 text-right text-[12px]">
                    {s.ownership ? (
                      <span className={s.ownership.score >= 70 ? 'text-good-ink' : 'text-bad-ink'}>{s.ownership.score}/100</span>
                    ) : (
                      <span className="text-muted">{s.interviews.length ? `${s.interviews.length} started` : '—'}</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {canManage && (
                      <SubmissionJudgingControls
                        id={s.id}
                        name={s.label}
                        status={s.status}
                        frozen={!!s.locked_commit_sha}
                        busy={busy}
                        act={(k, p, m, c) => void act(k, p, m, c)}
                        compact
                        basePath={SUB_BASE}
                      />
                    )}
                    <Link to={`/org/courses/${courseId}/assignments/${a.id}/s/${s.id}`} className={`${linkButtonSecondary} px-2.5 py-1 text-[11px]`}>
                      {t('common.open')}
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MissingList({ people, isGroup }: { people: Person[]; isGroup: boolean }) {
  if (people.length === 0) return <Notice tone="good">{tr('Every student on the roster has')}{' '}{isGroup ? tr('a submission through their group') : 'submitted'}.</Notice>;
  return (
    <section className="rounded-[6px] border border-line bg-surface">
      <p className="border-b border-line px-5 py-3 text-[13px] text-muted">
        {tr('Students on the roster')}{' '}{isGroup ? tr('whose group has not submitted (or who have no group)') : tr('without a submission')}.
      </p>
      <ul className="divide-y divide-line">
        {people.map((p) => (
          <li key={p.user_id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
            <span className="font-medium text-ink">{p.display_name}</span>
            <span className="font-mono-code text-[11px] text-muted">{p.github_login ? `@${p.github_login}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Groups for staff: who is in each, pending invitations, and moving or placing students (even after groups close). */
function GroupsPanel({ assignment: a, groups, ungrouped, canManage, reload }: { assignment: AssignmentView; groups: GroupView[]; ungrouped: Person[]; canManage: boolean; reload: () => unknown }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [placing, setPlacing] = useState<Record<string, string>>({});
  /** The most members a new group can have (the assignment's group size, 20 when it has none). */
  const maxMembers = a.group_max ?? 20;
  const everyone: Person[] = [
    ...ungrouped,
    ...groups.flatMap((g) => g.members.filter((m) => m.status === 'accepted').map((m) => ({ user_id: m.user_id, display_name: `${m.display_name} (${g.name})`, github_login: m.github_login }))),
  ];

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

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    await run('create', () => api(`/api/assignments/${a.id}/groups`, { body: { name: newName.trim(), member_ids: newMembers } }), tr('Group {name} created.', { name: newName.trim() }));
    setNewName('');
    setNewMembers([]);
  }

  async function remove(g: GroupView, userId: string, name: string) {
    if (!(await confirm({ title: tr('Remove {name} from {group}?', { name, group: g.name }), body: tr('They can join or be placed in another group.'), confirmLabel: tr('Remove') }))) return;
    await run(`rm-${g.id}-${userId}`, () => api(`/api/assignment-groups/${g.id}/members/${userId}`, { method: 'DELETE' }), `${name} removed from ${g.name}.`);
  }

  return (
    <div className="space-y-6">
      <Notice tone="info">
        {groupSizeLabel(a)}{tr('. Students form groups by inviting classmates until')}{' '}{a.groups_close_at ? formatDate(a.groups_close_at) : tr('the due date')}; a group also closes when it first
        submits. You can move or place students at any time.
      </Notice>

      {ungrouped.length > 0 && (
        <section className="rounded-[6px] border border-warn-ui bg-warn-soft p-4 text-[13px]">
          <p className="font-semibold text-warn-ink">{tr('Without a group (')}{ungrouped.length})</p>
          <p className="mt-1 text-ink">{ungrouped.map((p) => p.display_name).join(', ')}</p>
        </section>
      )}

      {groups.length === 0 ? (
        <section className="rounded-[6px] border border-line bg-surface p-8 text-center text-[13px] text-muted">{tr('No groups yet.')}</section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => {
            const accepted = g.members.filter((m) => m.status === 'accepted');
            const ready = accepted.length >= (a.group_min ?? 1);
            return (
              <li key={g.id} className="rounded-[6px] border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-ink">{g.name}</p>
                    <p className="text-[12px] text-muted">
                      {accepted.length}/{a.group_max} {tr('members')}{g.locked_at && ` · ${tr('closed {date}', { date: formatDate(g.locked_at) })}`}
                    </p>
                  </div>
                  <Badge tone={ready ? 'good' : 'warn'}>{ready ? tr('Can submit') : tr('Too small')}</Badge>
                </div>
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {g.members.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2">
                      <span className={m.status === 'invited' ? 'text-muted' : 'text-ink'}>
                        {m.display_name}
                        {m.status === 'invited' && <span className="ml-1.5 text-[11px]">{tr('(invited)')}</span>}
                      </span>
                      {canManage && (
                        <Button variant="ghost" className="px-2 py-0.5 text-[11px]" loading={busy === `rm-${g.id}-${m.user_id}`} disabled={!!busy} onClick={() => void remove(g, m.user_id, m.display_name)}>
                          {tr('Remove')}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                {canManage && accepted.length < (a.group_max ?? 0) && everyone.length > 0 && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Select aria-label={tr('Place a student in {group}', { group: g.name })} value={placing[g.id] ?? ''} onChange={(e) => setPlacing({ ...placing, [g.id]: e.target.value })} className="h-8 text-[12px]">
                      <option value="">{tr('Place a student…')}</option>
                      {everyone
                        .filter((p) => !accepted.some((m) => m.user_id === p.user_id))
                        .map((p) => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.display_name}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-[12px]"
                      disabled={!placing[g.id] || !!busy}
                      loading={busy === `place-${g.id}`}
                      onClick={() =>
                        void run(`place-${g.id}`, () => api(`/api/assignment-groups/${g.id}/place`, { body: { user_id: placing[g.id] } }), tr('Student placed in {group}.', { group: g.name })).then(() =>
                          setPlacing({ ...placing, [g.id]: '' }),
                        )
                      }
                    >
                      {tr('Place')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <NumberedSectionCard number="+" icon="group_add" title={tr('New group')} subtitle={tr('Create a group and put students in it. Students already in a group are moved.')} theme="accent">
          <form onSubmit={(e) => void createGroup(e)} className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
            <Field label={tr('Name')}>
              <Input required maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tr('Team 4')} />
            </Field>
            {/* A list of checkboxes instead of a multiple <select> (which needed Ctrl or ⌘): the limit is visible and
                reached options are disabled. A fieldset, since a <label> (Field) cannot hold several inputs. */}
            <fieldset className="min-w-0">
              <legend className="font-mono-code mb-1.5 block text-[11px] font-semibold tracking-wider text-ink uppercase">{tr('Members')}</legend>
              <div className="max-h-40 overflow-y-auto rounded-[4px] border border-line-strong bg-surface p-1">
                {everyone.length === 0 && <p className="px-2 py-1.5 text-[12px] text-muted">{tr('No students on the roster yet.')}</p>}
                {everyone.map((p) => {
                  const checked = newMembers.includes(p.user_id);
                  const full = !checked && newMembers.length >= maxMembers;
                  return (
                    <label
                      key={p.user_id}
                      className={`flex items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13px] transition-colors ${
                        full ? 'cursor-not-allowed text-muted opacity-60' : 'cursor-pointer text-ink hover:bg-well'
                      } ${checked ? 'bg-accent-soft' : ''}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed"
                        checked={checked}
                        disabled={full}
                        onChange={() => setNewMembers(checked ? newMembers.filter((id) => id !== p.user_id) : [...newMembers, p.user_id])}
                      />
                      <span className="truncate">{p.display_name}</span>
                    </label>
                  );
                })}
              </div>
              <span className="font-mono-code mt-1 block text-[11px] text-muted" aria-live="polite">
                {tr('{n} of {max} chosen', { n: newMembers.length, max: maxMembers })}
              </span>
            </fieldset>
            <Button type="submit" loading={busy === 'create'} disabled={!newName.trim()}>
              {tr('Create group')}
            </Button>
          </form>
        </NumberedSectionCard>
      )}
    </div>
  );
}

/** Edits what can still change: texts and dates while open, and the rubric while it is a draft. */
function EditAssignment({ assignment: a, onDone }: { assignment: AssignmentView; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: a.title,
    instructions: a.instructions,
    learning_goals: a.learning_goals,
    opens_at: localInput(a.opens_at),
    due_at: localInput(a.due_at),
    group_lock_at: a.group_lock_at ? localInput(a.group_lock_at) : '',
    unlimited: a.max_submissions == null,
    max_submissions: a.max_submissions ?? 3,
    interviews_enabled: a.interviews_enabled,
    language: a.language,
    starter_repo_url: a.starter_repo_url ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = UpdateAssignmentSchema.safeParse({
      title: form.title.trim(),
      instructions: form.instructions,
      learning_goals: form.learning_goals,
      ...(a.status === 'draft' ? { opens_at: new Date(form.opens_at).toISOString() } : {}),
      due_at: new Date(form.due_at).toISOString(),
      ...(a.mode === 'group' ? { group_lock_at: form.group_lock_at ? new Date(form.group_lock_at).toISOString() : null } : {}),
      max_submissions: form.unlimited ? null : form.max_submissions,
      interviews_enabled: form.interviews_enabled,
      language: form.language,
      starter_repo_url: form.starter_repo_url.trim() || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? tr('Check the form.'));
      return;
    }
    setBusy(true);
    try {
      await api(`/api/assignments/${a.id}`, { method: 'PATCH', body: parsed.data });
      toast.success(tr('Assignment updated.'));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <NumberedSectionCard number="✎" icon="edit" title={tr('Edit assignment')} subtitle={tr('Changes reach the students right away. The kind of work and the group sizes stay as they are.')} theme="accent">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <Field label={tr('Title')}>
          <Input required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label={tr('Instructions')}>
          <Textarea rows={3} maxLength={4000} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </Field>
        <Field label={tr('Learning goals')}>
          <Textarea rows={2} maxLength={2000} value={form.learning_goals} onChange={(e) => setForm({ ...form, learning_goals: e.target.value })} />
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={tr('Opens')} hint={a.status === 'draft' ? undefined : tr('Already open.')}>
            <Input type="datetime-local" disabled={a.status !== 'draft'} value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} />
          </Field>
          <Field label={tr('Due')}>
            <Input type="datetime-local" required value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} />
          </Field>
          {a.mode === 'group' && (
            <Field label={tr('Groups close')} hint={tr('Empty: at the due date.')}>
              <Input type="datetime-local" value={form.group_lock_at} onChange={(e) => setForm({ ...form, group_lock_at: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <ToggleSwitch checked={form.unlimited} onChange={(v) => setForm({ ...form, unlimited: v })} />{' '}{tr('Unlimited versions')}
          </label>
          {!form.unlimited && (
            <Input type="number" min={1} max={100} aria-label={tr('Versions allowed')} value={form.max_submissions} onChange={(e) => setForm({ ...form, max_submissions: Number(e.target.value) })} className="w-24" />
          )}
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <ToggleSwitch checked={form.interviews_enabled} onChange={(v) => setForm({ ...form, interviews_enabled: v })} />{' '}{tr('Voice interview')}
          </label>
        </div>
        <ContestLanguageField value={form.language} onChange={(l) => setForm({ ...form, language: l })} />
        <StarterRepoField value={form.starter_repo_url} onChange={(v) => setForm({ ...form, starter_repo_url: v })} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>{tr('Save changes')}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>{tr('Cancel')}</Button>
        </div>
      </form>
    </NumberedSectionCard>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// /org/courses/:courseId/assignments/:id/s/:sid
// ---------------------------------------------------------------------------------------------------------------------

interface Analysis {
  commit_sha: string;
  model: string | null;
  map_json: RepoMap;
  commit_profile_json: CommitProfile | null;
  file_count: number;
}

interface SubmissionDetailResponse {
  primary_models: string[];
  submission: AssignmentSubmissionRow & {
    activity_json: AssignmentSubmissionRow['activity'];
    course_assignments: { id: string; course_id: string; title: string; rubric_json: Rubric; status: AssignmentView['status']; mode: AssignmentView['mode']; due_at: string; interviews_enabled: boolean; courses: { name: string; code: string } | null };
    repo_analyses: Analysis | Analysis[] | null;
    assignment_submission_versions: { id: string; version_no: number; description: string; video_url: string | null; created_at: string; submitted_by: string | null; repos: { owner: string; name: string; url: string } | null }[];
  };
  group: GroupView | null;
  student: { display_name: string; github_login: string | null } | null;
  scores: ScoreView[];
  feedback: { strengths_json: string[]; improvements_json: { what: string; where: string; next_step: string }[]; next_steps_json: string[] } | null;
  interviews: { id: string; status: string; user_id: string; interview_reports: { ownership_score: number; confidence: string } | { ownership_score: number; confidence: string }[] | null }[];
  decisions: { id: string; verdict: string; note: string; created_at: string; profiles: { display_name: string } | null }[];
  adjustments: { user_id: string; adjusted_total: number; note: string; adjusted_at: string }[];
}

export const VERDICT_LABEL: Record<string, string> = lazy(() => ({
  clear: tr('Cleared'),
  live_defense: tr('Live defense required'),
  code_of_conduct: tr('Referred to committee'),
  collusion: tr('Collusion'),
  direct_plagiarism: tr('Direct plagiarism'),
  independent_invention: tr('Independent work'),
  starter_template: tr('Shared starter code'),
}));

export function AssignmentSubmissionPage() {
  const { courseId = '', id = '', sid = '' } = useParams();
  const { org } = useAuth();
  const canManage = !!org?.permissions.includes('course.manage');
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const data = useLoad<SubmissionDetailResponse>(`${SUB_BASE}/${sid}`, (d) => WORKING.has(d.submission.status));
  const { busy, act } = useAction(data.reload);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<'clear' | 'live_defense' | 'code_of_conduct'>('clear');
  const [note, setNote] = useState('');

  if (!data.data) return <PageState loading={data.loading} error={data.error} kind="detail" />;
  const { submission: sub, group, student, scores, feedback, interviews, decisions, adjustments } = data.data;
  const a = sub.course_assignments;
  const rubric = a.rubric_json;
  const total = weightedTotal(rubric, scores);
  const analysis = one(sub.repo_analyses);
  const latest = sub.assignment_submission_versions.slice().sort((x, y) => y.version_no - x.version_no)[0];
  const repoUrl = latest?.repos?.url ?? null;
  const label = group?.name ?? student?.display_name ?? tr('Submission');
  const working = WORKING.has(sub.status);
  const canOverride = canManage && (a.status === 'review' || a.status === 'published');
  const ownershipOf = (userId: string) => {
    const i = interviews.find((x) => x.user_id === userId);
    const r = i ? (Array.isArray(i.interview_reports) ? i.interview_reports[0] : i.interview_reports) : null;
    return { interview: i ?? null, report: r ?? null };
  };

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <>
            <Link to={`/org/courses/${courseId}/assignments/${id}`} className="text-accent-ink hover:underline">
              ← {a.title.toUpperCase()}
            </Link>
            <Badge tone={sub.status === 'scored' ? 'good' : sub.status === 'error' ? 'bad' : 'neutral'}>{SUBMISSION_STATUS_LABEL[sub.status]}</Badge>
          </>
        }
        title={label}
        subtitle={
          <>
            {group ? tr('Group of {n}', { n: group.members.filter((m) => m.status === 'accepted').length }) : tr('Individual submission')}
            {latest?.repos && (
              <>
                {' · '}
                <a href={latest.repos.url} target="_blank" rel="noreferrer" className="font-mono-code text-accent-ink hover:underline">
                  {latest.repos.owner}/{latest.repos.name}
                </a>
              </>
            )}
            {sub.locked_commit_sha && <span className="font-mono-code"> @{sub.locked_commit_sha.slice(0, 7)}</span>}
          </>
        }
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            {total != null && (
              <span className="font-mono-code text-[28px] font-bold text-ink">
                {total.toFixed(1)}
                <span className="text-[13px] font-normal text-muted"> / 10</span>
              </span>
            )}
            {canManage && (
              <SubmissionJudgingControls
                id={sub.id}
                name={label}
                status={sub.status}
                frozen={!!sub.locked_commit_sha}
                busy={busy}
                act={(k, p, m, c) => void act(k, p, m, c)}
                basePath={SUB_BASE}
              />
            )}
          </div>
        }
      />

      {sub.error && <Notice tone="error">{sub.error}</Notice>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {scores.length > 0 ? (
            <NumberedSectionCard number="01" icon="fact_check" title={tr('Scores')} subtitle={canOverride ? tr('Change a score if you disagree; the total updates.') : tr('Scores can be changed once grading is done.')} theme="accent">
              <ul className="space-y-2.5">
                {rubric.map((c, i) => {
                  const sc = scores.find((x) => x.criterion_key === c.key);
                  return sc ? (
                    <ScoreCalibrationRow
                      key={c.key}
                      index={i}
                      score={sc}
                      criterion={c}
                      repoUrl={repoUrl}
                      sha={sub.locked_commit_sha}
                      canOverride={canOverride}
                      onSaved={() => void data.reload()}
                      scorePath="/api/assignment-scores"
                    />
                  ) : null;
                })}
              </ul>
            </NumberedSectionCard>
          ) : (
            <Notice tone="info">{working ? tr('Being graded…') : a.status === 'open' ? tr('Grading starts when the assignment closes.') : tr('No scores yet.')}</Notice>
          )}

          {feedback && (
            <NumberedSectionCard number="02" icon="rate_review" title={tr('Feedback for the student')} subtitle={tr('What they see once results are published.')} theme="good">
              <div className="space-y-4 text-[13px]">
                {feedback.strengths_json.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('Strengths')}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{feedback.strengths_json.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {feedback.improvements_json.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('To improve')}</p>
                    <ul className="mt-1 space-y-2">
                      {feedback.improvements_json.map((x) => (
                        <li key={x.what} className="rounded-[4px] border border-line bg-paper p-2.5">
                          <p className="text-ink">{x.what}</p>
                          {x.where && <p className="font-mono-code text-[11px] text-muted">{x.where}</p>}
                          {x.next_step && <p className="text-muted">{x.next_step}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {feedback.next_steps_json?.length > 0 && (
                  <div>
                    <p className="font-semibold text-ink">{tr('Next steps')}</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted">{feedback.next_steps_json.map((x) => <li key={x}>{x}</li>)}</ol>
                  </div>
                )}
              </div>
            </NumberedSectionCard>
          )}

          {analysis && (
            <NumberedSectionCard number="03" icon="account_tree" title={tr('What the grader read')} subtitle={`${analysis.file_count} files at commit ${analysis.commit_sha.slice(0, 7)}.`} theme="neutral">
              <p className="text-[13px] leading-relaxed text-ink">{analysis.map_json.summary}</p>
            </NumberedSectionCard>
          )}

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-semibold text-ink">{tr('Grading activity')}</p>
              <ModelsUsed models={sub.models_used} primary={data.data.primary_models} />
            </div>
            <AiActivity entries={sub.activity_json ?? []} live={working} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{group ? tr('Members') : tr('Student')}</p>
            <ul className="mt-3 space-y-3 text-[13px]">
              {(group ? group.members.filter((m) => m.status === 'accepted') : student ? [{ user_id: sub.student_id!, display_name: student.display_name, github_login: student.github_login }] : []).map((m) => {
                const adj = adjustments.find((x) => x.user_id === m.user_id);
                const { interview, report } = ownershipOf(m.user_id);
                const grade = adj ? Number(adj.adjusted_total) : total;
                return (
                  <li key={m.user_id} className="space-y-1.5 border-b border-line pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {m.display_name}
                        {m.github_login && <span className="font-mono-code ml-1.5 text-[11px] text-muted">@{m.github_login}</span>}
                      </span>
                      {grade != null && (
                        <span className="flex items-center gap-1">
                          <Badge tone={scoreTone(grade)}>{grade.toFixed(1)}</Badge>
                          {adj && <span className="font-mono-code text-[10px] text-accent-ink">adj.</span>}
                        </span>
                      )}
                    </div>
                    {adj?.note && <p className="text-[12px] text-muted">{adj.note}</p>}
                    {a.interviews_enabled && (
                      <p className="text-[12px] text-muted">
                        {tr('Interview:')}{' '}
                        {interview ? (
                          <Link to={`/interview/${interview.id}`} className="text-accent-ink hover:underline">
                            {report ? `ownership ${report.ownership_score}/100 (${report.confidence})` : interview.status.replace(/_/g, ' ')}
                          </Link>
                        ) : (
                          tr('not taken')
                        )}
                      </p>
                    )}
                    {group && canManage && total != null &&
                      (adjusting === m.user_id ? (
                        <AdjustGrade
                          assignmentId={a.id}
                          userId={m.user_id}
                          student={m.display_name}
                          cell={{ total, grade, adjusted: !!adj }}
                          onDone={() => {
                            setAdjusting(null);
                            void data.reload();
                          }}
                        />
                      ) : (
                        <button type="button" onClick={() => setAdjusting(m.user_id)} className="cursor-pointer text-[12px] font-semibold text-accent-ink hover:underline">
                          {adj ? tr('Change their grade') : tr('Adjust their grade')}
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{tr('Versions')}</p>
            <ul className="mt-2 space-y-2 text-[12px]">
              {sub.assignment_submission_versions
                .slice()
                .sort((x, y) => y.version_no - x.version_no)
                .map((v) => (
                  <li key={v.id}>
                    <span className="font-mono-code font-semibold text-ink">v{v.version_no}</span>
                    <span className="text-muted"> · {formatDate(v.created_at)}</span>
                    {v.repos && <span className="font-mono-code text-muted"> · {v.repos.owner}/{v.repos.name}</span>}
                    {v.description && <p className="text-muted">{v.description}</p>}
                  </li>
                ))}
            </ul>
          </section>

          <section className="rounded-[6px] border border-line bg-surface p-5">
            <p className="text-[14px] font-semibold text-ink">{tr('Integrity')}</p>
            {canDecide && (
              <div className="mt-3 space-y-2">
                <Select aria-label={tr('Verdict')} value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)}>
                  <option value="clear">{tr('Cleared: the work is theirs')}</option>
                  <option value="live_defense">{tr('Live defense required')}</option>
                  <option value="code_of_conduct">{tr('Refer to committee')}</option>
                </Select>
                <Textarea rows={2} aria-label={tr('Note')} placeholder={tr('Note (kept in the history)')} value={note} onChange={(e) => setNote(e.target.value)} />
                <Button
                  variant={verdict === 'code_of_conduct' ? 'danger' : 'secondary'}
                  loading={busy === 'verdict'}
                  disabled={!!busy}
                  onClick={() =>
                    void act('verdict', '/api/integrity-decisions', tr('Verdict saved.'), undefined, { assignment_submission_id: sub.id, verdict, note }).then(() => setNote(''))
                  }
                >
                  {tr('Save verdict')}
                </Button>
              </div>
            )}
            {decisions.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted">{tr('No verdict recorded.')}</p>
            ) : (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[12px]">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <span className="font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                    <span className="text-muted"> · {d.profiles?.display_name ?? 'reviewer'} · {formatDate(d.created_at)}</span>
                    {d.note && <p className="text-muted">{d.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
