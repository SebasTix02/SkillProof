import { MAX_INTERVIEW_PAUSES, MAX_INTERVIEW_PAUSE_MS } from '@skillproof/shared';
import { Button, Notice } from '../../components/shared';
import { tr, trn } from '../../i18n';
import { rich } from '../../i18n/rich';
import type { InterviewResponse } from './types';

export function InterviewLobby({
  data,
  resuming,
  error,
  onStart,
  onFinish,
}: {
  data: InterviewResponse;
  resuming: boolean;
  error: string | null;
  onStart: () => void;
  onFinish: () => void;
}) {
  const { interview, questions } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
          {resuming ? tr('SESSION RECOVERY // IN PROGRESS') : tr('STAGE 02 // MICROPHONE & CONSENT BRIEFING')}
        </span>
        <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink">
          {Math.round(data.seconds / 60)}{' '}{tr('MIN LIMIT')}
        </span>
      </div>

      <h2 className="font-serif-heading text-[22px] leading-[28px] font-medium text-ink">
        {resuming ? tr('This interview is in progress') : tr('Before you start your oral defense')}
      </h2>

      {resuming ? (
        <p className="text-[13px] leading-[21px] text-muted">
          {tr('If you lost the connection you can reconnect while the interview time lasts. Otherwise end the session now to generate your ownership report from the transcript recorded so far.')}
        </p>
      ) : (
        <ul className="space-y-2.5 text-[13px] leading-[20px] text-muted">
          <li className="flex items-start gap-2">
            <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">01</span>
            <span>
              {rich(
                tr('Lasts {minutes} with {questions} about your own repository (4 or 5, depending on how much each needs). If the clock runs out, the interviewer finishes its sentence and closes.'),
                {
                  minutes: <strong>{trn('{count} minute', '{count} minutes', Math.round(data.seconds / 60))}</strong>,
                  questions: <strong>{trn('{count} question', '{count} questions', questions.length)}</strong>,
                },
              )}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">02</span>
            <span>
              {tr('You speak naturally; the AI examiner listens and asks follow-ups. Use headphones in a quiet room if possible.')}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">03</span>
            <span>
              {tr('Raw audio is not stored. The written transcript is recorded and evaluated against your repository.')}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">04</span>
            <span>
              {rich(
                tr(
                  'The interview room (code and conversation) opens in {fullScreen}. Leaving it, switching tabs or windows is not blocked, but each time is recorded and shown to reviewers. You can pause up to {pauses} times ({minutes} minutes in total) and use “Next question” to move on.',
                  { pauses: MAX_INTERVIEW_PAUSES, minutes: MAX_INTERVIEW_PAUSE_MS / 60_000 },
                ),
                { fullScreen: <strong>{tr('full screen')}</strong> },
              )}
            </span>
          </li>
          {(interview.submission_id || interview.assignment) && (
            <li className="flex items-start gap-2">
              <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">05</span>
              <span>
                {interview.assignment ? tr('Your instructors') : tr('The event organizer')}{' '}
                {tr('can inspect the transcript and ownership report.')}
              </span>
            </li>
          )}
        </ul>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={onStart} className="w-full py-2.5 sm:w-auto">
          <span className="material-symbols-outlined text-[17px]">mic</span>
          <span>{resuming ? tr('Reconnect to Live Room') : tr('Allow Microphone & Start Interview')}</span>
          <span className="arrow-nudge font-mono-code text-[12px]">→</span>
        </Button>
        {resuming && (
          <Button variant="secondary" onClick={onFinish} className="w-full sm:w-auto">
            {tr('End and get my report')}
          </Button>
        )}
      </div>
    </div>
  );
}
