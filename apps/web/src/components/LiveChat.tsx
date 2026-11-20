import type { PublicQuestion, TranscriptEntry } from '@skillproof/shared';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

/**
 * The whole interview so far as a chat: every turn of the interviewer and the candidate, grouped by question.
 * Follows the newest message while the reader is at the bottom; a button brings them back if they scrolled up.
 */
export function LiveChat({ messages, questions, className = '' }: { messages: TranscriptEntry[]; questions: PublicQuestion[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const lastLength = messages.reduce((n, m) => n + m.text.length, 0);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [lastLength, messages.length, follow]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== follow) setFollow(atBottom);
  }

  const questionNumber = (id: string | null | undefined) => {
    const i = questions.findIndex((q) => q.id === id);
    return i >= 0 ? i + 1 : null;
  };

  let lastQuestion: string | null | undefined;

  return (
    <div className={`relative flex min-h-0 flex-col ${className}`}>
      <div
        ref={box}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Interview conversation"
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto rounded-[4px] border border-line bg-paper p-3.5"
      >
        {messages.length === 0 && <p className="font-mono-code text-[11px] text-muted">The conversation appears here as you talk.</p>}
        {messages.map((m, i) => {
          const n = questionNumber(m.question_id);
          const showSeparator = m.question_id && m.question_id !== lastQuestion && n !== null;
          lastQuestion = m.question_id ?? lastQuestion;
          return (
            <Fragment key={i}>
              {showSeparator && (
                <div className="font-mono-code flex items-center gap-2 py-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                  <span className="h-px flex-1 bg-line" />
                  Question {n} of {questions.length}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              {m.role === 'system' ? (
                <p className="font-mono-code rounded-[3px] border border-warn/30 bg-warn-soft px-2.5 py-1.5 text-[11px] text-warn-ink">
                  Skipped: {m.text}
                </p>
              ) : (
                <div className={`flex ${m.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-[6px] border px-3 py-2 text-[13px] leading-[20px] break-words whitespace-pre-wrap ${
                      m.role === 'candidate' ? 'border-good/30 bg-good-soft text-ink' : 'border-accent-200 bg-white text-ink'
                    }`}
                  >
                    <span className={`font-mono-code mb-0.5 block text-[10px] font-bold uppercase ${m.role === 'candidate' ? 'text-good' : 'text-accent'}`}>
                      {m.role === 'candidate' ? 'You' : 'Interviewer'}
                    </span>
                    {m.text}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      {!follow && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="absolute right-3 bottom-3 rounded-full border border-line bg-white px-3 py-1 text-[11px] font-medium text-ink shadow hover:bg-paper"
        >
          Jump to latest ↓
        </button>
      )}
    </div>
  );
}
