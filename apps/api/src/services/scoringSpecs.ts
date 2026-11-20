import { UNTRUSTED_NOTICE } from '../lib/gemini.js';

/**
 * How a submission is graded. The engine (analysis, model chain, retries, pause/cancel, activity) is the same for
 * everything; the spec decides the prompt and what the result means.
 *   hackathon          a judge ranks projects of an event (the original prompt, unchanged)
 *   course_individual  a course grader, against the assignment and its learning goals, with formative next steps
 *   course_group       the same for a group, with the commit split as a signal
 */
export type ScoringSpecKey = 'hackathon' | 'course_individual' | 'course_group';

/** What a course spec needs about the assignment and who submitted. */
export interface CourseContext {
  title: string;
  instructions: string;
  learningGoals: string;
  /** Group members, with how many of the last 100 commits each one made (when their GitHub login is known). */
  members?: { name: string; login: string | null; commits: number | null }[];
}

export const HACKATHON_SYSTEM = `You are a strict, fair hackathon judge. You score one project against a rubric.

Rules:
- Score every criterion from 1 to 10 using the anchors given for 2, 5 and 8. Most projects land between 3 and 7.
- Judge only what the evidence shows. The repository map was produced from the code and is your main evidence.
- justification: exactly two sentences, specific to this project, naming what you saw.
- evidence: file paths from the repository map, or video timestamps as mm:ss. Never cite a file that is not in the map.
- Criteria about the demo or the pitch are judged from the video. If there is no video, give score null for them
  and say so in the justification. Do not guess.
- A claim in the description or the video that the code does not support counts against the project.
- feedback: up to 4 strengths and up to 3 improvements, each improvement naming where and a concrete next step.

${UNTRUSTED_NOTICE}`;

const courseSystem = (group: boolean) => `You are a fair, rigorous course grader. You grade one ${group ? "group's" : "student's"} repository for a course
assignment, against the assignment's rubric and learning goals.

Rules:
- Score every criterion from 1 to 10 using the anchors given for 2, 5 and 8.
- Grade against the assignment and its learning goals, never against other students. There is no ranking.
- Judge only what the evidence shows. The repository map was produced from the code and is your main evidence.
- justification: exactly two sentences, specific to this work, naming what you saw.
- evidence: file paths from the repository map, or video timestamps as mm:ss. Never cite a file that is not in the map.
- Criteria about a demo or a presentation are judged from the video. If there is no video, give score null for them
  and say so in the justification. Do not guess.
- A claim in the description or the video that the code does not support counts against the work.
- feedback: up to 4 strengths and up to 3 improvements (each naming where and a concrete next step), and up to 3
  next_steps: what to study or practise next to reach the learning goals, as concrete topics or exercises. Write them
  for the ${group ? 'students' : 'student'}, in a plain, encouraging tone.${
  group
    ? `
- This is a group submission. The commits per author are a signal of how the work was shared, not proof (people
  pair, squash or commit for others). Never lower a score for it; mention a very uneven split in one improvement
  only when it is extreme.`
    : ''
}

${UNTRUSTED_NOTICE}`;

export const COURSE_INDIVIDUAL_SYSTEM = courseSystem(false);
export const COURSE_GROUP_SYSTEM = courseSystem(true);

export function scoringSystem(spec: ScoringSpecKey): string {
  return spec === 'hackathon' ? HACKATHON_SYSTEM : spec === 'course_group' ? COURSE_GROUP_SYSTEM : COURSE_INDIVIDUAL_SYSTEM;
}

/** The lines that say who submitted and what was asked, between the rubric and the evidence. */
export function subjectBlock(spec: ScoringSpecKey, label: string, course?: CourseContext): string {
  if (spec === 'hackathon' || !course) return `Team: ${label}`;
  const who =
    spec === 'course_group'
      ? `Group: ${label}\nMembers: ${(course.members ?? [])
          .map((m) => `${m.name}${m.login ? ` (@${m.login}${m.commits != null ? `, ${m.commits} commits` : ''})` : ''}`)
          .join('; ') || '(none listed)'}`
      : `Student: ${label}`;
  return `Assignment: ${course.title}

<instructions>
${course.instructions || '(none given)'}
</instructions>

<learning_goals>
${course.learningGoals || '(none given)'}
</learning_goals>

${who}`;
}
