import { describe, expect, it } from 'vitest';
import { CANDIDATE_MAX_WAIT_MS, END_CAP_MS, TIME_UP_CAP_MS, WrapUp } from './wrapUp';

describe('ending the interview without cutting anyone off', () => {
  it('waits for the interviewer to finish its sentence before sending "Time is up"', () => {
    const w = new WrapUp();
    w.modelTurnStarted();
    w.timeUp(0);
    expect(w.step(1_000, 2)).toEqual({ sendNotice: false, finish: false }); // still talking
    w.modelTurnEnded();
    expect(w.step(2_000, 1.2)).toEqual({ sendNotice: false, finish: false }); // its audio is still playing
    expect(w.step(3_300, 0)).toEqual({ sendNotice: true, finish: false });
  });

  it('lets the candidate finish a sentence, up to a cap', () => {
    const w = new WrapUp();
    w.timeUp(0);
    w.candidateSpoke(500);
    expect(w.step(1_000, 0).sendNotice).toBe(false); // spoke 0.5 s ago
    expect(w.step(2_100, 0).sendNotice).toBe(true); // quiet for 1.6 s

    const talker = new WrapUp();
    talker.timeUp(0);
    for (let t = 0; t < CANDIDATE_MAX_WAIT_MS; t += 500) {
      talker.candidateSpoke(t);
      expect(talker.step(t, 0).sendNotice).toBe(false);
    }
    talker.candidateSpoke(CANDIDATE_MAX_WAIT_MS);
    expect(talker.step(CANDIDATE_MAX_WAIT_MS, 0).sendNotice).toBe(true);
  });

  it('finishes once the goodbye has been played', () => {
    const w = new WrapUp();
    w.timeUp(0);
    expect(w.step(2_000, 0).sendNotice).toBe(true);
    w.modelTurnStarted();
    expect(w.step(4_000, 3).finish).toBe(false);
    w.endRequestedByModel(5_000);
    w.modelTurnEnded();
    expect(w.step(6_000, 1).finish).toBe(false); // goodbye audio still playing
    expect(w.step(7_100, 0).finish).toBe(true);
  });

  it('ends anyway if the model never answers', () => {
    const w = new WrapUp();
    w.modelTurnStarted();
    w.timeUp(0);
    expect(w.step(TIME_UP_CAP_MS - 1, 5).finish).toBe(false);
    expect(w.step(TIME_UP_CAP_MS, 5).finish).toBe(true);
  });

  it('"End" lets the current sentence finish, with a short cap', () => {
    const w = new WrapUp();
    w.modelTurnStarted();
    w.endNow(0);
    expect(w.step(1_000, 2)).toEqual({ sendNotice: false, finish: false });
    w.modelTurnEnded();
    expect(w.step(2_000, 0)).toEqual({ sendNotice: false, finish: true });

    const stuck = new WrapUp();
    stuck.modelTurnStarted();
    stuck.endNow(0);
    expect(stuck.step(END_CAP_MS, 4).finish).toBe(true);
  });

  it('does nothing while the interview is running', () => {
    const w = new WrapUp();
    expect(w.step(100_000, 0)).toEqual({ sendNotice: false, finish: false });
    expect(w.wrappingUp).toBe(false);
  });
});
