import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { ActivityEntry, PublicQuestion, TranscriptEntry } from '@skillproof/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AiActivity, ModelsUsed } from '../components/AiActivity';
import { Report, type ReportView } from '../components/Report';
import { Badge, Button, Card, Notice, PageState, Spinner, linkButtonSecondary } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { MIC_MIME, Speaker, startMic } from '../lib/liveAudio';
import { useLoad } from '../lib/useLoad';

interface InterviewResponse {
  interview: {
    id: string;
    status: 'preparing' | 'ready' | 'in_progress' | 'evaluating' | 'completed' | 'error';
    error: string | null;
    submission_id: string | null;
    repo: { owner: string; name: string; url: string };
    commit_sha: string | null;
    summary: string | null;
    is_owner: boolean;
    models_used?: string[];
  };
  activity?: ActivityEntry[];
  seconds: number;
  questions: PublicQuestion[];
  transcript: TranscriptEntry[] | null;
  report: ReportView | null;
}

interface LiveToken {
  token: string;
  model: string;
  api_version: string;
  seconds: number;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Seconds the interviewer gets to say goodbye once the clock runs out. */
const WRAP_UP_SECONDS = 12;

function Room({ data, onChanged }: { data: InterviewResponse; onChanged: () => void }) {
  const { interview, questions } = data;
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'live' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(data.seconds);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [caption, setCaption] = useState('');

  const transcript = useRef<TranscriptEntry[]>([]);
  const questionId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const finished = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
  }, []);
  useEffect(() => teardown, [teardown]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    teardown();
    setPhase('sending');
    const entries = transcript.current
      .map((t) => ({ ...t, text: t.text.trim().slice(0, 8000) }))
      .filter((t) => t.text)
      .slice(0, 400);
    const duration = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
    try {
      await api(`/api/interviews/${interview.id}/finish`, { body: { transcript: entries, duration_s: duration } });
      onChanged();
    } catch (err) {
      finished.current = false;
      setError(errorMessage(err));
      setPhase('idle');
    }
  }, [interview.id, onChanged, teardown]);

  async function start() {
    setError(null);
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
      // Let the goodbye that is already buffered play out before leaving the room.
      if (ended) timers.push(setTimeout(() => void finish(), Math.min(8000, speaker.pending() * 1000 + 600)));
    };

    try {
      // Ask for the microphone before spending the single-use token.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      await speaker.resume();
      const live = await api<LiveToken>(`/api/interviews/${interview.id}/token`, { method: 'POST' });
      const ai = new GoogleGenAI({ apiKey: live.token, httpOptions: { apiVersion: live.api_version } });
      session = await ai.live.connect({
        model: live.model,
        // The system prompt, tools and transcription are fixed by the server inside the token.
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: onMessage,
          onerror: () => undefined,
          onclose: () => {
            if (closedByUs || finished.current) return;
            // The connection dropped. Keep what was said if the interview was well under way.
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
      stopMic = await startMic(stream, (data) => {
        try {
          open.sendRealtimeInput({ audio: { data, mimeType: MIC_MIME } });
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
          open.sendRealtimeInput({ text: 'Time is up. Thank the candidate in one sentence and call end_interview now.' });
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
      setError(denied ? 'SkillProof needs your microphone for the interview. Allow it in your browser and try again.' : errorMessage(err));
      setPhase('idle');
    }
  }

  if (phase === 'sending') return <div className="py-16 text-center"><Spinner label="Saving your interview" /></div>;

  if (phase === 'live' || phase === 'connecting') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={phase === 'live' ? 'good' : 'neutral'}>{phase === 'live' ? 'Live' : 'Connecting'}</Badge>
          <span className="text-2xl font-semibold tabular-nums" aria-label="Time left">{clock(left)}</span>
          <Button variant="secondary" className="ml-auto" onClick={() => void finish()} disabled={phase !== 'live'}>
            End interview
          </Button>
        </div>
        {phase === 'connecting' && <Spinner label="Connecting to the interviewer" />}
        {question ? (
          <Card>
            <p className="text-sm font-medium">{question.question}</p>
            <p className="mt-3 text-xs text-muted">
              {question.path} · lines {question.start_line}–{question.end_line}
            </p>
            <pre className="mt-1 max-h-[26rem] overflow-auto rounded-lg bg-ink p-3 text-xs leading-relaxed text-white"><code>{question.snippet}</code></pre>
          </Card>
        ) : (
          phase === 'live' && <Card className="text-sm text-muted">The interviewer is about to ask the first question. The code it refers to will appear here.</Card>
        )}
        {caption && <p className="text-sm text-muted" aria-live="polite"><span className="font-medium text-ink">Interviewer:</span> {caption.slice(-280)}</p>}
      </div>
    );
  }

  const resuming = interview.status === 'in_progress';
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{resuming ? 'This interview is in progress' : 'Before you start'}</h2>
      {resuming ? (
        <p className="text-sm text-muted">
          If you lost the connection you can reconnect within two minutes of starting. Otherwise end it to get a report on what was recorded in this tab.
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>It lasts {Math.round(data.seconds / 60)} minutes and has about {questions.length} questions about your own code.</li>
          <li>You speak, the interviewer listens and follows up. Use headphones in a quiet place if you can.</li>
          <li>Your audio is not stored. The written transcript is stored and used to write your report.</li>
          {interview.submission_id && <li>The organizer of the event can read the transcript and the report.</li>}
          <li>You can take it once per attempt. The clock starts when you press the button.</li>
        </ul>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void start()}>{resuming ? 'Reconnect' : 'Allow microphone and start'}</Button>
        {resuming && <Button variant="secondary" onClick={() => void finish()}>End and get my report</Button>}
      </div>
    </Card>
  );
}

export function InterviewPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const { data, error, loading, reload } = useLoad<InterviewResponse>(
    `/api/interviews/${id}`,
    (d) => d.interview.status === 'preparing' || d.interview.status === 'evaluating',
  );
  if (!data) return <PageState loading={loading} error={error} />;
  const { interview } = data;
  const activity = data.activity ?? [];
  const profile = me?.public_profile;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Interview on {interview.repo.owner}/{interview.repo.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {interview.commit_sha && <>At commit <code>{interview.commit_sha.slice(0, 7)}</code>. </>}
          {interview.summary}
        </p>
      </header>

      {interview.status === 'preparing' && (
        <Card className="space-y-4">
          <div className="text-center">
            <Spinner label="Reading the repository and preparing your questions" />
            <p className="mt-2 text-sm text-muted">This takes about a minute. You can leave this page open.</p>
          </div>
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </Card>
      )}

      {interview.status === 'error' && (
        <div className="space-y-3">
          <Notice tone="error">{interview.error || 'This interview could not be completed.'}</Notice>
          <Link to="/interview/new" className={linkButtonSecondary}>Start another interview</Link>
        </div>
      )}

      {(interview.status === 'ready' || interview.status === 'in_progress') &&
        (interview.is_owner ? <Room data={data} onChanged={reload} /> : <Notice>The candidate has not finished this interview yet.</Notice>)}

      {interview.status === 'evaluating' && (
        <Card className="space-y-4">
          <div className="text-center">
            <Spinner label="Writing the report" />
            <p className="mt-2 text-sm text-muted">Usually under a minute.</p>
          </div>
          {interview.error && <Notice tone="warn">{interview.error}</Notice>}
          {activity.length > 0 && <AiActivity entries={activity} live />}
        </Card>
      )}

      {interview.status === 'completed' && data.report && (
        <>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Skills report</h2>
            <Report report={data.report} />
            {interview.models_used && interview.models_used.length > 0 && (
              <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-muted">
                Written with <ModelsUsed models={interview.models_used} />
              </p>
            )}
          </Card>
          {interview.is_owner && profile && (
            <Notice tone={profile.is_public ? 'good' : 'info'}>
              {profile.is_public ? (
                <>This report is on your public profile: <Link to={`/p/${profile.slug}`} className="font-medium underline">/p/{profile.slug}</Link></>
              ) : (
                <>Your profile is private. <Link to="/me" className="font-medium underline">Make it public</Link> to share this report with recruiters.</>
              )}
            </Notice>
          )}
          {data.transcript && data.transcript.length > 0 && (
            <Card>
              <details>
                <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
                <ol className="mt-3 space-y-2 text-sm">
                  {data.transcript.map((t, i) => (
                    <li key={i}>
                      <span className="font-medium">{t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}:</span>{' '}
                      <span className="text-muted">{t.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
