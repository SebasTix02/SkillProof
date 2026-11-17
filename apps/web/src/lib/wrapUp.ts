/**
 * How the voice interview ends without cutting anyone off.
 *
 * When the clock reaches 0 the interviewer is not interrupted: the "Time is up" notice is sent only once its current
 * turn is over and its audio has been heard, and once the candidate has been quiet for a moment (or after a cap).
 * The interview finishes once the goodbye has been played. A safety cap ends it anyway if the model never answers.
 * "End" and "Finish" use the same rule with a shorter cap, and send no notice.
 *
 * Pure and driven by `now`, so it can be tested with simulated time; the room calls `step()` a few times a second.
 */

/** Silence from the candidate that counts as the end of their sentence. */
export const CANDIDATE_QUIET_MS = 1_500;
/** Longest wait for the candidate to finish before the notice is sent anyway. */
export const CANDIDATE_MAX_WAIT_MS = 8_000;
/** From the clock reaching 0 to the end, whatever happens. */
export const TIME_UP_CAP_MS = 45_000;
/** From pressing End or Finish to the end, whatever happens. */
export const END_CAP_MS = 10_000;
/** Audio left in the speaker below this counts as played. */
const DRAINED_S = 0.15;

export type WrapPhase = 'running' | 'time_up' | 'closing' | 'ending' | 'done';

export interface WrapAction {
  /** Send "Time is up…" to the interviewer now. */
  sendNotice: boolean;
  /** Stop and send the transcript now. */
  finish: boolean;
}

export class WrapUp {
  phase: WrapPhase = 'running';
  private modelSpeaking = false;
  private lastCandidateAt = Number.NEGATIVE_INFINITY;
  private startedAt = 0;
  private goodbyeHeard = false;

  /** The interviewer started a turn (audio arriving). */
  modelTurnStarted(): void {
    this.modelSpeaking = true;
  }

  /** The interviewer's turn is over (turnComplete or generationComplete). */
  modelTurnEnded(): void {
    this.modelSpeaking = false;
    if (this.phase === 'closing') this.goodbyeHeard = true;
  }

  /** The interviewer called end_interview. */
  endRequestedByModel(now: number): void {
    if (this.phase === 'running') {
      this.phase = 'ending';
      this.startedAt = now;
    }
    this.goodbyeHeard = true;
  }

  candidateSpoke(now: number): void {
    this.lastCandidateAt = now;
  }

  /** The clock reached 0. */
  timeUp(now: number): void {
    if (this.phase !== 'running') return;
    this.phase = 'time_up';
    this.startedAt = now;
  }

  /** "End" or "Finish": let the current sentence finish, then stop. */
  endNow(now: number): void {
    if (this.phase === 'running' || this.phase === 'time_up') {
      this.phase = 'ending';
      this.startedAt = now;
    }
  }

  get wrappingUp(): boolean {
    return this.phase !== 'running' && this.phase !== 'done';
  }

  /** Decides what to do now. `pendingAudioS` is what the speaker still has to play. */
  step(now: number, pendingAudioS: number): WrapAction {
    const idle = !this.modelSpeaking && pendingAudioS < DRAINED_S;
    const elapsed = now - this.startedAt;
    const none = { sendNotice: false, finish: false };

    if (this.phase === 'time_up') {
      if (elapsed >= TIME_UP_CAP_MS) return this.finish();
      const candidateDone = now - this.lastCandidateAt >= CANDIDATE_QUIET_MS || elapsed >= CANDIDATE_MAX_WAIT_MS;
      if (idle && candidateDone) {
        this.phase = 'closing';
        return { sendNotice: true, finish: false };
      }
      return none;
    }
    if (this.phase === 'closing') {
      if (elapsed >= TIME_UP_CAP_MS) return this.finish();
      if (this.goodbyeHeard && idle) return this.finish();
      return none;
    }
    if (this.phase === 'ending') {
      if (elapsed >= END_CAP_MS || idle) return this.finish();
      return none;
    }
    return none;
  }

  private finish(): WrapAction {
    this.phase = 'done';
    return { sendNotice: false, finish: true };
  }
}
