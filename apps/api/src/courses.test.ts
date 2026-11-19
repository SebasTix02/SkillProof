import { CreateAssignmentSchema, CreateEventSchema, DEFAULT_RUBRIC } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { asAssignment } from './routes/courses.js';

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

describe('course assignments are not events', () => {
  it('are created with their own schema: no visibility, access code or course id to forge', () => {
    const input = CreateAssignmentSchema.parse({
      title: 'Lab 3',
      opens_at: iso(now),
      due_at: iso(now + 86_400_000),
      rubric: DEFAULT_RUBRIC,
      visibility: 'public',
      access_code: 'abcd',
    });
    expect(input).not.toHaveProperty('visibility');
    expect(input).not.toHaveProperty('access_code');
    expect(input.publish).toBe(true);
    expect(CreateAssignmentSchema.safeParse({ title: 'Lab 3', opens_at: iso(now), due_at: iso(now - 1000), rubric: DEFAULT_RUBRIC }).success).toBe(false);
  });

  it('cannot be created through the events endpoint any more', () => {
    const event = CreateEventSchema.parse({
      name: 'Hack',
      starts_at: iso(now),
      submission_deadline: iso(now + 86_400_000),
      visibility: 'public',
      rubric: DEFAULT_RUBRIC,
      kind: 'assignment',
      course_id: '40000000-0000-0000-0000-000000000001',
    });
    expect(event).not.toHaveProperty('course_id');
    expect(event).not.toHaveProperty('kind');
  });

  it('are shown with assignment names, not event ones', () => {
    const a = asAssignment(
      {
        id: 'a1',
        name: 'Lab 3',
        slug: 'lab-3-abc',
        description: 'Sort things',
        status: 'open',
        starts_at: '2026-11-20T10:00:00Z',
        submission_deadline: '2026-11-27T10:00:00Z',
        interviews_enabled: true,
        max_submissions: null,
      },
      { submissions: 3, students: 20 },
    );
    expect(a).toEqual({
      id: 'a1',
      title: 'Lab 3',
      slug: 'lab-3-abc',
      instructions: 'Sort things',
      status: 'open',
      opens_at: '2026-11-20T10:00:00Z',
      due_at: '2026-11-27T10:00:00Z',
      interviews_enabled: true,
      max_submissions: null,
      submission_count: 3,
      student_count: 20,
    });
  });
});
