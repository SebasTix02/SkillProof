import { tr } from '../../i18n';
/**
 * The console of one course assignment (its own screen, not the event console):
 *   /org/courses/:courseId/assignments/:id          status, actions, submissions, groups, missing, similarity
 *   /org/courses/:courseId/assignments/:id/s/:sid   one submission: scores, feedback, members, interviews, integrity
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  DossierPageHeader,
  Notice,
  PageState,
  SIMILARITY_SIGNAL_LABEL,
  Tabs,
  formatDate,
  linkButtonSecondary,
} from '../../components/shared';
import { useAuth } from '../../lib/auth';
import {
  COURSE_STATUS_TONE,
  groupSizeLabel,
  type AssignmentConsoleResponse,
} from '../../lib/courses';
import { STATUS_LABEL } from '../../lib/types';
import { useLoad } from '../../lib/useLoad';
import { GroupsPanel } from './consoles/AssignmentGroupsPanel';
import { MissingList, SubmissionsTable } from './consoles/AssignmentSubmissionsAndMissing';
import { EditAssignment } from './consoles/EditAssignmentCard';
import { WORKING, useAction } from './consoles/useAction';

export { AssignmentSubmissionPage } from './consoles/AssignmentSubmissionPage';

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
            {tr('Opens {opens} · due {due}', { opens: formatDate(a.opens_at), due: formatDate(a.due_at) })}
            {isGroup && a.groups_close_at && ` · ${tr('groups close {date}', { date: formatDate(a.groups_close_at) })}`}
            {a.interviews_enabled && ` · ${tr('voice interview after grading')}`}
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
