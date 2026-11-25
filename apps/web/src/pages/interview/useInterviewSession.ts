import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import {
  MAX_INTERVIEW_PAUSE_MS,
  sanitizeInterviewerTurn,
  type PublicQuestion,
  type TranscriptEntry,
} from '@skillproof/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../components/shared';
import { tr } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { MIC_MIME, Speaker, startMic } from '../../lib/liveAudio';
import { WrapUp } from '../../lib/wrapUp';
import { BAR_HEIGHTS, clockNow, type InterviewResponse, type LiveToken, type RoomPhase } from './types';
import { useExamMode } from './useExamMode';

export function useInterviewSession({
  data,
  onChanged,
  onLiveChange,
}: {
  data: InterviewResponse;
  onChanged: () => void;
  onLiveChange: (active: boolean) => void;
}) {
  const { interview, questions } = data;
  const confirm = useConfirm();
  const [phase, setPhase] = useState<RoomPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(data.seconds);
  const [question, setQuestion] = useState<PublicQuestion | null>(questions[0] ?? null);
  // The whole conversation so far, shown as a chat. A copy of `transcript`, updated as it grows.
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [liveBars, setLiveBars] = useState<number[]>(BAR_HEIGHTS);
  const bars = phase === 'live' ? liveBars : BAR_HEIGHTS;
  const [skipLocked, setSkipLocked] = useState(false);

  const transcript = useRef<TranscriptEntry[]>([]);
  const questionId = useRef<string | null>(questions[0]?.id ?? null);
  const sessionRef = useRef<Session | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const turnCutRef = useRef(false);
  const turnEndedRef = useRef(false);
  // Raw streaming buffer for the current interviewer turn so split `<actions><call:.../></actions>` chunks reassemble cleanly.
  const rawTurnRef = useRef('');
  // Ending without cutting anyone off: see lib/wrapUp.ts.
  const wrap = useRef(new WrapUp());
  const [wrapping, setWrapping] = useState<'time' | 'end' | null>(null);
  // After "Time is up" is sent, the candidate's microphone is no longer sent.
  const micClosed = useRef(false);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  const exam = useExamMode({ phase, startedAt });
  const { focusEvents, pausedRef, endAway, endPause, pausedSoFar, beginPause, requestInitialFullscreen, syncFullscreenOnLiveStart } = exam;

  useEffect(() => {
    onLiveChange(phase === 'connecting' || phase === 'live');
  }, [phase, onLiveChange]);

  useEffect(() => {
    if (phase !== 'live') return;
    const timer = setInterval(() => {
      setLiveBars((prev) => prev.map((_, i) => 18 + ((clockNow() / 90 + i * 29) % 78)));
    }, 280);
    return () => clearInterval(timer);
  }, [phase]);

  const teardown = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  const applyQuestionById = useCallback(
    (id: string) => {
      const found = questions.find((q) => q.id === id) ?? null;
      if (!found) return null;
      questionId.current = found.id;
      setQuestion(found);
      return found;
    },
    [questions],
  );

  const say = useCallback(
    (role: TranscriptEntry['role'], text: string) => {
      if (!text) return;
      if (role === 'candidate') {
        turnCutRef.current = false;
        turnEndedRef.current = false;
        rawTurnRef.current = '';
      }
      if (role === 'interviewer' && turnCutRef.current) return;
      const list = transcript.current;
      const last = list[list.length - 1];

      if (role === 'interviewer') {
        // Start a fresh bubble when a new model turn begins after an already-completed question turn.
        const startFreshBubble = turnEndedRef.current && rawTurnRef.current.includes('?');
        turnEndedRef.current = false;
        if (startFreshBubble) rawTurnRef.current = '';

        const needsSpace = /[.!?]$/.test(rawTurnRef.current) && /^[^\s]/.test(text);
        rawTurnRef.current += (needsSpace ? ' ' : '') + text;
        const cleaned = sanitizeInterviewerTurn(rawTurnRef.current);

        if (cleaned.questionId) {
          applyQuestionById(cleaned.questionId);
        }
        if (cleaned.endInterview) {
          micClosed.current = true;
          wrap.current.endRequestedByModel(clockNow());
          setWrapping((w) => w ?? 'end');
        }
        if (cleaned.cut) {
          turnCutRef.current = true;
          speakerRef.current?.flush();
        }
        if (!cleaned.text) return;

        if (last && last.role === 'interviewer' && !startFreshBubble) {
          last.text = cleaned.text;
          if (cleaned.questionId) last.question_id = questionId.current;
        } else {
          list.push({ role: 'interviewer', text: cleaned.text, at_ms: clockNow() - startedAt.current, question_id: questionId.current });
        }
        setMessages([...list]);
        return;
      }

      if (last && last.role === role) {
        const needsSpace = /[.!?]$/.test(last.text) && /^[^\s]/.test(text);
        last.text += (needsSpace ? ' ' : '') + text;
      } else {
        list.push({ role, text, at_ms: clockNow() - startedAt.current, question_id: questionId.current });
      }
      setMessages([...list]);
    },
    [applyQuestionById],
  );

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    endAway();
    teardown();
    endPause();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setPhase('sending');
    const entries = transcript.current
      .map((t) => ({ ...t, text: t.text.trim().slice(0, 8000) }))
      .filter((t) => t.text)
      .slice(0, 400);
    const duration = startedAt.current ? Math.round((clockNow() - startedAt.current) / 1000) : 0;
    try {
      await api(`/api/interviews/${interview.id}/finish`, {
        body: { transcript: entries, duration_s: duration, focus_events: focusEvents.current.slice(0, 200) },
      });
      onChanged();
    } catch (err) {
      finished.current = false;
      setError(errorMessage(err));
      setPhase('idle');
    }
  }, [interview.id, onChanged, teardown, endAway, endPause, focusEvents]);

  /** "Next question": advances deterministically on the client, tells the interviewer to move on, or ends on the last question. */
  const nextQuestion = useCallback(() => {
    if (skipLocked) return;
    const current = questionId.current ?? questions[0]?.id ?? null;
    const idx = Math.max(0, questions.findIndex((q) => q.id === current));
    const isLast = idx >= questions.length - 1;
    speakerRef.current?.flush();
    wrap.current.modelTurnEnded();
    turnCutRef.current = false;
    rawTurnRef.current = '';
    transcript.current.push({
      role: 'system',
      text: `The candidate asked to move on from question ${current ?? 'unknown'}.`,
      at_ms: clockNow() - startedAt.current,
      question_id: current,
    });
    setMessages([...transcript.current]);
    if (isLast) {
      micClosed.current = true;
      wrap.current.endNow(clockNow());
      setWrapping((w) => w ?? 'end');
      void finish();
      return;
    }
    const nextQ = questions[idx + 1] ?? null;
    if (nextQ) {
      questionId.current = nextQ.id;
      setQuestion(nextQ);
    }
    setSkipLocked(true);
    setTimeout(() => setSkipLocked(false), 1200);
    try {
      sessionRef.current?.sendRealtimeInput({
        text: nextQ
          ? `The candidate asked to move on. Briefly acknowledge and ask question ${nextQ.id} now.`
          : 'The candidate asked to move on and there are no more questions. Thank them in one sentence and call end_interview.',
      });
    } catch {
      // socket is closing
    }
  }, [finish, questions, skipLocked]);

  const pause = useCallback(() => {
    if (!beginPause(wrap.current.wrappingUp)) return;
    speakerRef.current?.flush();
    try {
      sessionRef.current?.sendRealtimeInput({
        text: "The candidate paused the interview. Say nothing and wait until you receive 'The candidate is back'.",
      });
    } catch {
      // socket is closing
    }
  }, [beginPause]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    endPause();
    try {
      sessionRef.current?.sendRealtimeInput({
        text: 'The candidate is back. Continue the interview where you left off.',
      });
    } catch {
      // socket is closing
    }
  }, [endPause, pausedRef]);

  const confirmEnd = useCallback(async () => {
    const ok = await confirm({
      title: tr('End the interview now?'),
      body: tr('Your report is written from what you said so far, and you cannot take another interview on this commit.'),
      confirmLabel: tr('End interview'),
      undoable: false,
    });
    if (!ok) return;
    // The interviewer finishes the sentence it is saying, then the interview ends.
    wrap.current.endNow(clockNow());
    setWrapping((w) => w ?? 'end');
  }, [confirm]);

  const start = useCallback(async () => {
    setError(null);
    // Must happen inside the click, before anything is awaited, or the browser refuses it.
    requestInitialFullscreen();
    setPhase('connecting');
    turnCutRef.current = false;
    rawTurnRef.current = '';
    let stream: MediaStream | null = null;
    let session: Session | null = null;
    let stopMic: (() => void) | null = null;
    const speaker = new Speaker();
    speakerRef.current = speaker;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let closedByUs = false;

    const dispose = () => {
      closedByUs = true;
      timers.forEach(clearTimeout);
      stopMic?.();
      stream?.getTracks().forEach((t) => t.stop());
      speaker.close();
      try {
        session?.close();
      } catch {
        // already closed
      }
    };
    cleanup.current = dispose;

    const onMessage = (msg: LiveServerMessage) => {
      const content = msg.serverContent;
      if (content?.interrupted) {
        turnCutRef.current = false;
        rawTurnRef.current = '';
        wrap.current.modelTurnEnded();
        speaker.flush();
      }
      for (const part of content?.modelTurn?.parts ?? []) {
        if (part.thought) continue;
        if (part.inlineData?.data && !turnCutRef.current) {
          wrap.current.modelTurnStarted();
          if (!pausedRef.current) speaker.play(part.inlineData.data);
        }
      }
      if (content?.turnComplete || content?.generationComplete) {
        turnCutRef.current = false;
        turnEndedRef.current = true;
        wrap.current.modelTurnEnded();
      }
      if (content?.inputTranscription?.text) {
        turnCutRef.current = false;
        rawTurnRef.current = '';
        wrap.current.candidateSpoke(clockNow());
        say('candidate', content.inputTranscription.text);
      }
      if (content?.outputTranscription?.text) say('interviewer', content.outputTranscription.text);

      const calls = msg.toolCall?.functionCalls ?? [];
      if (calls.length === 0) return;
      let ended = false;
      for (const call of calls) {
        if (call.name === 'show_question') {
          turnCutRef.current = false;
          const id = String((call.args as { question_id?: unknown } | undefined)?.question_id ?? '');
          applyQuestionById(id);
        }
        if (call.name === 'end_interview') ended = true;
      }
      session?.sendToolResponse({
        functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { ok: true } })),
      });
      // The goodbye is played to the end before the interview finishes (see the wrap-up loop).
      if (ended) {
        wrap.current.endRequestedByModel(clockNow());
        setWrapping((w) => w ?? 'end');
      }
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      await speaker.resume();
      const live = await api<LiveToken>(`/api/interviews/${interview.id}/token`, { method: 'POST' });
      const ai = new GoogleGenAI({ apiKey: live.token, httpOptions: { apiVersion: live.api_version } });
      session = await ai.live.connect({
        model: live.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: onMessage,
          onerror: () => undefined,
          onclose: () => {
            if (closedByUs || finished.current) return;
            if (clockNow() - startedAt.current > 30_000) void finish();
            else {
              dispose();
              setError(tr('The connection to the interviewer was lost. Reconnect to continue.'));
              setPhase('idle');
            }
          },
        },
      });
      const open = session;
      sessionRef.current = session;
      stopMic = await startMic(stream, (audioData) => {
        // While paused the microphone sends nothing.
        if (pausedRef.current || micClosed.current) return;
        try {
          open.sendRealtimeInput({ audio: { data: audioData, mimeType: MIC_MIME } });
        } catch {
          // socket is closing
        }
      });
      if (!startedAt.current) startedAt.current = clockNow();
      syncFullscreenOnLiveStart();
      setPhase('live');
      open.sendRealtimeInput({ text: 'Begin the interview.' });

      const total = live.seconds;
      const tick = () => {
        if (finished.current) return;
        const now = clockNow();
        if (pausedRef.current && pausedSoFar() >= MAX_INTERVIEW_PAUSE_MS) resume();
        const remaining = total - Math.floor((now - startedAt.current - pausedSoFar()) / 1000);
        setLeft(Math.max(0, remaining));
        if (remaining <= 0 && !pausedRef.current && wrap.current.phase === 'running') {
          wrap.current.timeUp(now);
          setWrapping('time');
        }
        // Closing time does not count on the clock; what is said is still in the transcript.
        const action = wrap.current.step(now, speaker.pending());
        if (action.sendNotice) {
          micClosed.current = true;
          turnCutRef.current = false;
          turnEndedRef.current = true;
          rawTurnRef.current = '';
          try {
            open.sendRealtimeInput({
              text: 'Time is up. Thank the candidate in one or two sentences and call end_interview.',
            });
          } catch {
            // socket is closing
          }
        }
        if (action.finish) {
          void finish();
          return;
        }
        timers.push(setTimeout(tick, 250));
      };
      tick();
    } catch (err) {
      dispose();
      cleanup.current = null;
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError');
      setError(
        denied
          ? tr('SkillProof needs your microphone for the interview. Allow it in your browser and try again.')
          : errorMessage(err),
      );
      setPhase('idle');
    }
  }, [
    applyQuestionById,
    finish,
    interview.id,
    pausedRef,
    pausedSoFar,
    requestInitialFullscreen,
    resume,
    say,
    syncFullscreenOnLiveStart,
  ]);

  return {
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
  };
}
