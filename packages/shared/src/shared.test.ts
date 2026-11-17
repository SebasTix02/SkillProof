import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CreateEventSchema, DEFAULT_RUBRIC, RepoMapSchema, RubricSchema, SubmitSchema, parseGithubUrl,
  MODELS, modelChain, pruneUnknownPaths, submissionsLeft, weightedTotal, type RepoMap,
} from './index.js';

describe('rubric', () => {
  it('default rubric is valid and weights add to 100', () => {
    expect(RubricSchema.parse(DEFAULT_RUBRIC)).toHaveLength(7);
    expect(DEFAULT_RUBRIC.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
  it('weightedTotal prefers overrides and skips unscored criteria', () => {
    const rubric = DEFAULT_RUBRIC.slice(0, 2); // 20 + 20
    expect(weightedTotal(rubric, [
      { criterion_key: 'innovation', ai_score: 4, override_score: 8 },
      { criterion_key: 'technical_depth', ai_score: 6, override_score: null },
    ])).toBe(70);
    expect(weightedTotal(rubric, [{ criterion_key: 'innovation', ai_score: 5, override_score: null }])).toBe(50);
    expect(weightedTotal(rubric, [])).toBeNull();
  });
});

describe('github urls', () => {
  it('parses repo urls', () => {
    expect(parseGithubUrl('https://github.com/SebasTix02/SkillProof')).toEqual({ owner: 'SebasTix02', name: 'SkillProof' });
    expect(parseGithubUrl('https://github.com/a/b.git')).toEqual({ owner: 'a', name: 'b' });
    expect(parseGithubUrl('https://github.com/a/b/')).toEqual({ owner: 'a', name: 'b' });
  });
  it('rejects anything else', () => {
    for (const u of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/a', 'https://github.com/a/b/tree/main', 'https://github.com.evil.io/a/b'])
      expect(parseGithubUrl(u)).toBeNull();
  });
});

describe('events', () => {
  const base = {
    name: 'Echo Hack', starts_at: '2026-11-20T10:00:00Z', submission_deadline: '2026-11-21T10:00:00Z',
    visibility: 'public' as const, rubric: DEFAULT_RUBRIC,
  };
  it('accepts a public event and defaults to unlimited submissions', () => {
    expect(CreateEventSchema.parse(base).max_submissions).toBeNull();
  });
  it('requires a code for code visibility and a deadline after the start', () => {
    expect(CreateEventSchema.safeParse({ ...base, visibility: 'code' }).success).toBe(false);
    expect(CreateEventSchema.safeParse({ ...base, visibility: 'code', access_code: 'echo2026' }).success).toBe(true);
    expect(CreateEventSchema.safeParse({ ...base, submission_deadline: base.starts_at }).success).toBe(false);
  });
  it('submissionsLeft', () => {
    expect(submissionsLeft(null, 50)).toBeNull();
    expect(submissionsLeft(3, 1)).toBe(2);
    expect(submissionsLeft(3, 5)).toBe(0);
  });
  it('validates submissions', () => {
    expect(SubmitSchema.safeParse({ team_name: 'T', repo_url: 'https://github.com/a/b', video_url: 'https://youtu.be/dQw4w9WgXcQ' }).success).toBe(true);
    expect(SubmitSchema.safeParse({ team_name: 'T', repo_url: 'https://github.com/a/b', video_url: 'https://vimeo.com/1' }).success).toBe(false);
  });
});

describe('repo map', () => {
  const map: RepoMap = {
    summary: 's', stack: { languages: [], frameworks: [], services: [] },
    components: [{ name: 'api', responsibility: 'r', paths: ['src/a.ts', 'ghost.ts'] }, { name: 'x', responsibility: 'r', paths: ['nope.ts'] }],
    key_decisions: [], weaknesses: [{ issue: 'i', severity: 'low', paths: ['nope.ts'] }],
    complexity_signals: { has_tests: false, has_ci: false, error_handling: 'none', notes: '' },
    interview_hooks: [{ path: 'src/a.ts', start_line: 1, end_line: 5, why: 'w' }, { path: 'nope.ts', start_line: 1, end_line: 2, why: 'w' }],
  };
  it('prunes citations of files that do not exist', () => {
    const out = pruneUnknownPaths(map, new Set(['src/a.ts']));
    expect(out.components).toEqual([{ name: 'api', responsibility: 'r', paths: ['src/a.ts'] }]);
    expect(out.weaknesses[0]?.paths).toEqual([]);
    expect(out.interview_hooks).toHaveLength(1);
  });
  it('converts to JSON schema for Gemini', () => {
    const js = z.toJSONSchema(RepoMapSchema) as { type: string; required: string[] };
    expect(js.type).toBe('object');
    expect(js.required).toContain('interview_hooks');
  });
});

describe('model fallbacks', () => {
  it('tries the main model first, then its backups, never twice', () => {
    const chain = modelChain(MODELS.analysis);
    expect(chain[0]).toBe(MODELS.analysis);
    expect(chain.length).toBeGreaterThan(1);
    expect(new Set(chain).size).toBe(chain.length);
    expect(modelChain('unknown-model')).toEqual(['unknown-model']);
  });
});

describe('organization, review and course schemas', async () => {
  const { InviteMemberSchema, IntegrityDecisionSchema, JudgeReviewSchema, CourseMembersSchema } = await import('./org.js');
  const id = '00000000-0000-4000-8000-000000000001';

  it('invites only to organization roles, with a lowercased email', () => {
    expect(InviteMemberSchema.parse({ email: 'Ana@Echo.dev', role: 'judge' }).email).toBe('ana@echo.dev');
    expect(InviteMemberSchema.safeParse({ email: 'a@b.co', role: 'platform_admin' }).success).toBe(false);
    expect(InviteMemberSchema.safeParse({ email: 'a@b.co', role: 'student' }).success).toBe(false);
  });

  it('keeps pair verdicts on flags and submission verdicts on submissions', () => {
    expect(IntegrityDecisionSchema.safeParse({ flag_id: id, verdict: 'collusion' }).success).toBe(true);
    expect(IntegrityDecisionSchema.safeParse({ submission_id: id, verdict: 'live_defense' }).success).toBe(true);
    expect(IntegrityDecisionSchema.safeParse({ flag_id: id, verdict: 'live_defense' }).success).toBe(false);
    expect(IntegrityDecisionSchema.safeParse({ submission_id: id, verdict: 'collusion' }).success).toBe(false);
  });

  it('bounds judge scores to the 1-10 scale', () => {
    expect(JudgeReviewSchema.safeParse({ scores: [{ criterion_key: 'demo', score: 11 }] }).success).toBe(false);
    expect(JudgeReviewSchema.parse({ scores: [{ criterion_key: 'demo', score: 7 }] })).toMatchObject({ status: 'draft', note: '' });
  });

  it('enrols students by default', () => {
    expect(CourseMembersSchema.parse({ emails: ['s@uni.edu'] }).role).toBe('student');
  });
});
