import { tr, trn } from '../../i18n';
import { SectionHeader } from '../../components/shared';
import { type Results } from './types';

export function LeaderboardSection({
  leaderboard,
  totalTeams,
}: {
  leaderboard: Results['leaderboard'];
  totalTeams: number;
}) {
  return (
    <section id="leaderboardSection" className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
      <SectionHeader
        title={tr('Official Event Leaderboard')}
        subtitle={trn('Final standings across {count} participating team.', 'Final standings across {count} participating teams.', totalTeams)}
        rightSlot={
          <div className="font-mono-code flex items-center gap-1.5 rounded-[3px] border border-line bg-paper px-3 py-1 text-[11px] text-muted">
            <span className="material-symbols-outlined text-[14px] text-good">lock</span>
            <span>{tr('FINAL RANKING PUBLISHED')}</span>
          </div>
        }
      />

      <div className="overflow-x-auto">
        <table className="font-mono-code w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line bg-paper text-[11px] tracking-wider text-muted uppercase">
              <th className="px-4 py-3">{tr('Rank')}</th>
              <th className="px-4 py-3">{tr('Cohort Team / Submission')}</th>
              <th className="px-4 py-3 text-right">{tr('Composite Score')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leaderboard?.map((row) => (
              <tr
                key={row.rank}
                className={
                  row.mine
                    ? 'bg-accent-soft/65 hover:bg-accent-soft transition-colors'
                    : 'hover:bg-paper/60 transition-colors'
                }
              >
                <td
                  className={`font-serif-heading px-4 py-3.5 text-[18px] font-bold ${
                    row.mine ? 'text-accent' : 'text-ink'
                  }`}
                >
                  #{String(row.rank).padStart(2, '0')}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] ${row.mine ? 'font-bold text-accent' : 'font-semibold text-ink'}`}>
                      {row.team_name}
                    </span>
                    {row.mine && (
                      <span className="rounded-[2px] bg-accent px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-on-accent uppercase">
                        {tr('YOUR SUBMISSION')}
                      </span>
                    )}
                  </div>
                </td>
                <td
                  className={`font-serif-heading px-4 py-3.5 text-right text-[20px] font-bold ${
                    row.mine ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {row.total.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
