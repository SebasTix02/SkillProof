import { DEFAULT_RUBRIC, type QuestionPlan } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import type { AnalysisRow } from './engine/analyze.js';
import { PLAN_SYSTEM, REPORT_SYSTEM, interviewerInstruction, planPrompt } from './services/interviews.js';
import { SCORE_SYSTEM, buildParts } from './services/scoring.js';

// The prompts that judge hackathons and run their interviews. Courses got their own specs; these must not change.
// The snapshot was written from the code before the shared engine layer existed.

const analysis = {
  id: 'an1',
  map_json: {
    summary: 'A queue-backed job runner.',
    stack: ['TypeScript', 'Postgres'],
    key_decisions: ['Retry with jitter'],
    interview_hooks: [],
  },
  commit_profile_json: { total_commits: 12, authors: ['ana', 'cy'], first_commit_at: '2026-11-01T00:00:00Z', last_commit_at: '2026-11-10T00:00:00Z', commits_before_start: 0 },
  hooks_json: [{ path: 'src/queue.ts', start_line: 1, end_line: 20, why: 'core loop', text: 'export function run() {}' }],
} as unknown as AnalysisRow;

const plan: QuestionPlan = {
  questions: [
    { id: 'q1', kind: 'why', question: 'Why a queue here?', path: 'src/queue.ts', start_line: 1, end_line: 20, expected_points: ['backpressure'], skill: 'Concurrency' },
    { id: 'q2', kind: 'explain', question: 'Walk me through retry.', path: 'src/queue.ts', start_line: 1, end_line: 20, expected_points: ['jitter'], skill: 'Resilience' },
    { id: 'q3', kind: 'failure', question: 'What if Postgres is down?', path: 'src/queue.ts', start_line: 1, end_line: 20, expected_points: ['fallback'], skill: 'Failure modes' },
    { id: 'q4', kind: 'extend', question: 'How would you add priorities?', path: 'src/queue.ts', start_line: 1, end_line: 20, expected_points: ['index'], skill: 'Design' },
  ],
};

describe('hackathon prompts stay exactly as they were', () => {
  it('scoring', async () => {
    const parts = buildParts(
      {
        submissionId: 's1',
        organizationId: 'o1',
        rubric: DEFAULT_RUBRIC,
        analysis,
        teamName: 'Team Rocket',
        description: 'We built a job runner.',
        videoUrl: null,
        usage: { kind: 'judge' },
      },
      false,
    );
    await expect([SCORE_SYSTEM, (parts[0] as { text: string }).text].join('\n\n=====\n\n')).toMatchFileSnapshot('./__snapshots__/hackathon-scoring.txt');
  });

  it('interview', async () => {
    await expect([PLAN_SYSTEM, planPrompt(analysis), REPORT_SYSTEM, interviewerInstruction(plan, 'ana/runner')].join('\n\n=====\n\n')).toMatchFileSnapshot(
      './__snapshots__/hackathon-interview.txt',
    );
  });
});
