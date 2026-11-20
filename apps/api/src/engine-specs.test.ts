import { DEFAULT_RUBRIC, GroupQuestionPlanDraftSchema, type QuestionPlan } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import type { AnalysisRow, HookSnippet } from './engine/analyze.js';
import { ASSIGNMENT_STORE, EVENT_STORE, STORES, scoringSpecFor, storeFor } from './services/contest.js';
import { INTERVIEW_SPECS } from './services/interviewSpecs.js';
import { alignPlan, hooksByAuthor, interviewSpecFor, interviewerInstruction, planPrompt, planSystem } from './services/interviews.js';
import { buildParts } from './services/scoring.js';
import { COURSE_GROUP_SYSTEM, COURSE_INDIVIDUAL_SYSTEM, HACKATHON_SYSTEM, scoringSystem, subjectBlock } from './services/scoringSpecs.js';

const analysis = {
  id: 'an1',
  map_json: { summary: 'A sorting library.', stack: ['TypeScript'], key_decisions: ['Merge sort'], interview_hooks: [] },
  commit_profile_json: { total_commits: 9, authors: ['ana', 'cy'], first_commit_at: null, last_commit_at: null, commits_before_start: null, author_commits: { ana: 6, cy: 3 } },
  hooks_json: [],
} as unknown as AnalysisRow;

const course = { title: 'Lab 3: Sorting', instructions: 'Implement merge sort.', learningGoals: 'Divide and conquer; complexity.' };

describe('one engine, two kinds of contest', () => {
  it('names the tables of events and of course assignments', () => {
    expect(STORES.map((s) => s.kind)).toEqual(['event', 'assignment']);
    expect(storeFor('event')).toBe(EVENT_STORE);
    expect(ASSIGNMENT_STORE).toMatchObject({ contests: 'course_assignments', submissions: 'assignment_submissions', scores: 'assignment_scores', contestFk: 'assignment_id', deadline: 'due_at', job: 'judge-assignment' });
    expect(EVENT_STORE).toMatchObject({ contests: 'events', submissions: 'submissions', job: 'judge' });
  });

  it('grades each kind with its own spec', () => {
    expect(scoringSpecFor('event')).toBe('hackathon');
    expect(scoringSpecFor('assignment', 'individual')).toBe('course_individual');
    expect(scoringSpecFor('assignment', 'group')).toBe('course_group');
    expect(scoringSystem('hackathon')).toBe(HACKATHON_SYSTEM);
  });
});

describe('course grading prompts', () => {
  it('grade against the assignment and its learning goals, with next steps and no ranking', () => {
    expect(COURSE_INDIVIDUAL_SYSTEM).toContain("one student's repository");
    expect(COURSE_INDIVIDUAL_SYSTEM).toContain('never against other students');
    expect(COURSE_INDIVIDUAL_SYSTEM).toContain('next_steps');
    expect(COURSE_INDIVIDUAL_SYSTEM).not.toContain('hackathon');
    expect(COURSE_GROUP_SYSTEM).toContain('This is a group submission');
  });

  it('say who submitted and what was asked, never a team name', () => {
    const text = (
      buildParts(
        { submissionId: 's', organizationId: 'o', rubric: DEFAULT_RUBRIC, analysis, teamName: 'Ana Ruiz', description: '', videoUrl: null, usage: { kind: 'grade' }, spec: 'course_individual', course },
        false,
      )[0] as { text: string }
    ).text;
    expect(text).toContain('Student: Ana Ruiz');
    expect(text).toContain('Implement merge sort.');
    expect(text).toContain('Divide and conquer');
    expect(text).not.toContain('Team:');
  });

  it('list group members with their commits as a signal', () => {
    const block = subjectBlock('course_group', 'Sorters', {
      ...course,
      members: [
        { name: 'Ana', login: 'ana', commits: 6 },
        { name: 'Cy', login: 'cy', commits: 3 },
        { name: 'Ed', login: null, commits: null },
      ],
    });
    expect(block).toContain('Group: Sorters');
    expect(block).toContain('Ana (@ana, 6 commits); Cy (@cy, 3 commits); Ed');
  });
});

describe('course interviews', () => {
  const q = (i: number) => ({ id: `x${i}`, kind: 'why' as const, question: `Q${i}?`, path: `src/f${i}.ts`, start_line: 1, end_line: 5, expected_points: ['p'], skill: 's' });
  const hooks: HookSnippet[] = [0, 1, 2, 3].map((i) => ({ path: `src/f${i}.ts`, start_line: 1, end_line: 5, why: '', text: 'x' }));

  it('pick the spec from what the interview is about', () => {
    expect(interviewSpecFor(null)).toBe('hackathon');
    expect(interviewSpecFor('individual')).toBe('course');
    expect(interviewSpecFor('group')).toBe('course_group');
  });

  it('give a group member a short interview of at most 2 questions', () => {
    expect(INTERVIEW_SPECS.course_group).toMatchObject({ maxQuestions: 2, seconds: 90 });
    expect(INTERVIEW_SPECS.course).toMatchObject({ minQuestions: 4, maxQuestions: 5, seconds: 180 });
    const plan: QuestionPlan = alignPlan({ questions: [0, 1, 2, 3].map(q) }, hooks, INTERVIEW_SPECS.course_group.maxQuestions);
    expect(plan.questions).toHaveLength(2);
    expect(GroupQuestionPlanDraftSchema.safeParse({ questions: [q(0)] }).success).toBe(true);
    const text = interviewerInstruction(plan, 'team/sorter', 'course_group');
    expect(text).toContain('one member of the group');
    expect(text).toContain('about 45 seconds for each');
    expect(planSystem('course_group')).toContain('Write 2 questions');
  });

  it('tell the planner about the assignment, and keep the hackathon prompt as it was', () => {
    expect(planPrompt(analysis, { title: 'Lab 3', learningGoals: 'Recursion' })).toContain('<assignment>\nTitle: Lab 3\nLearning goals: Recursion');
    expect(planPrompt(analysis)).not.toContain('<assignment>');
    expect(interviewerInstruction({ questions: [q(0), q(1), q(2), q(3)] }, 'a/b')).toContain('author of the\nrepository "a/b"');
  });

  it('ask about every snippet when the member has no GitHub login', async () => {
    expect(await hooksByAuthor('o', 'r', 'sha', hooks, null)).toBe(hooks);
  });
});
