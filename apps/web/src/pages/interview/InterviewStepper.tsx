import { tr } from '../../i18n';
import type { InterviewStatus } from './types';

export function InterviewStepper({
  status,
  liveActive,
}: {
  status: InterviewStatus;
  liveActive: boolean;
}) {
  const activeStage =
    status === 'preparing'
      ? 1
      : status === 'ready' && !liveActive
        ? 2
        : status === 'in_progress' || liveActive
          ? 3
          : status === 'evaluating'
            ? 4
            : status === 'completed'
              ? 5
              : 1;

  const stages = [
    { num: 1, label: tr('01. AST Parse') },
    { num: 2, label: tr('02. Mic & Consent') },
    { num: 3, label: tr('03. Live Oral Interview') },
    { num: 4, label: tr('04. Synthesis Engine') },
    { num: 5, label: tr('05. Verified Credential Dossier') },
  ];

  return (
    <section className="rounded-[6px] border border-line bg-surface p-4 sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
          {stages.map((st, idx) => {
            const isCurrent = st.num === activeStage;
            const isDone = st.num < activeStage || status === 'completed';
            const isEmerald = st.num === 5 && status === 'completed';
            return (
              <div key={st.num} className="flex items-center gap-2">
                {idx > 0 && <span className="text-line">→</span>}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 transition-colors ${
                    isEmerald
                      ? 'border border-good/30 bg-good-soft font-semibold text-good-ink'
                      : isCurrent
                        ? 'border border-accent/25 bg-accent-soft font-semibold text-accent-ink'
                        : isDone
                          ? 'text-good-ink font-medium'
                          : 'text-faint'
                  }`}
                >
                  {isCurrent && (
                    <span
                      className={`status-dot-live ${
                        isEmerald ? 'bg-good text-good' : 'bg-accent text-accent'
                      }`}
                    />
                  )}
                  {!isCurrent && isDone && <span className="h-1.5 w-1.5 rounded-full bg-good" />}
                  <span>{st.label}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="font-mono-code flex items-center gap-2 rounded-[4px] border border-line bg-paper p-1 text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 font-semibold ${
              status !== 'completed' ? 'border border-line bg-surface text-accent' : 'text-muted'
            }`}
          >
            {status !== 'completed' && <span className="h-1.5 w-1.5 rounded-full bg-bad" />}
            <span>{tr('Live Examination Cockpit')}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 font-semibold ${
              status === 'completed' ? 'border border-good/30 bg-good-soft text-good-ink' : 'text-muted'
            }`}
          >
            <span className="material-symbols-outlined text-[14px] text-good">verified</span>
            <span>{tr('Verified Dossier')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
