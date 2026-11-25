import { FinishInterviewSchema, describeFocusEvents, type QuestionPlan } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { answerKey, interviewerInstruction, publicQuestions } from './services/interviews.js';

const plan: QuestionPlan = {
  questions: [
    { id: 'q1', kind: 'why', question: 'Why a queue here?', path: 'src/a.ts', start_line: 1, end_line: 5, expected_points: ['backpressure', 'ordering'], skill: 'Concurrency' },
    { id: 'q2', kind: 'explain', question: 'Walk me through retry.', path: 'src/b.ts', start_line: 3, end_line: 9, expected_points: ['jitter'], skill: 'Resilience' },
    { id: 'q3', kind: 'failure', question: 'What breaks if the DB is down?', path: 'src/c.ts', start_line: 2, end_line: 8, expected_points: ['fallback cache'], skill: 'Failure modes' },
  ],
};

describe('answer key', () => {
  it('is never sent before the interview is completed', () => {
    for (const status of ['preparing', 'ready', 'in_progress', 'evaluating', 'error'] as const) expect(answerKey(status, plan)).toBeNull();
  });

  it('is sent once completed, with the expected points of every question', () => {
    expect(answerKey('completed', plan)).toEqual([
      { id: 'q1', question: 'Why a queue here?', skill: 'Concurrency', expected_points: ['backpressure', 'ordering'] },
      { id: 'q2', question: 'Walk me through retry.', skill: 'Resilience', expected_points: ['jitter'] },
      { id: 'q3', question: 'What breaks if the DB is down?', skill: 'Failure modes', expected_points: ['fallback cache'] },
    ]);
  });

  it('stays out of the questions the room receives', () => {
    expect(JSON.stringify(publicQuestions(plan, []))).not.toContain('backpressure');
  });
});

describe('finishing an interview', () => {
  it('accepts skipped questions and focus events with the transcript', () => {
    const input = FinishInterviewSchema.parse({
      transcript: [
        { role: 'interviewer', text: 'Why a queue here?', at_ms: 1000, question_id: 'q1' },
        { role: 'system', text: 'The candidate skipped question q1.', at_ms: 5000, question_id: 'q1' },
      ],
      duration_s: 120,
      focus_events: [
        { type: 'tab_hidden', at_ms: 20_000, duration_ms: 9_000 },
        { type: 'fullscreen_exit', at_ms: 60_000, duration_ms: 5_400 },
      ],
    });
    expect(input.transcript[1]!.role).toBe('system');
    expect(describeFocusEvents(input.focus_events)).toBe('Left the interview window 2 times (total 14 s).');
  });

  it('works for old clients that send no focus events', () => {
    expect(FinishInterviewSchema.parse({ transcript: [], duration_s: 10 }).focus_events).toEqual([]);
    expect(describeFocusEvents([])).toBeNull();
    expect(describeFocusEvents([{ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 }])).toBe('Full screen was not available in this browser.');
  });

  it('tells the interviewer how to handle "move on"', () => {
    expect(interviewerInstruction(plan, 'a/b')).toContain('The candidate asked to move on');
  });
});

describe('one interview per commit', async () => {
  const { oneInterviewPerCommit } = await import('./services/interviews.js');
  const row = (status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error', started = false) => ({
    id: `${status}-${started}`,
    status,
    started_at: started ? '2026-11-17T10:00:00Z' : null,
  });

  it('allows the first interview on a commit', () => {
    expect(oneInterviewPerCommit([])).toEqual({ reuse: null, blocked: null });
  });

  it('returns the same interview when it has not started yet', () => {
    expect(oneInterviewPerCommit([row('preparing')]).reuse?.id).toBe('preparing-false');
    expect(oneInterviewPerCommit([row('ready')]).reuse?.id).toBe('ready-false');
  });

  it('blocks a second one once the first started or finished', () => {
    for (const r of [row('in_progress', true), row('evaluating', true), row('completed', true)])
      expect(oneInterviewPerCommit([r]).blocked?.id).toBe(r.id);
  });

  it('lets a candidate retry after a failure before the interview started', () => {
    expect(oneInterviewPerCommit([row('error')])).toEqual({ reuse: null, blocked: null });
  });

  it('still blocks when the report failed after the interview was taken', () => {
    expect(oneInterviewPerCommit([row('error', true)]).blocked?.id).toBe('error-true');
  });
});

describe('up to 4 concise questions', async () => {
  const { QuestionPlanDraftSchema, clampQuestionText, sanitizeInterviewerTurn } = await import('@skillproof/shared');
  const { alignPlan } = await import('./services/interviews.js');
  const q = (i: number) => ({ id: `x${i}`, kind: 'why' as const, question: `Q${i}?`, path: `src/f${i}.ts`, start_line: 1, end_line: 5, expected_points: ['p'], skill: 's' });
  const hooks = Array.from({ length: 7 }, (_, i) => ({ path: `src/f${i}.ts`, start_line: 1, end_line: 5, why: '', text: 'x' }));

  it('asks the model for 4 questions', () => {
    expect(QuestionPlanDraftSchema.safeParse({ questions: [q(0), q(1), q(2)] }).success).toBe(false);
    expect(QuestionPlanDraftSchema.safeParse({ questions: [q(0), q(1), q(2), q(3)] }).success).toBe(true);
  });

  it('keeps the 4 most revealing when the model writes more', () => {
    const plan = alignPlan({ questions: [0, 1, 2, 3, 4, 5, 6].map(q) }, hooks);
    expect(plan.questions.map((x) => x.question)).toEqual(['Q0?', 'Q1?', 'Q2?', 'Q3?']);
  });

  it('clamps overly long questions and strips leaked reasoning from live turns', () => {
    const longQ =
      'In this module you parse the authentication cookies carefully. When scoping imported storage state for an authenticated context, why do you check cookies strictly against the target host while discarding port or cross-origin state during the verification step?';
    const clamped = clampQuestionText(longQ);
    expect(clamped.length).toBeLessThanOrEqual(140);
    expect(clamped.endsWith('?')).toBe(true);

    const leakedTurn =
      'Welcome to your technical interview for the faultline repository.When scoping imported storage state for an authenticated context, why do you check cookies strictly against the target host while discarding port or cross-origin state? - `current_node_id`: **104**\n  - `next_node_id`: **104** (The flow ends here).\n\n2. **Analyze Output:**\n  - The user has reached node 104.';
    const sanitized = sanitizeInterviewerTurn(leakedTurn);
    expect(sanitized.cut).toBe(true);
    expect(sanitized.text).toBe(
      'Welcome to your technical interview for the faultline repository. When scoping imported storage state for an authenticated context, why do you check cookies strictly against the target host while discarding port or cross-origin state?',
    );
    expect(sanitized.text).not.toContain('current_node_id');
    expect(sanitized.text).not.toContain('Analyze Output');

    // Inline <actions><call:.../></actions> emitted by Gemini Live inside outputTranscription:
    const inlineShow = sanitizeInterviewerTurn(
      'De acuerdo, avancemos a la siguiente cuestión. <actions>\n<call:show_questionquestion_id="q3"/> </actions> ¿Cómo adaptarías el cálculo para permitir interés compuesto con reinversión periódica?',
    );
    expect(inlineShow.questionId).toBe('q3');
    expect(inlineShow.endInterview).toBe(false);
    expect(inlineShow.text).toBe(
      'De acuerdo, avancemos a la siguiente cuestión. ¿Cómo adaptarías el cálculo para permitir interés compuesto con reinversión periódica?',
    );
    expect(inlineShow.text).not.toContain('<actions>');
    expect(inlineShow.text).not.toContain('show_question');

    // Partial mid-stream <actions> tag stays hidden until </actions> arrives:
    const partialStream = sanitizeInterviewerTurn('Está bien, miremos el último punto. <actions>\n<call:show_questionquestion_id="q4"');
    expect(partialStream.text).toBe('Está bien, miremos el último punto.');
    expect(partialStream.cut).toBe(false);

    // Inline <call:end_interview/> triggers interview termination cleanly without leaking tags:
    const inlineEnd = sanitizeInterviewerTurn(
      'Perfecto. Muchas gracias por tu tiempo; el reporte estará listo muy pronto. <actions>\n<call:end_interview/> </actions>',
    );
    expect(inlineEnd.endInterview).toBe(true);
    expect(inlineEnd.text).toBe('Perfecto. Muchas gracias por tu tiempo; el reporte estará listo muy pronto.');
    expect(inlineEnd.text).not.toContain('<call:');
  });

  it('tells the interviewer how long each question gets and how to close when time is up', () => {
    const text = interviewerInstruction({ questions: [0, 1, 2, 3].map(q) }, 'a/b');
    expect(text).toContain('about 45 seconds for each');
    expect(text).toContain('When you receive "Time is up", finish the sentence you are saying');
  });
});
