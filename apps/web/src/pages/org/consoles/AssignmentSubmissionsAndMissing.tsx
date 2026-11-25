import { Link } from 'react-router-dom';
import { SubmissionJudgingControls } from '../../../components/JudgingControls';
import {
  Badge,
  LiveDot,
  Notice,
  SUBMISSION_STATUS_LABEL,
  linkButtonSecondary,
  scoreTone,
} from '../../../components/shared';
import { t, tr, trn } from '../../../i18n';
import type { AssignmentSubmissionRow, AssignmentView, Person } from '../../../lib/courses';
import { SUB_BASE, WORKING } from './useAction';

export function SubmissionsTable({
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
                    {trn('{count} version', '{count} versions', s.versions_used)}
                    {s.submitted_by_name && s.members && ` · ${tr('last by {name}', { name: s.submitted_by_name })}`}
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
                      <span className="text-muted">{s.interviews.length ? trn('{count} started', '{count} started', s.interviews.length) : '—'}</span>
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

export function MissingList({ people, isGroup }: { people: Person[]; isGroup: boolean }) {
  if (people.length === 0)
    return (
      <Notice tone="good">
        {isGroup ? tr('Every student on the roster has a submission through their group.') : tr('Every student on the roster has submitted.')}
      </Notice>
    );
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
