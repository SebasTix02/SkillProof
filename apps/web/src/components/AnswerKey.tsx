import { Badge } from './shared';

export interface AnswerKeyQuestion {
  id: string;
  question: string;
  skill: string;
  expected_points: string[];
}

export interface AnswerCoverage {
  question_id: string;
  covered: string[];
  missed: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * After the interview: for each question, the points a strong answer covered, marked as made or missed according
 * to the evaluation. Shown only to the candidate and the event's organizers, never before the interview is done.
 */
export function AnswerKey({ questions, answers }: { questions: AnswerKeyQuestion[]; answers: AnswerCoverage[] }) {
  if (questions.length === 0) return null;
  return (
    <section className="print-avoid-break space-y-3 border-t border-line pt-6">
      <div>
        <h3 className="font-serif-heading text-[20px] font-medium text-ink">What a strong answer covered</h3>
        <p className="text-[12px] text-muted">
          The points the author of this code would be expected to mention, and which ones came up in the interview.
        </p>
      </div>
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const a = answers.find((x) => x.question_id === q.id);
          const covered = new Set((a?.covered ?? []).map(norm));
          const made = q.expected_points.filter((p) => covered.has(norm(p))).length;
          return (
            <li key={q.id} className="print-avoid-break space-y-2 rounded-[4px] border border-line bg-paper/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[14px] font-medium text-ink">
                  <span className="font-mono-code mr-1.5 text-[11px] text-muted">Q{i + 1}</span>
                  {q.question}
                </p>
                <span className="flex items-center gap-2">
                  <Badge>{q.skill}</Badge>
                  {a && <Badge tone={made === q.expected_points.length ? 'good' : made > 0 ? 'warn' : 'bad'}>{made} / {q.expected_points.length}</Badge>}
                </span>
              </div>
              <ul className="space-y-1 text-[13px]">
                {q.expected_points.map((p) => {
                  const hit = covered.has(norm(p));
                  return (
                    <li key={p} className="flex items-start gap-2">
                      <span aria-hidden className={`material-symbols-outlined text-[16px] ${!a ? 'text-muted' : hit ? 'text-good' : 'text-bad'}`}>
                        {!a ? 'radio_button_unchecked' : hit ? 'check_circle' : 'cancel'}
                      </span>
                      <span className={hit ? 'text-ink' : 'text-muted'}>
                        {p}
                        <span className="sr-only">{!a ? '' : hit ? ' (covered)' : ' (missed)'}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
      {answers.length === 0 && (
        <p className="text-[11px] text-muted">This report was written before coverage was recorded, so points are listed without marks.</p>
      )}
    </section>
  );
}
