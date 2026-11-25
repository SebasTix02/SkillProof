import { MAX_INTERVIEW_PAUSES, MAX_INTERVIEW_PAUSE_MS } from '@skillproof/shared';
import { useState, type FormEvent } from 'react';
import { LiveChat } from '../../components/LiveChat';
import { Button, Input, Spinner, formatClock } from '../../components/shared';
import { tr, trn } from '../../i18n';
import { InterviewCockpitHeader } from './InterviewCockpitHeader';
import { InterviewCodePane } from './InterviewCodePane';
import { InterviewLobby } from './InterviewLobby';
import { clockNow, type InterviewResponse } from './types';
import { useInterviewSession } from './useInterviewSession';

export function InterviewRoom({
  data,
  onChanged,
  onLiveChange,
}: {
  data: InterviewResponse;
  onChanged: () => void;
  onLiveChange: (active: boolean) => void;
}) {
  const { interview, questions } = data;
  const [textAnswer, setTextAnswer] = useState('');
  const {
    phase,
    error,
    left,
    question,
    setQuestion,
    messages,
    bars,
    skipLocked,
    wrapping,
    sessionRef,
    wrap,
    say,
    start,
    finish,
    pause,
    resume,
    nextQuestion,
    confirmEnd,
    exam,
  } = useInterviewSession({ data, onChanged, onLiveChange });

  const {
    stageRef,
    away,
    needsFullscreen,
    paused,
    pauseCount,
    pauseBudgetUsed,
    enterFullscreen,
    returnToFullscreen,
  } = exam;

  function handleTextSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = textAnswer.trim();
    if (!trimmed || phase !== 'live' || paused || wrapping) return;
    setTextAnswer('');
    wrap.current.candidateSpoke(clockNow());
    say('candidate', trimmed);
    try {
      sessionRef.current?.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: trimmed }] }],
        turnComplete: true,
      });
    } catch {
      // socket is closing
    }
  }

  if (phase === 'sending') {
    return (
      <section className="rounded-[6px] border border-line bg-surface p-12 text-center">
        <Spinner label={tr('Saving your interview transcript and dispatching evaluation…')} />
      </section>
    );
  }

  const resuming = interview.status === 'in_progress';
  const activeQuestion = question ?? questions[0] ?? null;
  const activeIdx = activeQuestion ? Math.max(0, questions.findIndex((q) => q.id === activeQuestion.id)) : 0;

  return (
    <section
      id="live-examination-cockpit"
      className="relative overflow-hidden rounded-[6px] border border-line bg-surface"
      onCopy={(e) => phase === 'live' && e.preventDefault()}
      onCut={(e) => phase === 'live' && e.preventDefault()}
      onContextMenu={(e) => phase === 'live' && e.preventDefault()}
    >
      <InterviewCockpitHeader
        data={data}
        phase={phase}
        left={left}
        bars={bars}
        resuming={resuming}
        onEndOrFinish={() => (phase === 'live' ? void confirmEnd() : void finish())}
      />

      {/* The interview stage: the only part that goes full screen (code, conversation, clock and controls). */}
      <div ref={stageRef} id="interview-stage" className="interview-stage relative flex flex-col bg-surface">
        {(phase === 'live' || phase === 'connecting') && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-accent-soft px-4 py-2">
            <div className="font-mono-code flex items-center gap-3 text-[12px]">
              <span className="font-bold text-accent uppercase">
                {tr('Question {n} of {total}', { n: activeIdx + 1, total: Math.max(1, questions.length) })}
              </span>
              <span className="font-bold text-ink" aria-label={tr('Time left')}>
                {formatClock(left)}
              </span>
              {paused && (
                <span className="rounded-[3px] bg-warn px-2 py-0.5 text-[10px] font-bold text-on-warn uppercase">
                  {tr('Paused')}
                </span>
              )}
              {wrapping && (
                <span className="rounded-[3px] bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                  {wrapping === 'time'
                    ? tr('Time is up. The interviewer is wrapping up…')
                    : tr('Ending: the interviewer is finishing what it is saying…')}
                </span>
              )}
            </div>
            {phase === 'live' && !wrapping && (
              <div className="flex flex-wrap gap-2">
                {paused ? (
                  <Button onClick={resume} className="py-1.5 text-[12px]">
                    {tr('Resume')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={pause}
                    disabled={pauseCount >= MAX_INTERVIEW_PAUSES || pauseBudgetUsed}
                    className="py-1.5 text-[12px]"
                    title={tr('Up to {n} pauses, {m} minutes in total', {
                      n: MAX_INTERVIEW_PAUSES,
                      m: MAX_INTERVIEW_PAUSE_MS / 60_000,
                    })}
                  >
                    {tr('Pause (')}{MAX_INTERVIEW_PAUSES - pauseCount}{' '}{tr('left)')}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={nextQuestion}
                  disabled={skipLocked || paused}
                  className="py-1.5 text-[12px]"
                >
                  {activeIdx >= questions.length - 1 ? tr('Finish') : skipLocked ? tr('Moving on…') : tr('Next question →')}
                </Button>
                <Button variant="danger" onClick={() => void confirmEnd()} className="py-1.5 text-[12px]">
                  {tr('End')}
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === 'live' && (away || paused || needsFullscreen) && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(20,22,26,0.92)] p-6"
            role="alertdialog"
            aria-label={
              paused ? tr('Interview paused') : away ? tr('You left the interview') : tr('Open the interview in full screen')
            }
          >
            <div className="max-w-md space-y-3 rounded-[6px] border border-line bg-surface p-6 text-center">
              {!paused && !away ? (
                <>
                  <h3 className="font-serif-heading text-[20px] font-medium text-ink">
                    {tr('Open the interview in full screen')}
                  </h3>
                  <p className="text-[13px] text-muted">
                    {tr('Your browser did not open full screen on its own. Press the button to continue; this is not recorded as leaving.')}
                  </p>
                  <Button onClick={() => void enterFullscreen()} className="w-full">
                    <span className="material-symbols-outlined text-[17px]">fullscreen</span>
                    <span>{tr('Enter full screen')}</span>
                  </Button>
                </>
              ) : paused ? (
                <>
                  <h3 className="font-serif-heading text-[20px] font-medium text-ink">{tr('Interview paused')}</h3>
                  <p className="text-[13px] text-muted">
                    {tr(
                      'The microphone, the interviewer and the clock are stopped, and the question is hidden. The pause is recorded. It ends on its own when your {minutes} minutes of pause run out.',
                      { minutes: MAX_INTERVIEW_PAUSE_MS / 60_000 },
                    )}
                  </p>
                  <Button onClick={resume} className="w-full">
                    {tr('Resume the interview')}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="font-serif-heading text-[20px] font-medium text-ink">{tr('You left the interview')}</h3>
                  <p className="text-[13px] text-muted">
                    {tr('The question is hidden until you come back. Leaving full screen, switching tabs or windows is recorded with its time and shown to the reviewers as a signal. The interview keeps running.')}
                  </p>
                  <Button onClick={() => void returnToFullscreen()} className="w-full">
                    <span className="material-symbols-outlined text-[17px]">fullscreen</span>
                    <span>{tr('Return to full screen')}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="interview-stage-body grid min-h-[460px] flex-1 grid-cols-1 lg:grid-cols-12">
          <InterviewCodePane
            interview={interview}
            questions={questions}
            activeQuestion={activeQuestion}
            onSelectQuestion={setQuestion}
            phase={phase}
            away={away}
            paused={paused}
          />

          {/* Right Pane: Pre-Flight Briefing OR Live Examiner Dialogue (5 cols) */}
          <div className="flex min-h-0 flex-col justify-between space-y-5 bg-surface p-6 lg:col-span-5">
            {phase === 'idle' ? (
              <InterviewLobby
                data={data}
                resuming={resuming}
                error={error}
                onStart={() => void start()}
                onFinish={() => void finish()}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col space-y-4">
                <div className="flex items-center justify-between border-b border-line pb-2">
                  <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
                    {tr('QUESTION {n} OF {total} • ORAL DEFENSE', {
                      n: activeIdx + 1,
                      total: Math.max(1, questions.length),
                    })}
                  </span>
                  <span className="font-mono-code rounded-[3px] border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                    {phase === 'connecting' ? tr('CONNECTING…') : tr('LIVE AUDIO')}
                  </span>
                </div>

                {phase === 'connecting' && (
                  <div className="py-3">
                    <Spinner label={tr('Connecting to the Gemini Live examiner…')} />
                  </div>
                )}

                <div className="space-y-2 rounded-[4px] border border-accent/30 bg-accent-soft p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-mono-code flex items-center gap-1.5 text-[11px] font-bold text-accent uppercase">
                      <span className="status-dot-live bg-accent text-accent" />
                      <span>{tr('AI Technical Examiner')}</span>
                    </div>
                    <span className="font-mono-code rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                      {tr('Gemini Live Audio')}
                    </span>
                  </div>
                  <h2
                    className={`font-serif-heading text-[18px] leading-[25px] font-medium break-words whitespace-pre-wrap text-ink ${
                      away || paused || needsFullscreen ? 'blur-sm select-none' : ''
                    }`}
                  >
                    {activeQuestion
                      ? `“${activeQuestion.question}”`
                      : tr('The interviewer is about to ask the first question. The code it refers to will appear on the left.')}
                  </h2>
                </div>

                <div className="flex min-h-0 flex-1 flex-col space-y-2">
                  <div className="font-mono-code flex items-center justify-between text-[11px] text-muted">
                    <span className="font-semibold text-ink uppercase">{tr('Conversation')}</span>
                    <span>
                      {trn('{count} message', '{count} messages', messages.filter((m) => m.role !== 'system').length)}
                    </span>
                  </div>
                  <LiveChat messages={messages} questions={questions} className="interview-chat h-[40vh]" />
                  {phase === 'live' && !paused && !wrapping && (
                    <form onSubmit={handleTextSubmit} className="flex items-center gap-2 pt-1">
                      <Input
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        aria-label={tr('Type your answer instead of speaking')}
                        placeholder={tr('Noisy room or prefer typing? Type your answer and press Enter…')}
                        className="min-w-0 flex-1 py-1.5 text-[13px]"
                      />
                      <Button
                        type="submit"
                        variant="secondary"
                        disabled={!textAnswer.trim()}
                        className="shrink-0 py-1.5 text-[12px]"
                      >
                        {tr('Send')}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line pt-3">
              <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
                <span className="material-symbols-outlined text-[15px]">timer</span>
                <span>
                  {phase === 'live'
                    ? tr('Remaining: {time}', { time: formatClock(left) })
                    : tr('Clock starts on microphone grant')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
