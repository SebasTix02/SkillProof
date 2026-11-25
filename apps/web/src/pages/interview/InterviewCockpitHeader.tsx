import { LiveDot, ScoreBar, WaveformVisualizer, formatClock } from '../../components/shared';
import { tr } from '../../i18n';
import { rich } from '../../i18n/rich';
import { SPECTROGRAM_ASSET, type InterviewResponse, type RoomPhase } from './types';

export function InterviewCockpitHeader({
  data,
  phase,
  left,
  bars,
  resuming,
  onEndOrFinish,
}: {
  data: InterviewResponse;
  phase: RoomPhase;
  left: number;
  bars: number[];
  resuming: boolean;
  onEndOrFinish: () => void;
}) {
  const { interview, questions } = data;

  return (
    <>
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
              onClick={onEndOrFinish}
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
    </>
  );
}
