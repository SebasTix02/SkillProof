import { Link } from 'react-router-dom';
import { Input } from '../../../components/shared';
import { tr } from '../../../i18n';
import { rich } from '../../../i18n/rich';
import type { QueueSubmission } from './types';

export function SubmissionQueueRail({
  eventId,
  activeSubmissionId,
  activeTeamName,
  sha,
  isManager,
  queueLength,
  queueLoading,
  queueSearch,
  onQueueSearchChange,
  filteredQueue,
}: {
  eventId: string | undefined;
  activeSubmissionId: string;
  activeTeamName: string;
  sha: string | null;
  isManager: boolean;
  queueLength: number;
  queueLoading: boolean;
  queueSearch: string;
  onQueueSearchChange: (q: string) => void;
  filteredQueue: readonly QueueSubmission[];
}) {
  return (
    <aside className="flex flex-col gap-3.5 rounded-[6px] border border-line bg-surface p-4 lg:col-span-3">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono-code text-[11px] font-bold tracking-wider text-ink uppercase">
            {tr('Assigned Queue')}
          </span>
        </div>
        <span className="font-mono-code rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">
          {queueLength} {isManager ? tr('Submissions') : tr('Assigned')}
        </span>
      </div>

      <div className="relative">
        <span className="material-symbols-outlined pointer-events-none absolute top-2 left-2.5 text-[15px] text-muted">
          search
        </span>
        <Input
          value={queueSearch}
          onChange={(e) => onQueueSearchChange(e.target.value)}
          placeholder={tr('Filter by team or hash...')}
          className="h-8 bg-paper pl-8 text-[12px]"
        />
      </div>

      <nav aria-label={tr('Review Queue')} className="flex max-h-[600px] flex-col gap-2 overflow-y-auto pr-0.5">
        {filteredQueue.length > 0 ? (
          filteredQueue.map((item, idx) => {
            const isActive = item.id === activeSubmissionId;
            return (
              <Link
                key={item.id}
                to={`/org/events/${eventId}/s/${item.id}`}
                className={`flex flex-col gap-1.5 rounded-[4px] border p-3 transition-colors ${
                  isActive
                    ? 'border-2 border-accent bg-accent-soft/45'
                    : 'border-line bg-paper/45 hover:border-muted hover:bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-[13px] ${
                      isActive ? 'font-bold text-ink' : 'font-semibold text-ink'
                    }`}
                  >
                    {item.team_name}
                  </span>
                  {isActive ? (
                    <span className="font-mono-code rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-on-accent uppercase">
                      {tr('ACTIVE')}
                    </span>
                  ) : item.total != null ? (
                    <span className="font-mono-code rounded-[2px] border border-good/30 bg-good-soft px-1.5 py-0.5 text-[10px] font-bold text-good-ink">
                      {item.total.toFixed(1)}
                    </span>
                  ) : (
                    <span className="font-mono-code rounded-[2px] bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                      --.-
                    </span>
                  )}
                </div>
                <div className="font-mono-code flex items-center justify-between text-[10px] text-muted">
                  <span>
                    #{String(idx + 1).padStart(2, '0')}{' '}
                    {item.locked_commit_sha ? `• @${item.locked_commit_sha.slice(0, 7)}` : ''}
                  </span>
                  <span
                    className={
                      item.status === 'scored'
                        ? 'font-semibold text-good'
                        : item.status === 'error'
                          ? 'font-semibold text-bad'
                          : 'text-warn'
                    }
                  >
                    {item.status === 'scored' ? tr('Scored') : item.status}
                  </span>
                </div>
              </Link>
            );
          })
        ) : queueLoading ? (
          <p className="py-3 text-center text-[12px] text-muted">{tr('Loading the queue…')}</p>
        ) : !isManager && queueLength === 0 ? (
          <p className="rounded-[4px] border border-line bg-paper p-3 text-[12px] text-muted">
            {tr('No submissions of this event are assigned to you yet. An organizer assigns them from the event console.')}
          </p>
        ) : (
          <div className="rounded-[4px] border border-accent bg-accent-soft/40 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink">{activeTeamName}</span>
              <span className="font-mono-code rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold text-on-accent uppercase">
                {tr('ACTIVE')}
              </span>
            </div>
            {sha && <div className="font-mono-code mt-1 text-[10px] text-muted">@{sha.slice(0, 7)}</div>}
          </div>
        )}
      </nav>

      <div className="font-mono-code rounded-[4px] border border-line bg-paper p-3 text-[11px] text-muted">
        <div className="flex items-center justify-between font-semibold text-ink">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-accent">keyboard</span>
            <span>{tr('Queue Navigation')}</span>
          </span>
          <span className="text-good">{tr('J / K Ready')}</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          {rich(tr('Press {j} or {k} to jump between cohort dossiers.'), {
            j: <kbd className="rounded border border-line bg-surface px-1">J</kbd>,
            k: <kbd className="rounded border border-line bg-surface px-1">K</kbd>,
          })}
        </p>
      </div>
    </aside>
  );
}
