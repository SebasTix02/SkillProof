import type { FocusEvent as ExamFocusEvent, PublicQuestion } from '@skillproof/shared';
import { tr } from '../../i18n';
import type { InterviewResponse, RoomPhase } from './types';

export function InterviewCodePane({
  interview,
  questions,
  activeQuestion,
  onSelectQuestion,
  phase,
  away,
  paused,
}: {
  interview: InterviewResponse['interview'];
  questions: PublicQuestion[];
  activeQuestion: PublicQuestion | null;
  onSelectQuestion: (question: PublicQuestion) => void;
  phase: RoomPhase;
  away: ExamFocusEvent['type'] | null;
  paused: boolean;
}) {
  const snippetLines = activeQuestion ? activeQuestion.snippet.split('\n') : [];

  return (
    <div className="flex flex-col border-b border-line bg-paper lg:col-span-7 lg:border-r lg:border-b-0">
      {/* File Navigation Subheader */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-5 py-2.5 text-muted">
        <div className="font-mono-code flex items-center gap-2 text-[12px]">
          <span className="material-symbols-outlined text-[16px] text-accent">code</span>
          <span className="font-semibold text-ink">
            {activeQuestion ? activeQuestion.path : `${interview.repo.owner}/${interview.repo.name}`}
          </span>
          {activeQuestion && (
            <>
              <span className="text-line">|</span>
              <span>
                {tr('Lines')}{' '}{activeQuestion.start_line}–{activeQuestion.end_line}
              </span>
            </>
          )}
        </div>

        {questions.length > 1 && (
          <div className="flex items-center gap-1">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                type="button"
                onClick={() => onSelectQuestion(q)}
                className={`font-mono-code cursor-pointer rounded-[3px] border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  activeQuestion?.id === q.id
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-paper text-muted hover:text-ink'
                }`}
              >
                Q{idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable Code Box */}
      <div
        className={`interview-code font-mono-code max-h-[45vh] flex-1 overflow-x-auto overflow-y-auto bg-paper p-4 text-[12px] leading-[20px] text-ink select-none lg:max-h-[60vh] ${
          phase === 'live' && (away || paused) ? 'invisible' : ''
        }`}
      >
        {activeQuestion ? (
          <table className="w-full border-collapse">
            <tbody>
              {snippetLines.map((line, i) => {
                const lineNo = activeQuestion.start_line + i;
                return (
                  <tr key={lineNo} className="border-l-[3px] border-accent bg-accent-soft/45">
                    <td className="w-10 pr-4 text-right text-[11px] font-medium text-accent select-none">
                      {lineNo}
                    </td>
                    <td className="whitespace-pre text-ink">{line || ' '}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">
            {tr('The code snippet referenced by the interviewer will appear here as soon as the session begins.')}
          </p>
        )}
      </div>

      {/* Code Inspector Baseline Status */}
      <footer className="font-mono-code flex items-center justify-between border-t border-line bg-surface px-5 py-2.5 text-[11px] text-muted">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-medium text-ink">
            {activeQuestion
              ? tr('Target Citation: {path} ({start}–{end})', {
                  path: activeQuestion.path,
                  start: activeQuestion.start_line,
                  end: activeQuestion.end_line,
                })
              : tr('Code Hook Inspector Ready')}
          </span>
        </div>
        {interview.commit_sha && (
          <span>
            {tr('SHA:')}{' '}{interview.commit_sha.slice(0, 12)}
          </span>
        )}
      </footer>
    </div>
  );
}
