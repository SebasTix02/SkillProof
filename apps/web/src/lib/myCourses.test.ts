import { describe, expect, it } from 'vitest';
import { nextStep } from '../pages/MyCourses';

describe('what a student sees for each assignment', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const soon = '2026-11-25T12:00:00Z';
  const past = '2026-11-10T12:00:00Z';
  it('asks to submit while it is open, then says it is submitted', () => {
    expect(nextStep({ status: 'open', due_at: soon, my_submission: null }, now).label).toBe('To do');
    expect(nextStep({ status: 'open', due_at: soon, my_submission: { status: 'submitted' } }, now).label).toBe('Submitted');
  });
  it('after the due date: being graded, missed or results ready', () => {
    expect(nextStep({ status: 'judging', due_at: past, my_submission: { status: 'queued' } }, now).label).toBe('Being graded');
    expect(nextStep({ status: 'judging', due_at: past, my_submission: null }, now).label).toBe('Missed');
    expect(nextStep({ status: 'published', due_at: past, my_submission: null }, now).label).toBe('Results ready');
  });
});
