import {
  GROUP_INTERVIEW_SECONDS, GROUP_MAX_QUESTIONS, GroupQuestionPlanDraftSchema, INTERVIEW_SECONDS, MAX_QUESTIONS, MIN_QUESTIONS,
  QuestionPlanDraftSchema,
} from '@skillproof/shared';
import { UNTRUSTED_NOTICE } from '../lib/gemini.js';

/**
 * How a voice interview is planned and run. The engine (analysis, question plan, live token, report) is shared;
 * the spec decides the prompts, the length and the number of questions.
 *   hackathon     personal interviews and event submissions (the original prompts, unchanged)
 *   course        an individual course assignment: does the student understand the concepts of the assignment
 *   course_group  a member of a group assignment: a short interview (max 2 questions) about the code they wrote
 */
export type InterviewSpecKey = 'hackathon' | 'course' | 'course_group';

export interface InterviewSpec {
  key: InterviewSpecKey;
  seconds: number;
  minQuestions: number;
  maxQuestions: number;
  draftSchema: typeof QuestionPlanDraftSchema | typeof GroupQuestionPlanDraftSchema;
}

export const INTERVIEW_SPECS: Record<InterviewSpecKey, InterviewSpec> = {
  hackathon: { key: 'hackathon', seconds: INTERVIEW_SECONDS, minQuestions: MIN_QUESTIONS, maxQuestions: MAX_QUESTIONS, draftSchema: QuestionPlanDraftSchema },
  course: { key: 'course', seconds: INTERVIEW_SECONDS, minQuestions: MIN_QUESTIONS, maxQuestions: MAX_QUESTIONS, draftSchema: QuestionPlanDraftSchema },
  course_group: { key: 'course_group', seconds: GROUP_INTERVIEW_SECONDS, minQuestions: 1, maxQuestions: GROUP_MAX_QUESTIONS, draftSchema: GroupQuestionPlanDraftSchema },
};

/** What the plan prompt is told about the assignment, for course specs. */
export interface CourseInterviewContext {
  title: string;
  learningGoals: string;
}

const COMMON_RULES = `- Mix the kinds: "why" (why this choice over an alternative), "explain" (walk through what this code does),
  "extend" (how would you add or change something here), "failure" (what happens when this goes wrong).
- Questions are spoken aloud: one or two short sentences, no code, no line numbers. Refer to the code by what it does.
- A question must be impossible to answer well from the README alone.
- expected_points: 2 to 4 concrete points a real author would mention. They are the answer key.
- skill: the specific skill the question verifies.
- Write in English.

${UNTRUSTED_NOTICE}`;

export const COURSE_PLAN_SYSTEM = `You prepare a ${INTERVIEW_SECONDS / 60}-minute spoken interview about a student's own repository for a course
assignment. The goal is to check that the student wrote this code and understands the concepts the assignment teaches.

Rules:
- Write 4 or 5 questions, each about exactly one of the snippets you are given; use its path and line range unchanged.
  A question gets 35 to 45 seconds. Prefer the snippets where the assignment's learning goals show up.
  Order them from most to least revealing: if time runs out, the last one is dropped.
${COMMON_RULES}`;

export const COURSE_GROUP_PLAN_SYSTEM = `You prepare a short spoken interview (about ${GROUP_INTERVIEW_SECONDS} seconds) with one member of a group that
built a repository for a course assignment. The snippets you are given are from files this student committed to.
The goal is to check that this student understands the part they built.

Rules:
- Write ${GROUP_MAX_QUESTIONS} questions (1 if only one snippet is worth asking about), each about exactly one of the
  snippets; use its path and line range unchanged. Order them from most to least revealing.
${COMMON_RULES}`;

/** The assignment lines added to the plan prompt for course specs. */
export function courseBlock(course: CourseInterviewContext | undefined): string {
  if (!course) return '';
  return `\n\n<assignment>
Title: ${course.title}
Learning goals: ${course.learningGoals || '(none given)'}
</assignment>`;
}

/** The interviewer's opening, by spec. The hackathon text is the original one. */
export function interviewerOpening(spec: InterviewSpecKey, repoName: string, seconds: number): string {
  if (spec === 'course_group')
    return `You are a friendly, sharp technical interviewer for SkillProof. You are speaking with one member of the group that
built the repository "${repoName}" for a course assignment. The questions are about the part this student built.
The interview lasts about ${seconds} seconds. Speak English.`;
  if (spec === 'course')
    return `You are a friendly, sharp technical interviewer for SkillProof. You are speaking with the student who wrote the
repository "${repoName}" for a course assignment. The interview lasts ${seconds / 60} minutes. Speak English.`;
  return `You are a friendly, sharp technical interviewer for SkillProof. You are speaking with the author of the
repository "${repoName}". The interview lasts ${seconds / 60} minutes. Speak English.`;
}
