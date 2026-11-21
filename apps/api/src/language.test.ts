import { CreateAssignmentSchema, CreateEventSchema, DEFAULT_RUBRIC, UpdateAssignmentSchema, type QuestionPlan } from '@skillproof/shared';
import { describe, expect, it } from 'vitest';
import { INTERVIEW_SPECS } from './services/interviewSpecs.js';
import { PLAN_SYSTEM, REPORT_SYSTEM, interviewerInstruction, planSystem } from './services/interviews.js';
import { inLanguage, languageNote } from './services/language.js';
import { HACKATHON_SYSTEM, scoringSystem } from './services/scoringSpecs.js';

const q = (i: number) => ({ id: `q${i}`, kind: 'why' as const, question: `Q${i}?`, path: 'src/a.ts', start_line: 1, end_line: 5, expected_points: ['p'], skill: 's' });
const plan: QuestionPlan = { questions: [q(1), q(2), q(3), q(4)] };

describe('English prompts do not change', () => {
  it('the language helpers leave English as it is', () => {
    expect(inLanguage(PLAN_SYSTEM, 'en')).toBe(PLAN_SYSTEM);
    expect(inLanguage(PLAN_SYSTEM, undefined)).toBe(PLAN_SYSTEM);
    expect(languageNote('en', 'x')).toBe('');
    expect(interviewerInstruction(plan, 'a/b', 'hackathon', 'en')).toBe(interviewerInstruction(plan, 'a/b'));
  });
});

describe('Spanish interviews and feedback', () => {
  it('the question plan is written in Spanish, for every spec', () => {
    for (const spec of Object.keys(INTERVIEW_SPECS) as (keyof typeof INTERVIEW_SPECS)[]) {
      const text = inLanguage(planSystem(spec), 'es');
      expect(text).toContain('Write in Spanish');
      expect(text).not.toContain('Write in English');
    }
  });

  it('the interviewer speaks Spanish from the first sentence', () => {
    for (const spec of ['hackathon', 'course', 'course_group'] as const) {
      const text = interviewerInstruction(plan, 'ana/runner', spec, 'es');
      expect(text).toContain('Speak Spanish');
      expect(text).not.toContain('Speak English');
    }
  });

  it('the judge and the report write their texts in Spanish, keeping quotes and paths', () => {
    const judge = scoringSystem('hackathon') + languageNote('es', 'every text you return');
    expect(judge.startsWith(HACKATHON_SYSTEM)).toBe(true);
    expect(judge).toContain('in Spanish');
    expect(REPORT_SYSTEM + languageNote('es', 'the summary')).toContain('quotes from the candidate exactly as they are');
  });

  it('events and assignments carry the language their organizer chose (English by default)', () => {
    const base = { starts_at: '2026-11-21T10:00:00Z', submission_deadline: '2026-11-28T10:00:00Z', visibility: 'public', rubric: DEFAULT_RUBRIC };
    expect(CreateEventSchema.parse({ ...base, name: 'Hack' }).language).toBe('en');
    expect(CreateEventSchema.parse({ ...base, name: 'Hack', language: 'es' }).language).toBe('es');
    expect(CreateEventSchema.safeParse({ ...base, name: 'Hack', language: 'fr' }).success).toBe(false);
    const a = { title: 'Lab 1', opens_at: '2026-11-21T10:00:00Z', due_at: '2026-11-28T10:00:00Z', rubric: DEFAULT_RUBRIC };
    expect(CreateAssignmentSchema.parse({ ...a, language: 'es' }).language).toBe('es');
    expect(UpdateAssignmentSchema.parse({ language: 'es' })).toEqual({ language: 'es' });
  });
});
