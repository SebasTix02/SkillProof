import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PublicQuestion, TranscriptEntry } from '@skillproof/shared';
import { LiveChat } from './LiveChat';

const questions: PublicQuestion[] = [
  { id: 'q1', kind: 'why', question: 'Why use a queue?', path: 'src/q.ts', start_line: 1, end_line: 10, skill: 'Queues', snippet: 'const q = [];' },
  { id: 'q2', kind: 'failure', question: 'What if Redis drops?', path: 'src/r.ts', start_line: 1, end_line: 10, skill: 'Resilience', snippet: 'retry();' },
];

describe('LiveChat', () => {
  it('renders an accessible polite log region when empty', () => {
    const html = renderToStaticMarkup(<LiveChat messages={[]} questions={questions} />);
    expect(html).toContain('role="log"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('The conversation appears here as you talk.');
  });

  it('groups turns by question separator and distinguishes interviewer, candidate, and skipped system notes', () => {
    const messages: TranscriptEntry[] = [
      { role: 'interviewer', text: 'Why use a queue?', at_ms: 1000, question_id: 'q1' },
      { role: 'candidate', text: 'To absorb traffic bursts cleanly.', at_ms: 3000, question_id: 'q1' },
      { role: 'system', text: 'The candidate asked to move on from question q1.', at_ms: 5000, question_id: 'q1' },
      { role: 'interviewer', text: 'What if Redis drops?', at_ms: 6000, question_id: 'q2' },
    ];
    const html = renderToStaticMarkup(<LiveChat messages={messages} questions={questions} />);

    expect(html).toContain('Question 1 of 2');
    expect(html).toContain('Question 2 of 2');
    expect(html).toContain('To absorb traffic bursts cleanly.');
    expect(html).toContain('Skipped:');
  });
});
