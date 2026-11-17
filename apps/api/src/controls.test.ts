import { describeFocusEvents } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { JobStopped, interviewDecision, judgingDecision } from './lib/control.js';
import { oneInterviewPerCommit } from './services/interviews.js';

describe('judging checkpoints', () => {
  it('keeps going while the submission is being judged and the event is not paused', () => {
    expect(judgingDecision('analyzing', null)).toBe('continue');
  });

  it('stops at the next checkpoint when the submission or the whole event is paused', () => {
    expect(judgingDecision('paused', null)).toBe('paused');
    expect(judgingDecision('analyzing', '2026-11-17T14:32:00Z')).toBe('paused');
  });

  it('stops for good when it was canceled or the row is gone', () => {
    expect(judgingDecision('canceled', null)).toBe('canceled');
    expect(judgingDecision(null, null)).toBe('canceled');
  });

  it('carries the reason, so the job records paused or canceled', () => {
    expect(new JobStopped('paused').reason).toBe('paused');
  });
});

describe('interview checkpoints', () => {
  it('lets a preparation run only while preparing', () => {
    expect(interviewDecision('preparing', 'preparing')).toBe('continue');
    expect(interviewDecision('canceled', 'preparing')).toBe('canceled');
  });

  it('pauses or cancels the report', () => {
    expect(interviewDecision('evaluating', 'evaluating')).toBe('continue');
    expect(interviewDecision('report_paused', 'evaluating')).toBe('paused');
    expect(interviewDecision('report_canceled', 'evaluating')).toBe('canceled');
  });
});

describe('controls and the one-interview-per-commit rule', () => {
  const row = (status: 'canceled' | 'report_canceled' | 'report_paused', started: boolean) => ({
    id: status,
    status: status as never,
    started_at: started ? '2026-11-17T10:00:00Z' : null,
  });

  it('a canceled preparation does not use up the attempt', () => {
    expect(oneInterviewPerCommit([row('canceled', false)])).toEqual({ reuse: null, blocked: null });
  });

  it('a canceled or paused report still counts: the candidate saw the questions', () => {
    expect(oneInterviewPerCommit([row('report_canceled', true)]).blocked?.id).toBe('report_canceled');
    expect(oneInterviewPerCommit([row('report_paused', true)]).blocked?.id).toBe('report_paused');
  });

  it('reports room pauses apart from leaving the window', () => {
    expect(
      describeFocusEvents([
        { type: 'paused', at_ms: 30_000, duration_ms: 40_000 },
        { type: 'paused', at_ms: 90_000, duration_ms: 20_000 },
        { type: 'tab_hidden', at_ms: 120_000, duration_ms: 3_000 },
      ]),
    ).toBe('Left the interview window 1 time (total 3 s). Paused 2 times (total 60 s).');
  });
});
