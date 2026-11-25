import { Link } from 'react-router-dom';
import {
  Badge,
  Input,
  SUBMISSION_STATUS_LABEL,
  Select,
  Tabs,
} from '../../../components/shared';
import { tr } from '../../../i18n';
import type { CohortMetrics, ConsoleSubmission, RosterFilter, SortKey, Target } from './types';

export function IntegrityRosterTable({
  target,
  submissionsCount,
  flaggedSet,
  metrics,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sortBy,
  onSortChange,
  filteredRows,
  effectiveSelectedId,
  onSelectSub,
}: {
  target: Target | null;
  submissionsCount: number;
  flaggedSet: ReadonlySet<string>;
  metrics: CohortMetrics;
  search: string;
  onSearchChange: (q: string) => void;
  filter: RosterFilter;
  onFilterChange: (f: RosterFilter) => void;
  sortBy: SortKey;
  onSortChange: (s: SortKey) => void;
  filteredRows: readonly ConsoleSubmission[];
  effectiveSelectedId: string | null;
  onSelectSub: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col justify-between gap-3 rounded-[6px] border border-line bg-surface p-3.5 md:flex-row md:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1">
            <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[17px] text-muted">
              search
            </span>
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={tr('Search student, team, commit SHA, or repo...')}
              className="h-9 bg-paper pl-8 text-[12px]"
            />
          </div>

          <Tabs
            variant="segmented"
            size="sm"
            ariaLabel={tr('Filter submissions')}
            tabs={[
              { key: 'all', label: tr('All ({n})', { n: submissionsCount }) },
              { key: 'flagged', label: tr('Flagged ({n})', { n: flaggedSet.size }) },
              { key: 'incomplete_defense', label: tr('No Defense ({n})', { n: submissionsCount - metrics.withOwnershipCount }) },
              { key: 'scored', label: tr('Scored ({n})', { n: metrics.scoredCount }) },
            ]}
            active={filter}
            onChange={onFilterChange}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono-code text-[11px] text-muted">{tr('SORT:')}</span>
          <Select
            aria-label={tr('Sort submissions')}
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="font-mono-code h-9 w-48 bg-paper text-[11px]"
          >
            <option value="risk">{tr('Similarity & Risk (Desc)')}</option>
            <option value="lowest_ownership">{tr('Lowest Ownership Score')}</option>
            <option value="highest_grade">{tr('Highest Composite Grade')}</option>
            <option value="name">{tr('Student Name (A–Z)')}</option>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-line bg-surface">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead className="font-mono-code border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-semibold">{tr('Student / Team')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Repository & Commit')}</th>
              <th className="px-3 py-3 text-right font-semibold">{tr('Oral Probe')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Integrity Signal')}</th>
              <th className="px-3 py-3 text-right font-semibold">{tr('Composite')}</th>
              <th className="px-3 py-3 font-semibold">{tr('Status')}</th>
              <th className="px-4 py-3 text-right font-semibold">{tr('Inspection')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[13px] text-muted">
                  {tr('No student submissions match the current filter.')}
                </td>
              </tr>
            ) : (
              filteredRows.map((s) => {
                const repo = s.current_version?.repos;
                const isFlagged = flaggedSet.has(s.id);
                const isSelected = s.id === effectiveSelectedId;
                return (
                  <tr
                    key={s.id}
                    onClick={() => onSelectSub(s.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent-soft/45'
                        : isFlagged
                          ? 'bg-bad-soft/25 hover:bg-bad-soft/40'
                          : 'hover:bg-paper/60'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isFlagged ? 'bg-bad' : s.status === 'scored' ? 'bg-good' : 'bg-muted'
                          }`}
                        />
                        <div>
                          <div className="font-semibold text-ink">{s.submitted_by_name || s.team_name}</div>
                          <div className="font-mono-code text-[11px] text-muted">{s.team_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono-code px-3 py-3 text-[12px]">
                      {repo ? (
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-accent hover:underline"
                        >
                          {repo.owner}/{repo.name}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {s.locked_commit_sha && (
                        <div className="text-[10px] text-muted">{tr('commit @')}{s.locked_commit_sha.slice(0, 7)}</div>
                      )}
                    </td>
                    <td className="font-mono-code px-3 py-3 text-right">
                      {s.ownership ? (
                        <span
                          className={`font-bold ${
                            s.ownership.score >= 70 ? 'text-good' : 'text-bad'
                          }`}
                        >
                          {s.ownership.score}/100
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {isFlagged ? (
                        <Badge tone="bad" dot>
                          {tr('Similarity Flag')}
                        </Badge>
                      ) : (
                        <Badge tone="good">{tr('Unique Tree')}</Badge>
                      )}
                    </td>
                    <td className="font-mono-code px-3 py-3 text-right text-[14px] font-bold text-ink">
                      {s.total != null ? `${s.total.toFixed(1)}` : '—'}
                      <span className="text-[11px] font-normal text-muted"> / 100</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={s.status === 'scored' ? 'good' : s.status === 'error' ? 'bad' : 'neutral'}>
                        {SUBMISSION_STATUS_LABEL[s.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {target && (
                        <Link
                          to={target.submissionLink(s.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="btn-tactile font-mono-code inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-accent hover:border-accent"
                        >
                          <span>{tr('Inspect')}</span>
                          <span>→</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
