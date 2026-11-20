import { AssignmentSubmitSchema, CreateAssignmentSchema, CreateEventSchema, CreateInterviewSchema, DEFAULT_RUBRIC, IntegrityDecisionSchema, UpdateAssignmentSchema } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { JUDGING_ROUTES } from './routes/controls.js';
import { gradeFor, publicAssignment, rpcFailed, type AssignmentRow } from './routes/courses.js';

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const base = { title: 'Lab 3', opens_at: iso(now), due_at: iso(now + 86_400_000), rubric: DEFAULT_RUBRIC };

describe('course assignments are their own product', () => {
  it('are created with their own schema: no visibility, access code or course id to forge', () => {
    const input = CreateAssignmentSchema.parse({ ...base, visibility: 'public', access_code: 'abcd', course_id: 'x' });
    expect(input).not.toHaveProperty('visibility');
    expect(input).not.toHaveProperty('access_code');
    expect(input).not.toHaveProperty('course_id');
    expect(input.publish).toBe(true);
    expect(CreateAssignmentSchema.safeParse({ ...base, due_at: iso(now - 1000) }).success).toBe(false);
  });

  it('cannot be created through the events endpoint', () => {
    const event = CreateEventSchema.parse({
      name: 'Hack', starts_at: iso(now), submission_deadline: iso(now + 86_400_000), visibility: 'public', rubric: DEFAULT_RUBRIC,
      kind: 'assignment', course_id: '40000000-0000-0000-0000-000000000001',
    });
    expect(event).not.toHaveProperty('course_id');
    expect(event).not.toHaveProperty('kind');
  });

  it('are individual by default, without group sizes', () => {
    const a = CreateAssignmentSchema.parse({ ...base, group_min: 3, group_max: 5, group_lock_at: iso(now + 1000) });
    expect(a).toMatchObject({ mode: 'individual', group_min: null, group_max: null, group_lock_at: null });
  });

  it('group assignments default to groups of 2 to 4, and the sizes must make sense', () => {
    expect(CreateAssignmentSchema.parse({ ...base, mode: 'group' })).toMatchObject({ group_min: 2, group_max: 4 });
    expect(CreateAssignmentSchema.parse({ ...base, mode: 'group', group_min: 5 })).toMatchObject({ group_min: 5, group_max: 5 });
    expect(CreateAssignmentSchema.safeParse({ ...base, mode: 'group', group_min: 4, group_max: 2 }).success).toBe(false);
    expect(CreateAssignmentSchema.safeParse({ ...base, mode: 'group', group_lock_at: iso(now + 2 * 86_400_000) }).success).toBe(false);
  });

  it('can be edited partly, keeping the dates in order', () => {
    expect(UpdateAssignmentSchema.parse({ title: 'Lab 3b' })).toEqual({ title: 'Lab 3b' });
    expect(UpdateAssignmentSchema.safeParse({ opens_at: iso(now), due_at: iso(now - 1) }).success).toBe(false);
    expect(UpdateAssignmentSchema.parse({ mode: 'group' })).not.toHaveProperty('mode');
  });

  it('a submission asks for no team name', () => {
    const s = AssignmentSubmitSchema.parse({ repo_url: 'https://github.com/ana/sorter', team_name: 'Ana' });
    expect(s).not.toHaveProperty('team_name');
    expect(AssignmentSubmitSchema.safeParse({ repo_url: 'https://gitlab.com/ana/sorter' }).success).toBe(false);
  });
});

describe('assignments as the client sees them', () => {
  const row: AssignmentRow = {
    id: 'a1', organization_id: 'o1', course_id: 'c1', title: 'Team project', instructions: 'Build it', learning_goals: 'Teamwork',
    opens_at: '2026-11-20T10:00:00Z', due_at: '2026-11-27T10:00:00Z', status: 'open', mode: 'group', group_min: 2, group_max: 3,
    group_lock_at: null, max_submissions: null, interviews_enabled: true, rubric_json: DEFAULT_RUBRIC, judging_paused_at: null,
    closed_at: null, published_at: null, created_at: '2026-11-19T10:00:00Z',
  };

  it('say when groups close: the due date unless the teacher set another moment', () => {
    expect(publicAssignment(row, { submissions: 2, students: 9 })).toMatchObject({ groups_close_at: row.due_at, submission_count: 2, student_count: 9 });
    expect(publicAssignment({ ...row, group_lock_at: '2026-11-24T10:00:00Z' }).groups_close_at).toBe('2026-11-24T10:00:00Z');
    expect(publicAssignment({ ...row, mode: 'individual', group_min: null, group_max: null }).groups_close_at).toBeNull();
  });

  it('never carry the organization or who created them', () => {
    const view = publicAssignment(row);
    expect(view).not.toHaveProperty('organization_id');
    expect(view).not.toHaveProperty('created_at');
  });
});

describe('grades and errors', () => {
  it('give each group member the group total unless staff adjusted theirs', () => {
    expect(gradeFor(7.5, undefined)).toBe(7.5);
    expect(gradeFor(7.5, { adjusted_total: 6 })).toBe(6);
    expect(gradeFor(null, undefined)).toBeNull();
  });

  it('turn the database refusals into readable messages and statuses', () => {
    expect(rpcFailed('group_full')).toMatchObject({ status: 409, code: 'group_full', message: 'This group is already full.' });
    expect(rpcFailed('not_on_roster')).toMatchObject({ status: 403 });
    expect(rpcFailed('assignment_not_found')).toMatchObject({ status: 404 });
    expect(rpcFailed('group_too_small')).toMatchObject({ status: 409, code: 'group_too_small' });
    expect(rpcFailed('something else').status).toBe(500);
  });
});

describe('the shared engines take course targets', () => {
  it('interviews: a repository, an event submission or an assignment submission, one at a time', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(CreateInterviewSchema.safeParse({ assignment_submission_id: id }).success).toBe(true);
    expect(CreateInterviewSchema.safeParse({ assignment_submission_id: id, submission_id: id }).success).toBe(false);
  });

  it('integrity decisions cover assignment pairs and submissions', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(IntegrityDecisionSchema.safeParse({ assignment_flag_id: id, verdict: 'collusion' }).success).toBe(true);
    expect(IntegrityDecisionSchema.safeParse({ assignment_submission_id: id, verdict: 'clear' }).success).toBe(true);
    expect(IntegrityDecisionSchema.safeParse({ assignment_submission_id: id, verdict: 'collusion' }).success).toBe(false);
  });

  it('judging controls exist for both, with the course permission for assignments', () => {
    expect(JUDGING_ROUTES.map((r) => [r.submissionPath, r.contestPath, r.permission])).toEqual([
      ['/api/submissions', '/api/events', 'event.manage'],
      ['/api/assignment-submissions', '/api/assignments', 'course.manage'],
    ]);
  });
});
