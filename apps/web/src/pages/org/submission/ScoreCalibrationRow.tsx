import type { Rubric } from '@skillproof/shared';
import { useState } from 'react';
import { Badge, Select, scoreTone } from '../../../components/shared';
import { useToast } from '../../../components/toast';
import { tr } from '../../../i18n';
import { api, errorMessage } from '../../../lib/api';
import { evidenceLink, evidenceTitle } from '../../../lib/evidence';
import type { ScoreView } from '../../../lib/types';

export function ScoreCalibrationRow({
  index,
  score,
  criterion,
  repoUrl,
  sha,
  videoUrl,
  canOverride,
  onSaved,
  scorePath = '/api/scores',
}: {
  index: number;
  score: ScoreView;
  criterion: Rubric[number] | undefined;
  repoUrl: string | null;
  sha: string | null;
  /** The demo video of the judged version: timestamps in the evidence open it at that moment. */
  videoUrl: string | null;
  canOverride: boolean;
  onSaved: () => void;
  /** /api/scores for events, /api/assignment-scores for course assignments. */
  scorePath?: string;
}) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const effective = score.override_score ?? score.ai_score;
  const isOverridden = score.override_score != null;

  async function save(value: string) {
    setBusy(true);
    try {
      await api(`${scorePath}/${score.id}`, {
        method: 'PATCH',
        body: { override_score: value === '' ? null : Number(value) },
      });
      toast.success(
        value === '' ? tr('Back to the AI score.') : tr('Score changed to {value}. The total is updated.', { value }),
      );
      onSaved();
    } catch (err) {
      toast.error(tr('The score was not saved. {error}', { error: errorMessage(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`space-y-2.5 rounded-[4px] border p-3.5 transition-colors ${
        isOverridden ? 'border-accent/40 bg-accent-soft/35' : 'border-line bg-paper/60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono-code text-[11px] font-bold text-ink">
            {index + 1}. {criterion?.name ?? score.criterion_key}
          </span>
          {criterion && (
            <span className="font-mono-code text-[10px] text-muted">({criterion.weight}%)</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-code rounded-[3px] border border-line bg-surface px-1.5 py-0.5 text-[10px] text-muted">
            {tr('AI:')}{' '}{score.ai_score ?? '–'}
          </span>
          <Badge tone={scoreTone(effective)}>{effective ?? '–'}/10</Badge>
          {isOverridden && <Badge tone="accent">{tr('Changed by you')}</Badge>}
        </div>
      </div>

      {canOverride && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              disabled={busy}
              value={effective ?? 5}
              onChange={(e) => void save(e.target.value)}
              aria-label={tr('Slider for {criterion}', { criterion: criterion?.name ?? score.criterion_key })}
              className="h-1.5 w-full cursor-pointer accent-accent"
            />
            <Select
              aria-label={tr('Your score for {criterion}', { criterion: criterion?.name ?? score.criterion_key })}
              className="font-mono-code h-8 w-auto bg-surface px-2 py-1 text-[11px] font-bold"
              disabled={busy}
              value={score.override_score ?? ''}
              onChange={(e) => void save(e.target.value)}
            >
              <option value="">{tr('Keep AI (')}{score.ai_score ?? '–'})</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} / 10
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <p className="text-[12px] leading-relaxed text-muted">{score.justification}</p>

      {score.evidence_json.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
          <span className="font-mono-code text-[10px] text-muted uppercase">{tr('Evidence:')}</span>
          {score.evidence_json.map((item) => {
            const ev = evidenceLink(item, { repoUrl, sha, videoUrl });
            return ev.href ? (
              <a
                key={item}
                href={ev.href}
                target="_blank"
                rel="noreferrer"
                title={evidenceTitle(ev)}
                className="font-mono-code inline-flex items-center gap-1 rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-accent hover:underline"
              >
                {ev.kind === 'video' && <span className="material-symbols-outlined text-[13px]" aria-hidden="true">play_circle</span>}
                {ev.label}
              </a>
            ) : (
              <code
                key={item}
                title={evidenceTitle(ev)}
                className="font-mono-code inline-flex items-center gap-1 rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink"
              >
                {ev.kind === 'video' && <span className="material-symbols-outlined text-[13px]" aria-hidden="true">play_circle</span>}
                {ev.label}
              </code>
            );
          })}
        </div>
      )}
    </li>
  );
}
