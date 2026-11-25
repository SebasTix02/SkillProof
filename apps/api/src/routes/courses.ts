import type { FastifyInstance } from 'fastify';
import { groupRoutes } from './courses/groupRoutes.js';
import { staffAssignmentRoutes } from './courses/staffAssignmentRoutes.js';
import { staffCourseRoutes } from './courses/staffCourseRoutes.js';
import { studentRoutes } from './courses/studentRoutes.js';

/**
 * Courses and their assignments (20261120000001), apart from events.
 *   Staff (organization members; writes need course.manage): courses, roster, assignments, groups, console, grading.
 *   Students (on the roster): their courses and assignments, their group and invitations, their submission and results.
 * Every group and submission rule is enforced by the database functions; submodules map their errors to messages.
 */

export type { AssignmentRow, CourseRow, GroupView, InterviewSummary, ScoreRow, SubmissionRow } from './courses/types.js';
export { assignmentBoard, getAssignment, gradeFor, lowestOwnership, publicAssignment, rpcFailed } from './courses/shared.js';

export async function courseRoutes(app: FastifyInstance): Promise<void> {
  await staffCourseRoutes(app);
  await staffAssignmentRoutes(app);
  await groupRoutes(app);
  await studentRoutes(app);
}
