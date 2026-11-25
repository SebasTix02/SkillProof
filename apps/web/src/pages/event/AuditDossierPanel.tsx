import { tr } from '../../i18n';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MetricTile,
  Notice,
  WaveformVisualizer,
  linkButton,
} from '../../components/shared';
import { api, errorMessage, existingInterviewId } from '../../lib/api';
import { type EventView } from '../../lib/types';
import { COCKPIT_PREVIEW, type Results } from './types';

export function AuditDossierPanel({
  event,
  mine,
  interview,
  lockedSha,
  myRank,
  totalTeams,
}: {
  event: EventView;
  mine: NonNullable<Results['mine']>;
  interview: Results['interview'];
  lockedSha: string | null;
  myRank: number | null;
  totalTeams: number;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startInterview() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ interview: { id: string } }>('/api/interviews', { body: { submission_id: mine.id } });
      navigate(`/interview/${res.interview.id}`);
    } catch (err) {
      // The frozen commit was already interviewed (for example as a personal interview): open that one.
      const existing = existingInterviewId(err);
      if (existing) navigate(`/interview/${existing}`);
      else setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left 7 Cols: Certified Audit Dossier */}
      <div className="flex flex-col justify-between space-y-5 rounded-[6px] border border-line bg-surface p-6 lg:col-span-7">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[19px] text-good">verified</span>
              <span className="font-mono-code rounded-[3px] border border-good/30 bg-good-soft px-2 py-0.5 text-[11px] font-bold text-good-ink uppercase">
                {tr('Certified Audit Dossier #')}{mine.id.slice(0, 6).toUpperCase()}
              </span>
            </div>
            {myRank != null && (
              <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-ink">
                <span className="material-symbols-outlined text-[14px]">military_tech</span>
                <span>
                  {tr('RANKED #')}{String(myRank).padStart(2, '0')} / {totalTeams}{' '}{tr('COHORTS')}
                </span>
              </span>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="font-serif-heading text-[24px] leading-tight font-medium text-ink">
              {tr('Candidate Performance & Evaluation Brief')}
            </h2>
            <p className="text-[13px] text-muted">
              {tr('Submitted by')}{' '}<strong className="text-ink">{mine.team_name}</strong>
              {lockedSha ? ` • ${tr('Evaluated at frozen commit @{sha}', { sha: lockedSha.slice(0, 7) })}` : ''}.
            </p>
          </div>

          {/* Cockpit Visual Preview Framing */}
          <div className="relative overflow-hidden rounded-[4px] border border-dark-hairline bg-dark-canvas">
            <div className="font-mono-code flex items-center justify-between border-b border-dark-hairline bg-dark-inset px-3 py-1.5 text-[11px] text-dark-muted">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-good-on-dark" />
                <span className="font-medium text-white">{tr('AUTOMATED EVALUATION')}</span>
              </div>
              <span className="text-good-on-dark">{tr('RUBRIC AUDIT: COMPLETED')}</span>
            </div>
            <img
              src={COCKPIT_PREVIEW}
              alt={tr('Technical evaluation cockpit showing repository analysis and verification seal')}
              className="block max-h-[220px] w-full object-cover"
            />
          </div>

          {/* Key Metrics Bento Row */}
          <div className="grid grid-cols-1 gap-3.5 pt-1 sm:grid-cols-2">
            <MetricTile
              label={tr('Final Composite Grade')}
              value={
                <span className="flex items-baseline gap-1.5">
                  <span>{mine.total != null ? mine.total.toFixed(1) : '—'}</span>
                  <span className="font-mono-code text-[12px] font-normal text-muted">/ 100.0</span>
                </span>
              }
              valueClassName="text-[34px] leading-none"
              sub={
                <span className="font-mono-code flex items-center gap-1 pt-0.5 text-[11px] font-bold text-good">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>{tr('WEIGHTED RUBRIC TOTAL')}</span>
                </span>
              }
            />

            <MetricTile
              label={tr('Author Provenance & Voice Match')}
              value={
                <span className="flex items-baseline gap-1.5">
                  <span>{mine.ownership ? mine.ownership.score : '—'}</span>
                  <span className="font-mono-code text-[12px] font-normal text-muted">/ 100.0</span>
                </span>
              }
              valueClassName="text-[34px] leading-none text-accent"
              sub={
                <span className="font-mono-code flex items-center gap-1 pt-0.5 text-[11px] font-bold text-accent">
                  <span className="material-symbols-outlined text-[14px]">fingerprint</span>
                  <span>
                    {mine.ownership
                      ? tr('{level} CONFIDENCE', { level: mine.ownership.confidence.toUpperCase() })
                      : event.interviews_enabled
                        ? tr('VOICE DEFENSE AVAILABLE')
                        : tr('CODE RUBRIC ONLY')}
                  </span>
                </span>
              }
            />
          </div>
        </div>

        {mine.note && <Notice tone="warn">{mine.note}</Notice>}

        <div className="font-mono-code flex flex-wrap items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
          <span>{tr('PUBLISHED BY {name}', { name: event.organization?.name?.toUpperCase() || tr('ORGANIZER') })}</span>
          <span className="font-semibold text-ink">{tr('JUDGED ON THE FROZEN COMMIT')}</span>
        </div>
      </div>

      {/* Right 5 Cols: Dark Audio Dossier Audit & Ownership Interview Panel */}
      <div className="flex flex-col justify-between space-y-5 rounded-[6px] border border-dark-hairline bg-dark-inset p-6 text-white lg:col-span-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span className="font-mono-code inline-flex items-center gap-1.5 rounded-[3px] border border-accent/40 bg-accent/20 px-2.5 py-1 text-[11px] font-semibold tracking-wider text-accent-on-dark uppercase">
              <span className="material-symbols-outlined text-[15px] text-accent-on-dark">mic</span>
              <span>{tr('AUDIO DOSSIER AUDIT')}</span>
            </span>
            <span className="font-mono-code text-[11px] text-white/50">{tr('3:00 ORAL DEFENSE')}</span>
          </div>

          <div className="space-y-1.5">
            <h3 className="font-serif-heading text-[24px] font-medium text-white">{tr('Oral Verification Defense')}</h3>
            <p className="text-[13px] leading-relaxed text-white/70">
              {event.interviews_enabled
                ? tr('A 3-minute voice cross-examination on the code you submitted, verifying first-hand architectural understanding.')
                : tr('Voice interviews were not enabled for this event.')}
            </p>
          </div>

          {/* Stylized Waveform Box */}
          <div className="space-y-3 rounded-[4px] border border-white/10 bg-black/40 p-4">
            <div className="font-mono-code flex items-center justify-between text-[11px] text-white/60">
              <span className="flex items-center gap-1.5 text-good-on-dark">
                <span className="h-2 w-2 rounded-full bg-good-on-dark" />
                <span>
                  {mine.ownership
                    ? tr('Ownership Verified ({score}/100)', { score: mine.ownership.score })
                    : interview
                      ? tr('Interview Status: {status}', { status: interview.status })
                      : tr('Ready for Voice Defense')}
                </span>
              </span>
              <span>{tr('03:00 WINDOW')}</span>
            </div>

            <WaveformVisualizer variant="dark" active={Boolean(mine.ownership)} />

            {event.interviews_enabled && (
              <>
                {mine.ownership && interview ? (
                  <Link
                    to={`/interview/${interview.id}`}
                    className={`${linkButton} w-full py-2.5 text-[13px]`}
                  >
                    <span className="material-symbols-outlined text-[17px]">description</span>
                    <span>{tr('Inspect Oral Defense Report (')}{mine.ownership.score}/100)</span>
                  </Link>
                ) : interview ? (
                  <Link
                    to={`/interview/${interview.id}`}
                    className={`${linkButton} w-full py-2.5 text-[13px]`}
                  >
                    <span className="material-symbols-outlined text-[17px]">mic</span>
                    <span>{tr('Continue Your Voice Interview')}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startInterview()}
                    disabled={busy}
                    className={`${linkButton} w-full cursor-pointer py-2.5 text-[13px] disabled:opacity-50`}
                  >
                    <span className="material-symbols-outlined text-[17px]">mic</span>
                    <span>{busy ? tr('Preparing Interview…') : tr('Prepare My 3-Min Voice Interview')}</span>
                  </button>
                )}
              </>
            )}

            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </div>

        <div className="space-y-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-tactile font-mono-code flex w-full cursor-pointer items-center justify-center gap-2 rounded-[4px] border border-white/15 bg-white/10 py-2 text-[11px] font-medium text-white hover:bg-white/15"
          >
            <span className="material-symbols-outlined text-[15px]">print</span>
            <span>{tr('Print / Save Evaluation Dossier (PDF)')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
