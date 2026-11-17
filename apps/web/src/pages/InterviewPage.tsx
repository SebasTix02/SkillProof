import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { ActivityEntry, FocusEvent as ExamFocusEvent, PublicQuestion, TranscriptEntry } from '@skillproof/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../components/AiActivity';
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
} from '../components/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MIC_MIME, Speaker, startMic } from '../lib/liveAudio';
import { useLoad } from '../lib/useLoad';

const SPECTROGRAM_ASSET =
  'https://lh3.googleusercontent.com/aida/ALJJyrCoegBM7lcY0q0DQ28N-jVRexrVR2oFEc93h_uF6SRADyZPBxlq6_MfcPv5z-OonkUHI4590rx0C9380oaQAj9acapo1HgaFxTxvnzFompyX-nwrCNuwg035w_yMkKW8AnBslMqo2qWM173UbZ8AppajZ0IfbHA5sH4XIx1PIjVrcDn0JtXBKgonMDDDQxzEKszxuojU2Y-gJBNsIwD4bEeUSLY5EWY82q-OGzcabYq';

const BAR_HEIGHTS = [35, 50, 70, 85, 60, 40, 65, 90, 100, 75, 55, 30, 60, 45, 25, 18];

interface InterviewResponse {
  interview: {
    id: string;
    status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error';
    error: string | null;
    submission_id: string | null;
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
}

interface LiveToken {
  token: string;
  model: string;
  api_version: string;
  seconds: number;
}

/** Seconds the interviewer gets to say goodbye once the clock runs out. */
const WRAP_UP_SECONDS = 12;

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
    { num: 1, label: '01. AST Parse' },
    { num: 2, label: '02. Mic & Consent' },
    { num: 3, label: '03. Live Oral Interview' },
    { num: 4, label: '04. Synthesis Engine' },
    { num: 5, label: '05. Verified Credential Dossier' },
  ];

  return (
    <section className="rounded-[6px] border border-line bg-white p-4 sm:px-6">
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
                      ? 'border border-good/30 bg-good-soft font-semibold text-good'
                      : isCurrent
                        ? 'border border-accent/25 bg-accent-soft font-semibold text-accent'
                        : isDone
                          ? 'text-good font-medium'
                          : 'text-muted/75'
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
              status !== 'completed' ? 'border border-line bg-white text-accent' : 'text-muted'
            }`}
          >
            {status !== 'completed' && <span className="h-1.5 w-1.5 rounded-full bg-bad" />}
            <span>Live Examination Cockpit</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-[3px] px-3 py-1 font-semibold ${
              status === 'completed' ? 'border border-good/30 bg-good-soft text-good' : 'text-muted'
            }`}
          >
            <span className="material-symbols-outlined text-[14px] text-good">verified</span>
            <span>Verified Dossier</span>
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
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'live' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(data.seconds);
  const [question, setQuestion] = useState<PublicQuestion | null>(questions[0] ?? null);
  const [caption, setCaption] = useState('');
  const [candidatePreview, setCandidatePreview] = useState('');
  const [bars, setBars] = useState<number[]>(BAR_HEIGHTS);

  const transcript = useRef<TranscriptEntry[]>([]);
  const questionId = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  // Exam mode: times the candidate left full screen, the tab or the window. A signal for reviewers, not a verdict.
  const focusEvents = useRef<ExamFocusEvent[]>([]);
  const awaySince = useRef<{ type: ExamFocusEvent['type']; at: number } | null>(null);
  const [away, setAway] = useState<ExamFocusEvent['type'] | null>(null);
  const [skipLocked, setSkipLocked] = useState(false);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    onLiveChange(phase === 'connecting' || phase === 'live');
  }, [phase, onLiveChange]);

  useEffect(() => {
    if (phase !== 'live') {
      setBars(BAR_HEIGHTS);
      return;
    }
    const timer = setInterval(() => {
      setBars((prev) => prev.map((_, i) => 18 + ((Date.now() / 90 + i * 29) % 78)));
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
      duration_ms: Math.max(0, Date.now() - open.at),
    });
    setAway(null);
  }, []);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    endAway();
    teardown();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setPhase('sending');
    const entries = transcript.current
      .map((t) => ({ ...t, text: t.text.trim().slice(0, 8000) }))
      .filter((t) => t.text)
      .slice(0, 400);
    const duration = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
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
  }, [interview.id, onChanged, teardown, endAway]);

  // Exam mode watchers: leaving full screen, hiding the tab, or moving to another window.
  useEffect(() => {
    if (phase !== 'live') return;
    const leave = (type: ExamFocusEvent['type']) => {
      if (awaySince.current) return;
      awaySince.current = { type, at: Date.now() };
      setAway(type);
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) leave('fullscreen_exit');
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
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, endAway]);

  async function returnToFullscreen() {
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) await document.documentElement.requestFullscreen();
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
    if (isLast) {
      void finish();
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

  async function start() {
    setError(null);
    // Must happen inside the click, before anything is awaited, or the browser refuses it.
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
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

    const say = (role: TranscriptEntry['role'], text: string) => {
      if (!text) return;
      const list = transcript.current;
      const last = list[list.length - 1];
      if (last && last.role === role) last.text += text;
      else list.push({ role, text, at_ms: Date.now() - startedAt.current, question_id: questionId.current });
      if (role === 'interviewer') setCaption(list[list.length - 1]!.text);
      if (role === 'candidate') setCandidatePreview(list[list.length - 1]!.text);
    };

    const onMessage = (msg: LiveServerMessage) => {
      const content = msg.serverContent;
      if (content?.interrupted) speaker.flush();
      for (const part of content?.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) speaker.play(part.inlineData.data);
      }
      if (content?.inputTranscription?.text) say('candidate', content.inputTranscription.text);
      if (content?.outputTranscription?.text) say('interviewer', content.outputTranscription.text);

      const calls = msg.toolCall?.functionCalls ?? [];
      if (calls.length === 0) return;
      let ended = false;
      for (const call of calls) {
        if (call.name === 'show_question') {
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
      if (ended) timers.push(setTimeout(() => void finish(), Math.min(8000, speaker.pending() * 1000 + 600)));
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
              setError('The connection to the interviewer was lost. You can reconnect within two minutes of starting.');
              setPhase('idle');
            }
          },
        },
      });
      const open = session;
      sessionRef.current = session;
      stopMic = await startMic(stream, (audioData) => {
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
        const remaining = total - Math.floor((Date.now() - startedAt.current) / 1000);
        setLeft(Math.max(0, remaining));
        if (remaining > 0) {
          timers.push(setTimeout(tick, 500));
          return;
        }
        try {
          open.sendRealtimeInput({
            text: 'Time is up. Thank the candidate in one sentence and call end_interview now.',
          });
        } catch {
          // socket is closing
        }
        timers.push(setTimeout(() => void finish(), WRAP_UP_SECONDS * 1000));
      };
      tick();
    } catch (err) {
      dispose();
      cleanup.current = null;
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'NotFoundError');
      setError(
        denied
          ? 'SkillProof needs your microphone for the interview. Allow it in your browser and try again.'
          : errorMessage(err),
      );
      setPhase('idle');
    }
  }

  if (phase === 'sending') {
    return (
      <section className="rounded-[6px] border border-line bg-white p-12 text-center">
        <Spinner label="Saving your interview transcript and dispatching evaluation…" />
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
      className="relative overflow-hidden rounded-[6px] border border-line bg-white"
      onCopy={(e) => phase === 'live' && e.preventDefault()}
      onCut={(e) => phase === 'live' && e.preventDefault()}
      onContextMenu={(e) => phase === 'live' && e.preventDefault()}
    >
      {phase === 'live' && away && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(20,22,26,0.88)] p-6" role="alertdialog" aria-label="You left the interview">
          <div className="max-w-md space-y-3 rounded-[6px] border border-line bg-white p-6 text-center">
            <h3 className="font-serif-heading text-[20px] font-medium text-ink">You left the interview window</h3>
            <p className="text-[13px] text-muted">
              The question is hidden until you come back. Leaving full screen, switching tabs or windows is recorded with
              its time and shown to the reviewers as a signal. The interview keeps running.
            </p>
            <Button onClick={() => void returnToFullscreen()} className="w-full">
              <span className="material-symbols-outlined text-[17px]">fullscreen</span>
              <span>Return to full screen</span>
            </Button>
          </div>
        </div>
      )}
      {/* Cobalt & Cyan Live Cockpit Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-[#F0F6FF] px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wider text-accent uppercase">
            <LiveDot tone="accent" />
            <span>ORAL EXAMINER COCKPIT</span>
          </span>
          <span className="font-mono-code truncate text-[12px] font-semibold text-ink">
            @{interview.repo.owner}/{interview.repo.name}
          </span>
          {interview.commit_sha && (
            <span className="font-mono-code rounded-[3px] border border-accent/25 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              COMMIT: {interview.commit_sha.slice(0, 7)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-[3px] border border-line bg-white px-3 py-1">
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
              {phase === 'live' ? 'LIVE AUDIO' : phase === 'connecting' ? 'CONNECTING' : 'STANDBY'}
            </span>
            <span className="font-mono-code text-[14px] font-bold tracking-tight text-ink" aria-label="Time left">
              {formatClock(left)}
            </span>
            <span className="font-mono-code text-[11px] text-muted">/ {formatClock(data.seconds)}</span>
          </div>

          {(phase === 'live' || resuming) && (
            <button
              type="button"
              onClick={() => void finish()}
              className="btn-tactile font-mono-code cursor-pointer rounded-[4px] border border-bad/40 bg-white px-3 py-1.5 text-[11px] font-semibold text-bad hover:bg-bad hover:text-white"
            >
              {phase === 'live' ? 'End Interview & Score' : 'Finish & Score Recorded Audio'}
            </button>
          )}
        </div>
      </header>

      {/* Visual Telemetry & Spectral Analysis Hero Strip */}
      <div className="border-b border-line bg-paper/45 p-5">
        <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-12">
          <div className="overflow-hidden rounded-[4px] border border-line bg-white lg:col-span-8">
            <div className="font-mono-code flex h-8 items-center justify-between border-b border-line bg-[#F0F6FF] px-4 text-[11px] text-muted">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="font-semibold text-ink uppercase">
                  Real-Time Audio Spectrogram &amp; Code Hook Telemetry
                </span>
              </div>
              <span className="font-semibold text-good">
                {phase === 'live' ? 'STREAMING LIVE AUDIO' : `${questions.length} CODE HOOKS MAPPED`}
              </span>
            </div>
            <div className="bg-white">
              <img
                src={SPECTROGRAM_ASSET}
                alt="Real-time audio spectrogram waveform and synchronized code inspector"
                className="block max-h-[210px] w-full object-cover select-none"
              />
            </div>
          </div>

          <div className="flex flex-col justify-between space-y-3.5 lg:col-span-4">
            <div className="space-y-2 rounded-[4px] border border-line bg-white p-4">
              <div className="font-mono-code flex items-center justify-between text-[11px]">
                <span className="text-muted uppercase">Repository Hook Sync</span>
                <span className="font-bold text-good">SYNCHRONIZED (100%)</span>
              </div>
              <ScoreBar value={100} max={100} tone="good" heightClass="h-1.5" trackClass="bg-well" />
              <p className="text-[12px] leading-relaxed text-muted">
                {questions.length} code snippets extracted from commit{' '}
                <code className="font-mono-code text-ink">{interview.commit_sha?.slice(0, 7) ?? 'HEAD'}</code> for
                verbal defense.
              </p>
            </div>

            <div className="space-y-2 rounded-[4px] border border-line bg-white p-4">
              <div className="font-mono-code flex items-center justify-between text-[11px] text-muted">
                <span className="uppercase">Acoustic Input Stream</span>
                <span className="font-semibold text-ink">{phase === 'live' ? 'MIC ACTIVE' : 'MIC STANDBY'}</span>
              </div>
              <WaveformVisualizer bars={bars} active={phase === 'live'} />
              <div className="font-mono-code flex items-center justify-between pt-0.5 text-[10px] text-muted">
                <span>Echo Cancellation: ON</span>
                <span>Noise Suppression: ON</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Asymmetric Dual Split Panel: Left Code Inspector (Col 7) / Right Examiner Dialogue & Controls (Col 5) */}
      <div className="grid min-h-[460px] grid-cols-1 lg:grid-cols-12">
        {/* Left Pane: Code & AST Inspector (7 cols) */}
        <div className="flex flex-col border-b border-line bg-[#FAFAFC] lg:col-span-7 lg:border-r lg:border-b-0">
          {/* File Navigation Subheader */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-5 py-2.5 text-muted">
            <div className="font-mono-code flex items-center gap-2 text-[12px]">
              <span className="material-symbols-outlined text-[16px] text-[#4338CA]">code</span>
              <span className="font-semibold text-ink">
                {activeQuestion ? activeQuestion.path : `${interview.repo.owner}/${interview.repo.name}`}
              </span>
              {activeQuestion && (
                <>
                  <span className="text-line">|</span>
                  <span>
                    Lines {activeQuestion.start_line}–{activeQuestion.end_line}
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
                        ? 'border-[#4338CA] bg-[#EEF2FF] text-[#4338CA]'
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
          <div className="font-mono-code max-h-[45vh] flex-1 overflow-x-auto overflow-y-auto bg-[#FAFAFC] p-4 text-[12px] leading-[20px] text-ink select-none lg:max-h-[60vh]">
            {activeQuestion ? (
              <table className="w-full border-collapse">
                <tbody>
                  {snippetLines.map((line, i) => {
                    const lineNo = activeQuestion.start_line + i;
                    return (
                      <tr key={lineNo} className="border-l-[3px] border-[#4338CA] bg-[#EEF2FF]/45">
                        <td className="w-10 pr-4 text-right text-[11px] font-medium text-[#4338CA] select-none">
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
                The code snippet referenced by the interviewer will appear here as soon as the session begins.
              </p>
            )}
          </div>

          {/* Code Inspector Baseline Status */}
          <footer className="font-mono-code flex items-center justify-between border-t border-line bg-white px-5 py-2.5 text-[11px] text-muted">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#4338CA]" />
              <span className="font-medium text-ink">
                {activeQuestion
                  ? `Target Citation: ${activeQuestion.path} (${activeQuestion.start_line}–${activeQuestion.end_line})`
                  : 'Code Hook Inspector Ready'}
              </span>
            </div>
            {interview.commit_sha && <span>SHA: {interview.commit_sha.slice(0, 12)}</span>}
          </footer>
        </div>

        {/* Right Pane: Pre-Flight Briefing OR Live Examiner Dialogue (5 cols) */}
        <div className="flex flex-col justify-between space-y-5 bg-white p-6 lg:col-span-5">
          {phase === 'idle' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <span className="font-mono-code text-[11px] font-bold tracking-wider text-accent uppercase">
                  {resuming ? 'SESSION RECOVERY // IN PROGRESS' : 'STAGE 02 // MICROPHONE & CONSENT BRIEFING'}
                </span>
                <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink">
                  {Math.round(data.seconds / 60)} MIN LIMIT
                </span>
              </div>

              <h2 className="font-serif-heading text-[22px] leading-[28px] font-medium text-ink">
                {resuming ? 'This interview is in progress' : 'Before you start your oral defense'}
              </h2>

              {resuming ? (
                <p className="text-[13px] leading-[21px] text-muted">
                  If you lost the connection you can reconnect within two minutes of starting. Otherwise end the session
                  now to generate your ownership report from the transcript recorded so far.
                </p>
              ) : (
                <ul className="space-y-2.5 text-[13px] leading-[20px] text-muted">
                  <li className="flex items-start gap-2">
                    <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">01</span>
                    <span>
                      Lasts <strong>{Math.round(data.seconds / 60)} minutes</strong> with{' '}
                      <strong>{questions.length} code-anchored questions</strong> about your own repository.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">02</span>
                    <span>
                      You speak naturally; the AI examiner listens and asks follow-ups. Use headphones in a quiet room
                      if possible.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">03</span>
                    <span>
                      Raw audio is not stored. The written transcript is recorded and evaluated against your repository.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">04</span>
                    <span>
                      The interview opens in <strong>full screen</strong>. Leaving it, switching tabs or windows is not
                      blocked, but each time is recorded and shown to reviewers. Use &ldquo;Next question&rdquo; to move on.
                    </span>
                  </li>
                  {interview.submission_id && (
                    <li className="flex items-start gap-2">
                      <span className="font-mono-code mt-0.5 text-[11px] font-bold text-accent">05</span>
                      <span>The event organizer can inspect the transcript and ownership report.</span>
                    </li>
                  )}
                </ul>
              )}

              {error && <Notice tone="error">{error}</Notice>}

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={() => void start()} className="w-full py-2.5 sm:w-auto">
                  <span className="material-symbols-outlined text-[17px]">mic</span>
                  <span>{resuming ? 'Reconnect to Live Room' : 'Allow Microphone & Start Interview'}</span>
                  <span className="arrow-nudge font-mono-code text-[12px]">→</span>
                </Button>
                {resuming && (
                  <Button variant="secondary" onClick={() => void finish()} className="w-full sm:w-auto">
                    End and get my report
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Question Stage Header */}
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="font-mono-code text-[11px] font-bold tracking-wider text-[#4338CA] uppercase">
                  QUESTION {activeIdx + 1} OF {Math.max(1, questions.length)} • ORAL DEFENSE
                </span>
                <span className="font-mono-code rounded-[3px] border border-[#DDD6FE] bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#4338CA]">
                  {phase === 'connecting' ? 'HANDSHAKE…' : 'LIVE AUDIO'}
                </span>
              </div>

              {phase === 'connecting' && (
                <div className="py-3">
                  <Spinner label="Connecting to the Gemini Live examiner…" />
                </div>
              )}

              {/* Examiner Audio Question Box */}
              <div className="space-y-2 rounded-[4px] border border-[#DDD6FE] bg-[#F5F3FF] p-4">
                <div className="flex items-center justify-between">
                  <div className="font-mono-code flex items-center gap-1.5 text-[11px] font-bold text-[#4338CA] uppercase">
                    <span className="status-dot-live bg-[#4338CA] text-[#4338CA]" />
                    <span>AI Technical Examiner</span>
                  </div>
                  <span className="font-mono-code rounded-[2px] border border-line bg-white px-1.5 py-0.5 text-[10px] text-muted">
                    Gemini Live Audio
                  </span>
                </div>
                <h2 className={`font-serif-heading text-[18px] leading-[25px] font-medium break-words whitespace-pre-wrap text-ink ${away ? 'blur-sm select-none' : ''}`}>
                  {activeQuestion
                    ? `“${activeQuestion.question}”`
                    : 'The interviewer is about to ask the first question. The code it refers to will appear on the left.'}
                </h2>
              </div>

              {/* Real-Time Dialogue Transcription Stream */}
              <div className="space-y-2">
                <div className="font-mono-code flex items-center justify-between text-[11px] text-muted">
                  <span className="font-semibold text-ink uppercase">Live Speech Transcription Stream</span>
                  <span className="flex items-center gap-1 font-medium text-good">
                    <span className="h-1.5 w-1.5 rounded-full bg-good" />
                    ASR Active
                  </span>
                </div>

                <div
                  className="max-h-[35vh] space-y-2.5 overflow-y-auto rounded-[4px] border border-line bg-[#FAFAFC] p-3.5"
                  aria-live="polite"
                >
                  {caption ? (
                    <div className="rounded-[3px] border border-line border-l-2 border-l-[#4338CA] bg-white p-2.5 text-[12px] text-ink">
                      <span className="font-mono-code block text-[10px] font-bold text-[#4338CA] uppercase">
                        Interviewer Prompt
                      </span>
                      <span className="mt-0.5 block whitespace-pre-wrap">{caption}</span>
                    </div>
                  ) : (
                    <p className="font-mono-code text-[11px] text-muted">
                      Listening for examiner and candidate voice stream…
                    </p>
                  )}

                  {candidatePreview && (
                    <div className="rounded-[3px] border border-line bg-white p-2.5 text-[12px] text-ink">
                      <span className="font-mono-code block text-[10px] font-bold text-good uppercase">
                        Candidate Defense (Live)
                      </span>
                      <blockquote className="mt-0.5 italic">
                        &ldquo;{candidatePreview}&rdquo;
                      </blockquote>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer Bar */}
          <div className="flex items-center justify-between border-t border-line pt-3">
            <div className="font-mono-code flex items-center gap-1.5 text-[11px] text-muted">
              <span className="material-symbols-outlined text-[15px]">timer</span>
              <span>{phase === 'live' ? `Remaining: ${formatClock(left)}` : 'Clock starts on microphone grant'}</span>
            </div>
            {phase === 'live' && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={nextQuestion} disabled={skipLocked} className="py-1.5 text-[12px]">
                  {activeIdx >= questions.length - 1 ? 'Finish' : skipLocked ? 'Moving on…' : 'Next question →'}
                </Button>
                <Button variant="secondary" onClick={() => void finish()} className="py-1.5 text-[12px]">
                  End interview
                </Button>
              </div>
            )}
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

  if (!data) return <PageState loading={loading} error={error} />;
  const { interview } = data;
  const activity = data.activity ?? [];
  const profile = me?.public_profile;
  const publicUrl = profile?.slug ? `${window.location.origin}/p/${profile.slug}` : null;

  return (
    <div className="space-y-8">
      {/* Top Stage Controller */}
      {interview.status === 'completed' && (
        <PrintMasthead
          kind="Voice interview report"
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
            <Link to="/interview/new" className="text-accent hover:underline">
              ← MY INTERVIEWS
            </Link>
            <span>•</span>
            <span>DOSSIER #{interview.id.slice(0, 8).toUpperCase()}</span>
            {interview.commit_sha && (
              <>
                <span>•</span>
                <span className="rounded-[3px] border border-line bg-white px-2 py-0.5 text-ink">
                  COMMIT <code>{interview.commit_sha.slice(0, 7)}</code>
                </span>
              </>
            )}
          </div>
        }
        title={`Oral Verification: ${interview.repo.owner}/${interview.repo.name}`}
        subtitle={interview.summary}
        rightSlot={
          <a
            href={interview.repo.url}
            target="_blank"
            rel="noreferrer"
            className="btn-tactile font-mono-code inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border border-line bg-white px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
          >
            <span>Inspect GitHub Repo</span>
            <span>↗</span>
          </a>
        }
      />

      {/* Stage 01: Preparing Repository & Questions */}
      {interview.status === 'preparing' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-white p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label="Reading the repository and preparing your code-anchored questions" />
            <p className="text-[13px] text-muted">
              This takes about a minute. You can leave this page open; it will advance automatically.
            </p>
          </div>
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {/* Error State */}
      {interview.status === 'error' && (
        <div className="space-y-4">
          <Notice tone="error">{interview.error || 'This interview could not be completed.'}</Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>
            Start another interview
          </Link>
        </div>
      )}

      {/* Stage 02 & 03: Ready / In Progress Live Cockpit */}
      {(interview.status === 'ready' || interview.status === 'in_progress') &&
        (interview.is_owner ? (
          <Room data={data} onChanged={reload} onLiveChange={setLiveActive} />
        ) : (
          <Notice>The candidate has not finished this interview yet.</Notice>
        ))}

      {/* Stage 04: Evaluating Transcript */}
      {interview.status === 'evaluating' && (
        <section className="space-y-5 rounded-[6px] border border-line bg-white p-6">
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-center">
            <Spinner label="Synthesizing your ownership score and pinning verbatim transcript evidence" />
            <p className="text-[13px] text-muted">Usually completes in under a minute.</p>
          </div>
          {interview.error && <Notice tone="warn">{interview.error}</Notice>}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </section>
      )}

      {/* Stage 05: Completed Verified Skills Report Dossier */}
      {interview.status === 'completed' && data.report && (
        <>
          <article
            id="verified-dossier-report"
            className="overflow-hidden rounded-[6px] border border-line bg-white"
          >
            {/* Official Credential Header Block */}
            <header className="space-y-4 border-b border-line bg-white p-6 sm:p-8">
              <div className="font-mono-code flex flex-col justify-between gap-2 text-[11px] text-muted md:flex-row md:items-center">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="status-dot-live bg-good text-good" />
                  <span className="font-bold tracking-wider text-ink uppercase">SkillProof Verified Credential</span>
                  <span>•</span>
                  <span className="rounded-[2px] border border-line bg-paper px-2 py-0.5">
                    DOSSIER #SP-{interview.id.slice(0, 6).toUpperCase()}
                  </span>
                </div>
                <div className="rounded-[3px] border border-good/30 bg-good-soft px-2.5 py-0.5 font-medium text-good">
                  {interview.created_at ? `ISSUED ${formatDate(interview.created_at).toUpperCase()} • ` : ''}
                  COMMIT: {interview.commit_sha?.slice(0, 7) ?? 'HEAD'}
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
                    Repository Defense: <strong className="text-ink">{interview.repo.owner}/{interview.repo.name}</strong>
                    {me?.public_profile?.headline ? ` • ${me.public_profile.headline}` : ''}
                  </p>
                </div>

                <span className="font-mono-code inline-flex items-center gap-1.5 self-start rounded-[3px] border border-good/30 bg-good-soft px-3 py-1.5 text-[11px] font-bold text-good md:self-auto">
                  <span className="material-symbols-outlined text-[15px]">verified</span>
                  <span>VERIFICATION COMPLETED</span>
                </span>
              </div>
            </header>

            <div className="p-6 sm:p-8">
              {data.focus_summary && (
                <div className="print-avoid-break mb-5">
                  <Notice tone="warn">
                    {data.focus_summary} This is recorded as a signal for reviewers; it is not a finding of misconduct.
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
                  <span>EVALUATED WITH:</span>
                  <ModelsUsed models={interview.models_used} primary={interview.primary_models} />
                </div>
              )}
            </div>

            {/* Attestation Footer Action Bar */}
            <footer className="flex flex-col justify-between gap-4 border-t border-line bg-[#FBFDFB] p-6 md:flex-row md:items-center">
              <div className="flex flex-wrap items-center gap-3">
                {interview.is_owner && profile && (
                  <Link
                    to={profile.is_public ? `/p/${profile.slug}` : '/me'}
                    className="btn-tactile inline-flex items-center gap-2 rounded-[4px] border border-ink bg-ink px-4 py-2 text-[13px] font-medium text-white hover:border-accent hover:bg-accent"
                  >
                    <span className="material-symbols-outlined text-[16px]">public</span>
                    <span>
                      {profile.is_public ? 'Open Public Recruiter Profile' : 'Enable Public Recruiter Profile'}
                    </span>
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-tactile inline-flex cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper"
                >
                  <span className="material-symbols-outlined text-[16px] text-good">print</span>
                  <span>Print / Save PDF Dossier</span>
                </button>
              </div>

              {interview.is_owner && profile?.is_public && publicUrl && (
                <CopyLinkButton
                  value={publicUrl}
                  label="Copy Recruiter Access Link"
                  copiedLabel="COPIED RECRUITER LINK!"
                />
              )}
            </footer>
          </article>

          {interview.is_owner && profile && !profile.is_public && (
            <Notice tone="info">
              Your profile is currently private.{' '}
              <Link to="/me" className="font-semibold text-accent underline">
                Make it public in Account Settings
              </Link>{' '}
              to share this verified report with recruiters.
            </Notice>
          )}

          {data.transcript && data.transcript.length > 0 && (
            <section className="rounded-[6px] border border-line bg-white p-5">
              <details>
                <summary className="font-mono-code cursor-pointer text-[12px] font-semibold tracking-wider text-ink uppercase">
                  Inspect Full Verbatim Transcript ({data.transcript.length} exchanges)
                </summary>
                <ol className="mt-4 space-y-2.5 border-t border-line pt-4 text-[13px]">
                  {data.transcript.map((t, i) => (
                    <li
                      key={i}
                      className={`rounded-[4px] border border-line p-3 ${
                        t.role === 'interviewer' ? 'bg-paper/60' : t.role === 'system' ? 'bg-warn-soft/40' : 'bg-white'
                      }`}
                    >
                      <div className="font-mono-code mb-1 flex items-center justify-between text-[10px] text-muted uppercase">
                        <span className={t.role === 'interviewer' ? 'font-bold text-accent' : t.role === 'system' ? 'font-bold text-warn' : 'font-bold text-good'}>
                          {t.role === 'interviewer' ? 'AI Technical Examiner' : t.role === 'system' ? 'SkillProof' : 'Candidate'}
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
