import { tr, trn } from '../i18n';
import { rich } from '../i18n/rich';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import { MAX_INTERVIEW_PAUSES, MAX_INTERVIEW_PAUSE_MS, sanitizeInterviewerTurn, type ActivityEntry, type FocusEvent as ExamFocusEvent, type PublicQuestion, type TranscriptEntry } from '@skillproof/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../components/AiActivity';
import { LiveChat } from '../components/LiveChat';
import { AnswerKey, type AnswerCoverage, type AnswerKeyQuestion } from '../components/AnswerKey';
import { PrintMasthead } from '../components/PrintMasthead';
import { Report, type ReportView } from '../components/Report';
import {
  Button,
  CopyLinkButton,
  DossierPageHeader,
  LiveDot,
  Notice,
  PageState,
  ScoreBar,
  Spinner,
  WaveformVisualizer,
  formatClock,
  formatDate,
  linkButtonSecondary,
  useConfirm,
  questionToOptions,
} from '../components/shared';
import { api, errorMessage } from '../lib/api';
import { useToast } from '../components/toast';
import { useAuth } from '../lib/auth';
import { MIC_MIME, Speaker, startMic } from '../lib/liveAudio';
import { useLoad } from '../lib/useLoad';
import { WrapUp } from '../lib/wrapUp';

const SPECTROGRAM_ASSET = '/images/interview-spectrogram.svg';

const BAR_HEIGHTS = [35, 50, 70, 85, 60, 40, 65, 90, 100, 75, 55, 30, 60, 45, 25, 18];
const clockNow = () => Date.now();

interface InterviewResponse {
  interview: {
    id: string;
    status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error' | 'canceled' | 'report_paused' | 'report_canceled';
    error: string | null;
    submission_id: string | null;
    /** Set when the interview is about a course assignment submission. */
    assignment?: { id: string; course_id: string; title: string } | null;
    created_at?: string;
    duration_s?: number | null;
    repo: { owner: string; name: string; url: string };
    commit_sha: string | null;
    summary: string | null;
    is_owner: boolean;
    models_used?: string[];
    primary_models?: string[];
  };
  activity?: ActivityEntry[];
  seconds: number;
  questions: PublicQuestion[];
  transcript: TranscriptEntry[] | null;
  report: (ReportView & { answers_json?: AnswerCoverage[] }) | null;
  /** Only once completed. */
  answer_key?: AnswerKeyQuestion[] | null;
  focus_summary?: string | null;
  focus_events?: ExamFocusEvent[];
}

/**
 * The exam-mode signal in the interface language (the API's focus_summary is English: it is written for the
 * evaluator's prompt). Same rules as describeFocusEvents in packages/shared.
 */
function focusSummary(events: ExamFocusEvent[]): string | null {
  const away = events.filter((e) => e.type !== 'fullscreen_unsupported' && e.type !== 'paused');
  const pauses = events.filter((e) => e.type === 'paused');
  const seconds = (list: ExamFocusEvent[]) => Math.round(list.reduce((n, e) => n + e.duration_ms, 0) / 1000);
  const parts: string[] = [];
  if (away.length)
    parts.push(trn('Left the interview window {count} time (total {seconds} s).', 'Left the interview window {count} times (total {seconds} s).', away.length, { seconds: seconds(away) }));
  if (pauses.length) parts.push(trn('Paused {count} time (total {seconds} s).', 'Paused {count} times (total {seconds} s).', pauses.length, { seconds: seconds(pauses) }));
  if (events.some((e) => e.type === 'fullscreen_unsupported')) parts.push(tr('Full screen was not available in this browser.'));
  return parts.length ? parts.join(' ') : null;
}

interface LiveToken {
  token: string;
  model: string;
  api_version: string;
  seconds: number;
}



function StageController({
  status,
  liveActive,
}: {
  status: InterviewResponse['interview']['status'];
  liveActive: boolean;
}) {
  const activeStage =
    status === 'preparing'
      ? 1
      : status === 'ready' && !liveActive
        ? 2
        : status === 'in_progress' || liveActive
          ? 3
          : status === 'evaluating'
            ? 4
            : status === 'completed'
              ? 5
              : 1;

  const stages = [
    { num: 1, label: tr('01. AST Parse') },
    { num: 2, label: tr('02. Mic & Consent') },
    { num: 3, label: tr('03. Live Oral Interview') },
    { num: 4, label: tr('04. Synthesis Engine') },
    { num: 5, label: tr('05. Verified Credential Dossier') },
  ];

  return (
    <section className="rounded-[6px] border border-line bg-surface p-4 sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="font-mono-code flex flex-wrap items-center gap-2 text-[11px]">
          {stages.map((st, idx) => {
            const isCurrent = st.num === activeStage;
            const isDone = st.num < activeStage || status === 'completed';
            const isEmerald = st.num === 5 && status === 'completed';
            return (
              <div key={st.num} className="flex items-center gap-2">
                {idx > 0 && <span className="text-line">→</span>}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1 transition-colors ${
                    isEmerald
                      ? 'border border-good/30 bg-good-soft font-semibold text-good-ink'
                      : isCurrent
                        ? 'border border-accent/25 bg-accent-soft font-semibold text-accent-ink'
                        : isDone
                          ? 'text-good-ink font-medium'
                          : 'text-faint'
                  }`}
                >
                  {isCurrent && (
                    <span
                      className={`status-dot-live ${
                        isEmerald ? 'bg-good text-good' : 'bg-accent text-accent'
                      }`}
                    />
                  )}
                  {!isCurrent && isDone && <span className="h-1.5 w-1.5 rounded-full bg-good" />}
                  <span>{st.label}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="font-mono-code flex items-center gap-2 rounded-[4px] border border-line bg-paper p-1 text-[11px]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 font-semibold ${
              status !== 'completed' ? 'border border-line bg-surface text-accent' : 'text-muted'
            }`}
          >
            {status !== 'completed' && <span className="h-1.5 w-1.5 rounded-full bg-bad" />}
            <span>{tr('Live Examination Cockpit')}</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 font-semibold ${
              status === 'completed' ? 'border border-good/30 bg-good-soft text-good-ink' : 'text-muted'
            }`}
          >
            <span className="material-symbols-outlined text-[14px] text-good">verified</span>
            <span>{tr('Verified Dossier')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}

function Room({
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
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'live' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(data.seconds);
  const [question, setQuestion] = useState<PublicQuestion | null>(questions[0] ?? null);
  // The whole conversation so far, shown as a chat. A copy of `transcript`, updated as it grows.
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [liveBars, setLiveBars] = useState<number[]>(BAR_HEIGHTS);
  const bars = phase === 'live' ? liveBars : BAR_HEIGHTS;

  const transcript = useRef<TranscriptEntry[]>([]);
  const questionId = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  // Exam mode: times the candidate left full screen, the tab or the window. A signal for reviewers, not a verdict.
  const focusEvents = useRef<ExamFocusEvent[]>([]);
  const awaySince = useRef<{ type: ExamFocusEvent['type']; at: number } | null>(null);
  const [away, setAway] = useState<ExamFocusEvent['type'] | null>(null);
  // The browser did not open full screen on Start (or closed it while connecting, as Firefox does for the
  // microphone prompt): ask for it once the room is live. Not recorded as leaving, since the candidate never left.
  const [needsFullscreen, setNeedsFullscreen] = useState(false);
  const [skipLocked, setSkipLocked] = useState(false);
  // Pause: microphone and audio stop, the clock stops, the question and code are hidden.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pauseStart = useRef(0);
  const pausedMs = useRef(0);
  const [pauseCount, setPauseCount] = useState(0);
  const [pauseBudgetUsed, setPauseBudgetUsed] = useState(false);
  const speakerRef = useRef<Speaker | null>(null);
  // Only the interview itself goes full screen: the code, the chat, the clock and the controls.
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Ending without cutting anyone off: see lib/wrapUp.ts.
  const wrap = useRef(new WrapUp());
  const [wrapping, setWrapping] = useState<'time' | 'end' | null>(null);
  // After "Time is up" is sent, the candidate's microphone is no longer sent.
  const micClosed = useRef(false);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

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

  const endAway = useCallback(() => {
    const open = awaySince.current;
    if (!open) return;
    awaySince.current = null;
    focusEvents.current.push({
      type: open.type,
      at_ms: Math.max(0, open.at - startedAt.current),
      duration_ms: Math.max(0, clockNow() - open.at),
    });
    setAway(null);
  }, []);

  const endPause = useCallback(() => {
    if (!pausedRef.current) return;
    const duration = clockNow() - pauseStart.current;
    pausedMs.current += duration;
    pausedRef.current = false;
    setPaused(false);
    setPauseBudgetUsed(pausedMs.current >= MAX_INTERVIEW_PAUSE_MS);
    focusEvents.current.push({ type: 'paused', at_ms: Math.max(0, pauseStart.current - startedAt.current), duration_ms: duration });
  }, []);

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
  }, [interview.id, onChanged, teardown, endAway, endPause]);

  // Exam mode watchers: leaving full screen, hiding the tab, or moving to another window.
  useEffect(() => {
    if (phase !== 'live') return;
    const leave = (type: ExamFocusEvent['type']) => {
      if (awaySince.current) return;
      awaySince.current = { type, at: Date.now() };
      setAway(type);
    };
    const onFullscreen = () => {
      if (document.fullscreenElement === stageRef.current) setNeedsFullscreen(false);
      if (document.fullscreenElement !== stageRef.current) leave('fullscreen_exit');
      else if (awaySince.current?.type === 'fullscreen_exit') endAway();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave('tab_hidden');
      else if (awaySince.current?.type === 'tab_hidden' && (document.fullscreenElement || !document.fullscreenEnabled)) endAway();
    };
    const onBlur = () => leave('window_blur');
    const onFocus = () => {
      if (awaySince.current?.type === 'window_blur') endAway();
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    if (document.fullscreenEnabled && document.fullscreenElement !== stageRef.current) setNeedsFullscreen(true);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, endAway]);

  async function enterFullscreen() {
    try {
      if (stageRef.current && document.fullscreenElement !== stageRef.current) await stageRef.current.requestFullscreen();
    } catch {
      // Refused even after a click (an embedded or locked-down browser): carry on, and the report says so.
      if (!focusEvents.current.some((e) => e.type === 'fullscreen_unsupported')) focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
    }
    setNeedsFullscreen(false);
  }

  async function returnToFullscreen() {
    try {
      if (document.fullscreenEnabled && stageRef.current && document.fullscreenElement !== stageRef.current) await stageRef.current.requestFullscreen();
    } catch {
      // the browser refused; the overlay stays until the window is back
    }
    if (document.visibilityState === 'visible' && document.hasFocus()) endAway();
  }

  /** "Next question": tells the interviewer to move on, and marks the skip in the transcript for the evaluation. */
  function nextQuestion() {
    if (skipLocked) return;
    const current = questionId.current ?? questions[0]?.id ?? null;
    const idx = questions.findIndex((q) => q.id === current);
    const isLast = idx >= questions.length - 1;
    transcript.current.push({
      role: 'system',
      text: `The candidate asked to move on from question ${current ?? 'unknown'}.`,
      at_ms: Date.now() - startedAt.current,
      question_id: current,
    });
    setMessages([...transcript.current]);
    if (isLast) {
      wrap.current.endNow(Date.now());
      setWrapping((w) => w ?? 'end');
      return;
    }
    setSkipLocked(true);
    setTimeout(() => setSkipLocked(false), 5000);
    try {
      sessionRef.current?.sendRealtimeInput({
        text: 'The candidate asked to move on. Briefly acknowledge and call show_question with the next question, then ask it.',
      });
    } catch {
      // socket is closing
    }
  }

  /** Time paused so far, including a pause in progress. */
  const pausedSoFar = () => pausedMs.current + (pausedRef.current ? Date.now() - pauseStart.current : 0);

  function pause() {
    if (pausedRef.current || wrap.current.wrappingUp || pauseCount >= MAX_INTERVIEW_PAUSES || pausedMs.current >= MAX_INTERVIEW_PAUSE_MS) return;
    pausedRef.current = true;
    pauseStart.current = Date.now();
    setPaused(true);
    setPauseCount((n) => n + 1);
    speakerRef.current?.flush();
    try {
      sessionRef.current?.sendRealtimeInput({
        text: "The candidate paused the interview. Say nothing and wait until you receive 'The candidate is back'.",
      });
    } catch {
      // socket is closing
    }
  }

  function resume() {
    if (!pausedRef.current) return;
    endPause();
    try {
      sessionRef.current?.sendRealtimeInput({ text: 'The candidate is back. Continue the interview where you left off.' });
    } catch {
      // socket is closing
    }
  }

  async function confirmEnd() {
    const ok = await confirm({
      title: tr('End the interview now?'),
      body: tr('Your report is written from what you said so far, and you cannot take another interview on this commit.'),
      confirmLabel: tr('End interview'),
      undoable: false,
    });
    if (!ok) return;
    // The interviewer finishes the sentence it is saying, then the interview ends.
    wrap.current.endNow(Date.now());
    setWrapping((w) => w ?? 'end');
  }

  async function start() {
    setError(null);
    // Must happen inside the click, before anything is awaited, or the browser refuses it.
    if (document.fullscreenEnabled && stageRef.current && !document.fullscreenElement) {
      void stageRef.current.requestFullscreen().catch(() => {
        focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
      });
    } else if (!document.fullscreenEnabled && !focusEvents.current.some((e) => e.type === 'fullscreen_unsupported')) {
      focusEvents.current.push({ type: 'fullscreen_unsupported', at_ms: 0, duration_ms: 0 });
    }
    setPhase('connecting');
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

    let turnCut = false;
    const say = (role: TranscriptEntry['role'], text: string) => {
      if (!text) return;
      if (role === 'interviewer' && turnCut) return;
      const list = transcript.current;
      const last = list[list.length - 1];
      if (last && last.role === role) {
        const needsSpace = /[.!?]$/.test(last.text) && /^[^\s]/.test(text);
        last.text += (needsSpace ? ' ' : '') + text;
      } else {
        list.push({ role, text, at_ms: Date.now() - startedAt.current, question_id: questionId.current });
      }
      const entry = list[list.length - 1];
      if (entry && role === 'interviewer') {
        const cleaned = sanitizeInterviewerTurn(entry.text);
        entry.text = cleaned.text;
        if (cleaned.cut) {
          turnCut = true;
          speaker.flush();
        }
      }
      setMessages([...list]);
    };

    const onMessage = (msg: LiveServerMessage) => {
      const content = msg.serverContent;
      if (content?.interrupted) {
        turnCut = false;
        speaker.flush();
      }
      for (const part of content?.modelTurn?.parts ?? []) {
        if (part.thought) continue;
        if (part.inlineData?.data && !turnCut) {
          wrap.current.modelTurnStarted();
          if (!pausedRef.current) speaker.play(part.inlineData.data);
        }
      }
      if (content?.turnComplete || content?.generationComplete) {
        turnCut = false;
        wrap.current.modelTurnEnded();
      }
      if (content?.inputTranscription?.text) {
        turnCut = false;
        wrap.current.candidateSpoke(Date.now());
        say('candidate', content.inputTranscription.text);
      }
      if (content?.outputTranscription?.text) say('interviewer', content.outputTranscription.text);

      const calls = msg.toolCall?.functionCalls ?? [];
      if (calls.length === 0) return;
      let ended = false;
      for (const call of calls) {
        if (call.name === 'show_question') {
          turnCut = false;
          const id = String((call.args as { question_id?: unknown } | undefined)?.question_id ?? '');
          const found = questions.find((q) => q.id === id) ?? null;
          if (found) {
            questionId.current = found.id;
            setQuestion(found);
          }
        }
        if (call.name === 'end_interview') ended = true;
      }
      session?.sendToolResponse({
        functionResponses: calls.map((c) => ({ id: c.id, name: c.name, response: { ok: true } })),
      });
      // The goodbye is played to the end before the interview finishes (see the wrap-up loop).
      if (ended) {
        wrap.current.endRequestedByModel(Date.now());
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
            if (Date.now() - startedAt.current > 30_000) void finish();
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
      if (!startedAt.current) startedAt.current = Date.now();
      setPhase('live');
      open.sendRealtimeInput({ text: 'Begin the interview.' });

      const total = live.seconds;
      const tick = () => {
        if (finished.current) return;
        const now = Date.now();
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
          try {
            open.sendRealtimeInput({ text: 'Time is up. Thank the candidate in one or two sentences and call end_interview.' });
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
  const snippetLines = activeQuestion ? activeQuestion.snippet.split('\n') : [];

  return (
    <section
      id="live-examination-cockpit"
      className="relative overflow-hidden rounded-[6px] border border-line bg-surface"
      onCopy={(e) => phase === 'live' && e.preventDefault()}
      onCut={(e) => phase === 'live' && e.preventDefault()}
      onContextMenu={(e) => phase === 'live' && e.preventDefault()}
    >
      {/* Cobalt & Cyan Live Cockpit Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-accent-soft px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold tracking-wider text-accent uppercase">
            <LiveDot tone="accent" />
            <span>{tr('AI INTERVIEWER')}</span>
          </span>
          <span className="font-mono-code truncate text-[12px] font-semibold text-ink">
            @{interview.repo.owner}/{interview.repo.name}
          </span>
          {interview.commit_sha && (
            <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
              {tr('COMMIT:')}{' '}{interview.commit_sha.slice(0, 7)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-[3px] border border-line bg-surface px-3 py-1">
            <span
              className={`h-2 w-2 rounded-full ${
                phase === 'live' ? 'bg-bad animate-ping' : phase === 'connecting' ? 'bg-warn animate-pulse' : 'bg-muted'
              }`}
            />
            <span
              className={`font-mono-code text-[11px] font-semibold uppercase ${
                phase === 'live' ? 'text-bad' : 'text-muted'
              }`}
            >
              {phase === 'live' ? tr('LIVE AUDIO') : phase === 'connecting' ? tr('CONNECTING') : tr('STANDBY')}
            </span>
            <span className="font-mono-code text-[14px] font-bold tracking-tight text-ink" aria-label={tr('Time left')}>
              {formatClock(left)}
            </span>
            <span className="font-mono-code text-[11px] text-muted">/ {formatClock(data.seconds)}</span>
          </div>

          {(phase === 'live' || resuming) && (
            <button
              type="button"
              onClick={() => (phase === 'live' ? confirmEnd() : void finish())}
              className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-bad/40 bg-surface px-3 py-1.5 text-[11px] font-semibold text-bad hover:bg-bad hover:text-on-bad"
            >
              {phase === 'live' ? tr('End Interview & Score') : tr('Finish & Score Recorded Audio')}
            </button>
          )}
        </div>
      </header>

      {/* Visual Telemetry & Spectral Analysis Hero Strip */}
      <div className="border-b border-line bg-paper/45 p-5">
        <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-12">
          <div className="overflow-hidden rounded-[4px] border border-line bg-surface lg:col-span-8">
            <div className="font-mono-code flex h-8 items-center justify-between border-b border-line bg-accent-soft px-4 text-[11px] text-muted">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="font-semibold text-ink uppercase">
                  {tr('Real-Time Audio Spectrogram & Code Hook Telemetry')}
                </span>
              </div>
              <span className="font-semibold text-good">
                {phase === 'live' ? tr('STREAMING LIVE AUDIO') : tr('{n} CODE HOOKS MAPPED', { n: questions.length })}
              </span>
            </div>
            <div className="bg-surface">
              <img
                src={SPECTROGRAM_ASSET}
                alt={tr('Real-time audio spectrogram waveform and synchronized code inspector')}
                className="block max-h-[210px] w-full object-cover select-none"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-3.5 lg:col-span-4">
            <div className="space-y-2 rounded-[4px] border border-line bg-surface p-4">
              <div className="font-mono-code flex items-center justify-between text-[11px]">
                <span className="text-muted uppercase">{tr('Repository Hook Sync')}</span>
                <span className="font-bold text-good">{tr('SYNCHRONIZED (100%)')}</span>
              </div>
              <ScoreBar value={100} max={100} tone="good" heightClass="h-1.5" trackClass="bg-well" />
              <p className="text-[12px] leading-relaxed text-muted">
                {rich(tr('{n} code snippets extracted from commit {sha} for verbal defense.'), {
                  n: questions.length,
                  sha: <code className="font-mono-code text-ink">{interview.commit_sha?.slice(0, 7) ?? 'HEAD'}</code>,
                })}
              </p>
            </div>

            <div className="space-y-2 rounded-[4px] border border-line bg-surface p-4">
              <div className="font-mono-code flex items-center justify-between text-[11px] text-muted">
                <span className="uppercase">{tr('Acoustic Input Stream')}</span>
                <span className="font-semibold text-ink">{phase === 'live' ? tr('MIC ACTIVE') : tr('MIC STANDBY')}</span>
              </div>
              <WaveformVisualizer bars={bars} active={phase === 'live'} />
              <div className="font-mono-code flex items-center justify-between pt-0.5 text-[10px] text-muted">
                <span>{tr('Echo Cancellation: ON')}</span>
                <span>{tr('Noise Suppression: ON')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The interview stage: the only part that goes full screen (code, conversation, clock and controls). */}
      <div ref={stageRef} id="interview-stage" className="interview-stage relative flex flex-col bg-surface">
      {(phase === 'live' || phase === 'connecting') && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-accent-soft px-4 py-2">
          <div className="font-mono-code flex items-center gap-3 text-[12px]">
            <span className="font-bold text-accent uppercase">{tr('Question {n} of {total}', { n: activeIdx + 1, total: Math.max(1, questions.length) })}</span>
            <span className="font-bold text-ink" aria-label={tr('Time left')}>{formatClock(left)}</span>
            {paused && <span className="rounded-[3px] bg-warn px-2 py-0.5 text-[10px] font-bold text-on-warn uppercase">{tr('Paused')}</span>}
            {wrapping && (
              <span className="rounded-[3px] bg-accent px-2 py-0.5 text-[10px] font-bold text-on-accent">
                {wrapping === 'time' ? tr('Time is up. The interviewer is wrapping up…') : tr('Ending: the interviewer is finishing what it is saying…')}
              </span>
            )}
          </div>
          {phase === 'live' && !wrapping && (
            <div className="flex flex-wrap gap-2">
              {paused ? (
                <Button onClick={resume} className="py-1.5 text-[12px]">{tr('Resume')}</Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={pause}
                  disabled={pauseCount >= MAX_INTERVIEW_PAUSES || pauseBudgetUsed}
                  className="py-1.5 text-[12px]"
                  title={tr('Up to {n} pauses, {m} minutes in total', { n: MAX_INTERVIEW_PAUSES, m: MAX_INTERVIEW_PAUSE_MS / 60_000 })}
                >
                  {tr('Pause (')}{MAX_INTERVIEW_PAUSES - pauseCount}{' '}{tr('left)')}
                </Button>
              )}
              <Button variant="secondary" onClick={nextQuestion} disabled={skipLocked || paused} className="py-1.5 text-[12px]">
                {activeIdx >= questions.length - 1 ? tr('Finish') : skipLocked ? tr('Moving on…') : tr('Next question →')}
              </Button>
              <Button variant="danger" onClick={confirmEnd} className="py-1.5 text-[12px]">{tr('End')}</Button>
            </div>
          )}
        </div>
      )}
      {phase === 'live' && (away || paused || needsFullscreen) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(20,22,26,0.92)] p-6" role="alertdialog" aria-label={paused ? tr('Interview paused') : away ? tr('You left the interview') : tr('Open the interview in full screen')}>
          <div className="max-w-md space-y-3 rounded-[6px] border border-line bg-surface p-6 text-center">
            {!paused && !away ? (
              <>
                <h3 className="font-serif-heading text-[20px] font-medium text-ink">{tr('Open the interview in full screen')}</h3>
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
                  {tr('The microphone, the interviewer and the clock are stopped, and the question is hidden. The pause is recorded. It ends on its own when your {minutes} minutes of pause run out.', { minutes: MAX_INTERVIEW_PAUSE_MS / 60_000 })}
                </p>
                <Button onClick={resume} className="w-full">{tr('Resume the interview')}</Button>
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
        {/* Left Pane: Code & AST Inspector (7 cols) */}
        <div className="flex flex-col border-b border-line bg-paper lg:col-span-7 lg:border-r lg:border-b-0">
          {/* File Navigation Subheader */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-5 py-2.5 text-muted">
            <div className="font-mono-code flex items-center gap-2 text-[12px]">
              <span className="material-symbols-outlined text-[16px] text-accent">code</span>
              <span className="font-semibold text-ink">
                {activeQuestion ? activeQuestion.path : `${interview.repo.owner}/${interview.repo.name}`}
              </span>
              {activeQuestion && (
                <>
                  <span className="text-line">|</span>
                  <span>
                    {tr('Lines')}{' '}{activeQuestion.start_line}–{activeQuestion.end_line}
                  </span>
                </>
              )}
            </div>

            {questions.length > 1 && (
              <div className="flex items-center gap-1">
                {questions.map((q, idx) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className={`font-mono-code cursor-pointer rounded-[3px] border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      activeQuestion?.id === q.id
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-paper text-muted hover:text-ink'
                    }`}
                  >
                    Q{idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable Code Box */}
          <div className={`interview-code font-mono-code max-h-[45vh] flex-1 overflow-x-auto overflow-y-auto bg-paper p-4 text-[12px] leading-[20px] text-ink select-none lg:max-h-[60vh] ${phase === 'live' && (away || paused) ? 'invisible' : ''}`}>
            {activeQuestion ? (
              <table className="w-full border-collapse">
                <tbody>
                  {snippetLines.map((line, i) => {
                    const lineNo = activeQuestion.start_line + i;
                    return (
                      <tr key={lineNo} className="border-l-[3px] border-accent bg-accent-soft/45">
                        <td className="w-10 pr-4 text-right text-[11px] font-medium text-accent select-none">
                          {lineNo}
                        </td>
                        <td className="whitespace-pre text-ink">{line || ' '}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-muted">
                {tr('The code snippet referenced by the interviewer will appear here as soon as the session begins.')}
              </p>
            )}
          </div>

          {/* Code Inspector Baseline Status */}
          <footer className="font-mono-code flex items-center justify-between border-t border-line bg-surface px-5 py-2.5 text-[11px] text-muted">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="font-medium text-ink">
                {activeQuestion
                  ? tr('Target Citation: {path} ({start}–{end})', { path: activeQuestion.path, start: activeQuestion.start_line, end: activeQuestion.end_line })
                  : tr('Code Hook Inspector Ready')}
              </span>
            </div>
            {interview.commit_sha && <span>{tr('SHA:')}{' '}{interview.commit_sha.slice(0, 12)}</span>}
          </footer>
        </div>

        {/* Right Pane: Pre-Flight Briefing OR Live Examiner Dialogue (5 cols) */}
        <div className="flex min-h-0 flex-col justify-between space-y-5 bg-surface p-6 lg:col-span-5">
          {phase === 'idle' ? (
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
                        tr('The interview room (code and conversation) opens in {fullScreen}. Leaving it, switching tabs or windows is not blocked, but each time is recorded and shown to reviewers. You can pause up to {pauses} times ({minutes} minutes in total) and use “Next question” to move on.', { pauses: MAX_INTERVIEW_PAUSES, minutes: MAX_INTERVIEW_PAUSE_MS / 60_000 }),
                        { fullScreen: <strong>{tr('full screen')}</strong> },
                      )}
                    </span>
                  </li>
                  {(interview.submission_id || interview.assignment) && (
                    <li className="flex items-start gap-2">
                      <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">05</span>
                      <span>{interview.assignment ? tr('Your instructors') : tr('The event organizer')}{' '}{tr('can inspect the transcript and ownership report.')}</span>
                    </li>
                  )}
                </ul>
              )}

              {error && <Notice tone="error">{error}</Notice>}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={() => void start()} className="w-full py-2.5 sm:w-auto">
                  <span className="material-symbols-outlined text-[17px]">mic</span>
                  <span>{resuming ? tr('Reconnect to Live Room') : tr('Allow Microphone & Start Interview')}</span>
                  <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                </Button>
                {resuming && (
                  <Button variant="secondary" onClick={() => void finish()} className="w-full sm:w-auto">
                    {tr('End and get my report')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col space-y-4">
              {/* Question Stage Header */}
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
                  {tr('QUESTION {n} OF {total} • ORAL DEFENSE', { n: activeIdx + 1, total: Math.max(1, questions.length) })}
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

              {/* Examiner Audio Question Box */}
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
                <h2 className={`font-serif-heading text-[18px] leading-[25px] font-medium break-words whitespace-pre-wrap text-ink ${away || paused || needsFullscreen ? 'blur-sm select-none' : ''}`}>
                  {activeQuestion
                    ? `“${activeQuestion.question}”`
                    : tr('The interviewer is about to ask the first question. The code it refers to will appear on the left.')}
                </h2>
              </div>

              {/* The whole conversation */}
              <div className="flex min-h-0 flex-1 flex-col space-y-2">
                <div className="font-mono-code flex items-center justify-between text-[11px] text-muted">
                  <span className="font-semibold text-ink uppercase">{tr('Conversation')}</span>
                  <span>{trn('{count} message', '{count} messages', messages.filter((m) => m.role !== 'system').length)}</span>
                </div>
                <LiveChat messages={messages} questions={questions} className="interview-chat h-[40vh]" />
              </div>
            </div>
          )}

          {/* Footer Bar */}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
              <span className="material-symbols-outlined text-[15px]">timer</span>
              <span>{phase === 'live' ? tr('Remaining: {time}', { time: formatClock(left) }) : tr('Clock starts on microphone grant')}</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

export function InterviewPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const [liveActive, setLiveActive] = useState(false);

  const { data, error, loading, reload } = useLoad<InterviewResponse>(
    `/api/interviews/${id}`,
    (d) => d.interview.status === 'preparing' || d.interview.status === 'evaluating',
  );

  const toast = useToast();
  const confirm = useConfirm();
  const [acting, setActing] = useState<string | null>(null);

  if (!data) return <PageState loading={loading} error={error} kind="detail" />;
  const { interview } = data;
  const activity = data.activity ?? [];

  /** Cancel a preparation, or pause, resume or cancel the report. */
  async function control(action: 'cancel' | 'pause-report' | 'resume-report', confirmText?: string) {
    if (confirmText && !(await confirm(questionToOptions(confirmText, { confirmLabel: action === 'cancel' ? tr('Cancel it') : tr('Confirm'), cancelLabel: tr('Keep it') })))) return;
    setActing(action);
    try {
      await api(`/api/interviews/${interview.id}/${action}`, { method: 'POST' });
      toast.success(
        action === 'cancel'
          ? interview.status === 'preparing'
            ? tr('Preparation canceled. It does not count as your interview on this commit.')
            : tr('Report canceled. Your answers are saved.')
          : action === 'pause-report'
            ? tr('Report paused.')
            : tr('Writing the report.'),
      );
      await reload();
    } catch (err) {
      toast.error(tr('Could not do that. {error}', { error: errorMessage(err) }));
    } finally {
      setActing(null);
    }
  }
  const profile = me?.public_profile;
  const publicUrl = profile?.slug ? `${window.location.origin}/p/${profile.slug}` : null;

  return (
    <div className="space-y-8">
      {/* Top Stage Controller */}
      {interview.status === 'completed' && (
        <PrintMasthead
          kind={tr('Voice interview report')}
          name={interview.is_owner && me?.profile.display_name ? me.profile.display_name : `${interview.repo.owner}/${interview.repo.name}`}
          repo={`${interview.repo.owner}/${interview.repo.name}`}
          commit={interview.commit_sha}
          date={interview.created_at}
          url={publicUrl}
        />
      )}
      <div className="no-print">
        <StageController status={interview.status} liveActive={liveActive} />
      </div>

      {/* Page Masthead */}
      <DossierPageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-2">
            {interview.assignment ? (
              <Link
                to={
                  interview.is_owner
                    ? `/courses/${interview.assignment.course_id}/a/${interview.assignment.id}`
                    : `/org/courses/${interview.assignment.course_id}/assignments/${interview.assignment.id}`
                }
                className="text-accent hover:underline"
              >
                ← {interview.assignment.title.toUpperCase()}
              </Link>
            ) : (
              <Link to="/interview/new" className="text-accent hover:underline">
                {tr('← MY INTERVIEWS')}
              </Link>
            )}
            <span>•</span>
            <span>{tr('DOSSIER #')}{interview.id.slice(0, 8).toUpperCase()}</span>
            {interview.commit_sha && (
              <>
                <span>•</span>
                <span className="rounded-[3px] border border-line bg-surface px-2 py-0.5 text-ink">
                  {tr('COMMIT')}{' '}<code>{interview.commit_sha.slice(0, 7)}</code>
                </span>
              </>
            )}
          </div>
        }
        title={tr('Oral Verification: {repo}', { repo: `${interview.repo.owner}/${interview.repo.name}` })}
        subtitle={interview.summary}
        rightSlot={
          <a
            href={interview.repo.url}
            target="_blank"
            rel="noreferrer"
            className="btn-tactile font-mono-code inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
          >
            <span>{tr('Inspect GitHub Repo')}</span>
            <span>↗</span>
          </a>
        }
      />

      {/* Stage 01: Preparing Repository & Questions */}
      {interview.status === 'preparing' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label={tr('Reading the repository and preparing your code-anchored questions')} />
            <p className="text-[13px] text-muted">
              {tr('This takes about a minute. You can leave this page open; it will advance automatically.')}
            </p>
          </div>
          {interview.is_owner && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={!!acting} loading={acting === 'cancel'}
                onClick={() => void control('cancel', tr('Cancel the preparation? You can start again later; it does not use up your interview on this commit.'))}
              >
                {acting === 'cancel' ? tr('Canceling…') : tr('Cancel preparation')}
              </Button>
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {interview.status === 'canceled' && (
        <div className="space-y-4">
          <Notice>{tr('This interview was canceled before it started, so it does not count. You can start a new one.')}</Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>{tr('Start another interview')}</Link>
        </div>
      )}

      {(interview.status === 'report_paused' || interview.status === 'report_canceled') && (
        <section className="space-y-4 rounded-[6px] border border-line bg-surface p-6">
          <Notice tone="warn">
            {interview.status === 'report_paused'
              ? tr('The report is paused. Your answers are saved; resume whenever you want.')
              : tr('The report was canceled. Your answers are saved, and you can have it written at any time.')}
          </Notice>
          {interview.is_owner && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={!!acting} loading={acting === 'resume-report'} onClick={() => void control('resume-report')}>
                {interview.status === 'report_paused' ? tr('Resume the report') : tr('Write the report')}
              </Button>
              {interview.status === 'report_paused' && (
                <Button variant="secondary" disabled={!!acting} loading={acting === 'cancel'} onClick={() => void control('cancel', tr('Cancel the report? Your answers stay saved and you can write it later.'))}>
                  {tr('Cancel the report')}
                </Button>
              )}
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} />}
        </section>
      )}

      {/* Error State */}
      {interview.status === 'error' && (
        <div className="space-y-4">
          <Notice tone="error">{interview.error || tr('This interview could not be completed.')}</Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>
            {tr('Start another interview')}
          </Link>
        </div>
      )}

      {/* Stage 02 & 03: Ready / In Progress Live Cockpit */}
      {(interview.status === 'ready' || interview.status === 'in_progress') &&
        (interview.is_owner ? (
          <Room data={data} onChanged={reload} onLiveChange={setLiveActive} />
        ) : (
          <Notice>{tr('The candidate has not finished this interview yet.')}</Notice>
        ))}

      {/* Stage 04: Evaluating Transcript */}
      {interview.status === 'evaluating' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-surface p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label={tr('Synthesizing your ownership score and pinning verbatim transcript evidence')} />
            <p className="text-[13px] text-muted">{tr('Usually completes in under a minute.')}</p>
          </div>
          {interview.error && <Notice tone="warn">{interview.error}</Notice>}
          {interview.is_owner && (
            <div className="flex justify-center gap-2">
              <Button variant="secondary" disabled={!!acting} loading={acting === 'pause-report'} onClick={() => void control('pause-report')}>{tr('Pause')}</Button>
              <Button variant="secondary" disabled={!!acting} loading={acting === 'cancel'} onClick={() => void control('cancel', tr('Cancel the report? Your answers stay saved and you can write it later. This still counts as your interview on this commit.'))}>
                {tr('Cancel')}
              </Button>
            </div>
          )}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {/* Stage 05: Completed Verified Skills Report Dossier */}
      {interview.status === 'completed' && data.report && (
        <>
          <article
            id="verified-dossier-report"
            className="overflow-hidden rounded-[6px] border border-line bg-surface"
          >
            {/* Official Credential Header Block */}
            <header className="space-y-4 border-b border-line bg-surface p-6 sm:p-8">
              <div className="font-mono-code flex flex-col justify-between gap-2 text-[11px] text-muted md:flex-row md:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="status-dot-live bg-good text-good" />
                  <span className="font-bold tracking-wider text-ink uppercase">{tr('SkillProof Verified Credential')}</span>
                  <span>•</span>
                  <span className="rounded-[2px] border border-line bg-paper px-2 py-0.5">
                    {tr('DOSSIER #SP-')}{interview.id.slice(0, 6).toUpperCase()}
                  </span>
                </div>
                <div className="rounded-[3px] border border-good/30 bg-good-soft px-2.5 py-0.5 font-medium text-good-ink">
                  {interview.created_at ? `${tr('ISSUED {date}', { date: formatDate(interview.created_at).toUpperCase() })} • ` : ''}
                  {tr('COMMIT:')}{' '}{interview.commit_sha?.slice(0, 7) ?? 'HEAD'}
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4 pt-1 md:flex-row md:items-end">
                <div>
                  <h2 className="font-serif-heading text-[28px] leading-[34px] font-medium tracking-tight text-ink sm:text-[34px] sm:leading-[40px]">
                    {interview.is_owner && me?.profile.display_name
                      ? me.profile.display_name
                      : `${interview.repo.owner}/${interview.repo.name}`}
                  </h2>
                  <p className="mt-1 text-[14px] text-muted">
                    {tr('Repository Defense:')}{' '}<strong className="text-ink">{interview.repo.owner}/{interview.repo.name}</strong>
                    {me?.public_profile?.headline ? ` • ${me.public_profile.headline}` : ''}
                  </p>
                </div>

                <span className="font-mono-code inline-flex items-center gap-1.5 self-start rounded-[3px] border border-good/30 bg-good-soft px-3 py-1.5 text-[11px] font-bold text-good-ink md:self-auto">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  <span>{tr('VERIFICATION COMPLETED')}</span>
                </span>
              </div>
            </header>

            <div className="p-6 sm:p-8">
              {focusSummary(data.focus_events ?? []) && (
                <div className="print-avoid-break mb-5">
                  <Notice tone="warn">
                    {focusSummary(data.focus_events ?? [])}{' '}{tr('This is recorded as a signal for reviewers; it is not a finding of misconduct.')}
                  </Notice>
                </div>
              )}
              <Report report={data.report} />
              {data.answer_key && (
                <div className="mt-6">
                  <AnswerKey questions={data.answer_key} answers={data.report.answers_json ?? []} />
                </div>
              )}

              {interview.models_used && interview.models_used.length > 0 && (
                <div className="font-mono-code mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[11px] text-muted">
                  <span>{tr('EVALUATED WITH:')}</span>
                  <ModelsUsed models={interview.models_used} primary={interview.primary_models} />
                </div>
              )}
            </div>

            {/* Attestation Footer Action Bar */}
            <footer className="flex flex-col justify-between gap-4 border-t border-line bg-good-soft p-6 md:flex-row md:items-center">
              <div className="flex flex-wrap items-center gap-3">
                {interview.is_owner && profile && (
                  <Link
                    to={profile.is_public ? `/p/${profile.slug}` : '/me'}
                    className="btn-tactile inline-flex items-center gap-2 rounded-[4px] border border-ink bg-ink px-4 py-2 text-[13px] font-medium text-on-accent hover:border-accent hover:bg-accent"
                  >
                    <span className="material-symbols-outlined text-[16px]">public</span>
                    <span>
                      {profile.is_public ? tr('Open Public Recruiter Profile') : tr('Enable Public Recruiter Profile')}
                    </span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-tactile inline-flex cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper"
                >
                  <span className="material-symbols-outlined text-[16px] text-good">print</span>
                  <span>{tr('Print / Save PDF Dossier')}</span>
                </button>
              </div>

              {interview.is_owner && profile?.is_public && publicUrl && (
                <CopyLinkButton
                  value={publicUrl}
                  label={tr('Copy Recruiter Access Link')}
                  copiedLabel={tr('COPIED RECRUITER LINK!')}
                />
              )}
            </footer>
          </article>

          {interview.is_owner && profile && !profile.is_public && (
            <Notice tone="info">
              {tr('Your profile is currently private.')}{' '}
              <Link to="/me" className="font-semibold text-accent underline">
                {tr('Make it public in Account Settings')}
              </Link>{' '}
              {tr('to share this verified report with recruiters.')}
            </Notice>
          )}

          {data.transcript && data.transcript.length > 0 && (
            <section className="rounded-[6px] border border-line bg-surface p-5">
              <details>
                <summary className="font-mono-code cursor-pointer text-[12px] font-semibold tracking-wider text-ink uppercase">
                  {tr('Inspect Full Verbatim Transcript (')}{data.transcript.length}{' '}{tr('exchanges)')}
                </summary>
                <ol className="mt-4 space-y-2.5 border-t border-line pt-4 text-[13px]">
                  {data.transcript.map((t, i) => (
                    <li
                      key={i}
                      className={`rounded-[4px] border border-line p-3 ${
                        t.role === 'interviewer' ? 'bg-paper/60' : t.role === 'system' ? 'bg-warn-soft/40' : 'bg-surface'
                      }`}
                    >
                      <div className="font-mono-code mb-1 flex items-center justify-between text-[10px] text-muted uppercase">
                        <span className={t.role === 'interviewer' ? 'font-bold text-accent' : t.role === 'system' ? 'font-bold text-warn' : 'font-bold text-good'}>
                          {t.role === 'interviewer' ? tr('AI Technical Examiner') : t.role === 'system' ? 'SkillProof' : tr('Candidate')}
                        </span>
                        {typeof t.at_ms === 'number' && <span>+{Math.round(t.at_ms / 1000)}s</span>}
                      </div>
                      <p className="text-ink">{t.text}</p>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
        </>
      )}
    </div>
  );
}
