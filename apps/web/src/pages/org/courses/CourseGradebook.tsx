import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Input,
  PageState,
  SUBMISSION_STATUS_LABEL,
  scoreTone,
  type SubmissionPipelineStatus,
} from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr } from '../../../i18n';
import { rich } from '../../../i18n/rich';
import { api, errorMessage } from '../../../lib/api';
import { useLoad } from '../../../lib/useLoad';
import { csvQuote, downloadCsv } from '../download';
import type { GradeCell, GradebookResponse } from './types';

/**
 * Students × assignments. In a group assignment every member gets the group total; staff can set another total for
 * one student (the change is marked, and tr('Use the group grade') removes it).
 */
export function CourseGradebook({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const book = useLoad<GradebookResponse>(`/api/courses/${courseId}/gradebook`);
  const [editing, setEditing] = useState<{ assignmentId: string; userId: string } | null>(null);
  if (!book.data) return <PageState loading={book.loading} error={book.error} kind="table" />;
  const { assignments, students } = book.data;

  function exportCsv() {
    const header = ['student', 'section', ...assignments.map((a) => a.title)];
    const lines = students.map((s) => [s.display_name, s.section, ...assignments.map((a) => s.grades[a.id]?.grade?.toFixed(1) ?? '')]);
    const csv = [header, ...lines].map((r) => r.map((v) => csvQuote(String(v))).join(',')).join('\n');
    downloadCsv('gradebook.csv', csv);
  }

  if (students.length === 0 || assignments.length === 0)
    return (
      <section className="rounded-[6px] border border-line bg-surface p-8 text-center text-[13px] text-muted">
        {tr('The gradebook fills in once the course has students and assignments.')}
      </section>
    );
  return (
    <section className="rounded-[6px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="text-[13px] text-muted">
          {rich(tr('Grade out of 10 per assignment. Group work: each member gets the group grade unless you adjust it ({adj}). Empty: no submission.'), {
            adj: <span className="font-mono-code text-accent-ink">{tr('adj.')}</span>,
          })}
        </p>
        <Button type="button" variant="secondary" onClick={exportCsv}>
          <span className="material-symbols-outlined text-[16px]">file_download</span>
          <span>{tr('Export CSV')}</span>
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead className="font-mono-code bg-paper text-[11px] text-muted uppercase">
            <tr>
              <th className="sticky left-0 bg-paper px-5 py-2.5 font-semibold">{tr('Student')}</th>
              <th className="px-3 py-2.5 font-semibold">{tr('Section')}</th>
              {assignments.map((a) => (
                <th key={a.id} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                  {a.title}
                  {a.mode === 'group' && <span className="ml-1 font-normal normal-case">{tr('· group')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {students.map((s) => (
              <tr key={s.user_id}>
                <td className="sticky left-0 bg-surface px-5 py-2.5 font-medium text-ink">{s.display_name}</td>
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
                          <Link to={`/org/courses/${courseId}/assignments/${a.id}/s/${g.submission_id}`} className="hover:underline" title={g.group ? tr('Group: {name}', { name: g.group }) : undefined}>
                            {g.grade != null ? (
                              <Badge tone={scoreTone(g.grade)}>{g.grade.toFixed(1)}</Badge>
                            ) : (
                              <span className="text-[12px] text-muted">{SUBMISSION_STATUS_LABEL[g.status as SubmissionPipelineStatus] ?? g.status}</span>
                            )}
                          </Link>
                          {g.adjusted && <span className="font-mono-code text-[10px] text-accent-ink" title={tr('Group grade {grade}', { grade: g.total?.toFixed(1) ?? '—' })}>{tr('adj.')}</span>}
                          {canManage && a.mode === 'group' && g.total != null && (
                            <button
                              type="button"
                              onClick={() => setEditing({ assignmentId: a.id, userId: s.user_id })}
                              aria-label={tr('Adjust the grade of {name} on {title}', { name: s.display_name, title: a.title })}
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
export function AdjustGrade({
  assignmentId,
  userId,
  student,
  cell,
  onDone,
}: {
  assignmentId: string;
  userId: string;
  student: string;
  cell: Pick<GradeCell, 'total' | 'grade' | 'adjusted'>;
  onDone: () => void;
}) {
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
      toast.success(tr('Grade of {name} set to {grade}.', { name: student, grade: Number(value).toFixed(1) }));
      onDone();
    } catch (err) {
      toast.error(tr('The grade was not saved. {error}', { error: errorMessage(err) }));
      setBusy(false);
    }
  }

  async function reset() {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/assignments/${assignmentId}/adjustments/${target}`, { method: 'DELETE' });
      toast.success(tr('{name} has the group grade again.', { name: student }));
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void save(e)} className="w-56 space-y-2 rounded-[4px] border border-line bg-paper p-2.5">
      <p className="text-[11px] text-muted">{tr('Group grade:')}{' '}{cell.total?.toFixed(1) ?? '—'}</p>
      <Input type="number" min={0} max={10} step={0.1} required aria-label={tr('Grade for {name}', { name: student })} value={value} onChange={(e) => setValue(e.target.value)} />
      <Input aria-label={tr('Reason')} placeholder={tr('Reason (optional)')} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        <Button type="submit" loading={busy} className="px-2.5 py-1 text-[12px]">{tr('Save')}</Button>
        {cell.adjusted && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void reset()} className="px-2.5 py-1 text-[12px]">
            {tr('Use the group grade')}
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone} className="px-2.5 py-1 text-[12px]">{tr('Cancel')}</Button>
      </div>
    </form>
  );
}
