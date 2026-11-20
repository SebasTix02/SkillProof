import { describe, expect, it } from 'vitest';
import { groupSizeLabel, nextStep } from './courses';

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
    expect(nextStep({ status: 'published', due_at: past, my_submission: { status: 'scored' } }, now).label).toBe('Results ready');
    expect(nextStep({ status: 'published', due_at: past, my_submission: null }, now).label).toBe('Missed');
  });
});

describe('group sizes in words', () => {
  it('names individual work, pairs, fixed and ranged groups', () => {
    expect(groupSizeLabel({ mode: 'individual', group_min: null, group_max: null })).toBe('Individual');
    expect(groupSizeLabel({ mode: 'group', group_min: 2, group_max: 2 })).toBe('Pairs');
    expect(groupSizeLabel({ mode: 'group', group_min: 3, group_max: 3 })).toBe('Groups of 3');
    expect(groupSizeLabel({ mode: 'group', group_min: 2, group_max: 4 })).toBe('Groups of 2–4');
  });
});
