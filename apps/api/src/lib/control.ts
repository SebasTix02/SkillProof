import { db } from './supabase.js';

/**
 * Pause and cancel for background AI jobs, done cooperatively: the organizer or candidate changes a state in the
 * database, and the job checks it at checkpoints (before each step and each Gemini call) and stops there.
 * Works the same on one server or on many Vercel invocations, since the database is the only shared place.
 */
export class JobStopped extends Error {
  constructor(public readonly reason: 'paused' | 'canceled') {
    super(reason === 'paused' ? 'The job was paused.' : 'The job was canceled.');
  }
}

export type Checkpoint = () => Promise<void>;

/** Decides what a judging job should do from the submission and event states. Pure, for tests. */
export function judgingDecision(status: string | null, eventPausedAt: string | null): 'continue' | 'paused' | 'canceled' {
  if (status === 'canceled' || status === null) return 'canceled';
  if (status === 'paused' || eventPausedAt) return 'paused';
  return 'continue';
}

/** Checkpoint for judging one submission of an event (default) or of a course assignment. */
export function submissionCheckpoint(submissionId: string, store: { kind: 'event' | 'assignment' } = { kind: 'event' }): Checkpoint {
  return async () => {
    const { data, error } =
      store.kind === 'event'
        ? await db().from('submissions').select('status, contest:events(judging_paused_at)').eq('id', submissionId).maybeSingle()
        : await db().from('assignment_submissions').select('status, contest:course_assignments(judging_paused_at)').eq('id', submissionId).maybeSingle();
    if (error) return; // a failed check never stops the job
    const row = data as { status: string; contest: { judging_paused_at: string | null } | null } | null;
    const decision = judgingDecision(row?.status ?? null, row?.contest?.judging_paused_at ?? null);
    if (decision !== 'continue') throw new JobStopped(decision);
  };
}

/** Decides what an interview job should do. The job may run while the interview is in `expected`. */
export function interviewDecision(status: string | null, expected: 'preparing' | 'evaluating'): 'continue' | 'paused' | 'canceled' {
  if (status === expected) return 'continue';
  if (status === 'report_paused') return 'paused';
  return 'canceled';
}

export function interviewCheckpoint(interviewId: string, expected: 'preparing' | 'evaluating'): Checkpoint {
  return async () => {
    const { data, error } = await db().from('interviews').select('status').eq('id', interviewId).maybeSingle();
    if (error) return;
    const decision = interviewDecision((data as { status: string } | null)?.status ?? null, expected);
    if (decision !== 'continue') throw new JobStopped(decision);
  };
}

/** "Paused by Ana at 14:32 UTC". The actor's display name, or "the organizer" when it has none. */
export async function actorName(userId: string, fallback: string): Promise<string> {
  const { data } = await db().from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return (data as { display_name: string } | null)?.display_name?.trim() || fallback;
}
