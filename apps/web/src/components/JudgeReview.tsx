import { tr } from '../i18n';
import type { Rubric } from '@skillproof/shared';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Notice, Select, SkeletonCard, Textarea, formatDate } from './shared';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api';
import { useLoad } from '../lib/useLoad';

interface CriterionScore {
  criterion_key: string;
  score: number;
  note: string;
}

interface ReviewRow {
  id: string;
  judge_id: string;
  scores_json: CriterionScore[];
  note: string;
  status: 'draft' | 'submitted';
  updated_at: string;
  profiles?: { display_name: string } | null;
}

/** Weighted total of a judge's scores on the same 0–100 scale as the AI total, or null when incomplete. */
export function reviewTotal(rubric: Rubric, scores: CriterionScore[]): number | null {
  if (rubric.length === 0 || scores.length < rubric.length) return null;
  let sum = 0;
  let weights = 0;
  for (const c of rubric) {
    const s = scores.find((x) => x.criterion_key === c.key);
    if (!s) return null;
    sum += s.score * 10 * c.weight;
    weights += c.weight;
  }
  return weights ? sum / weights : null;
}

/**
 * The judge's own scores for one submission, apart from the AI scores and the final override.
 * Changes are saved as a draft a moment after typing stops; "Submit review" sends it to the organizer.
 */
export function JudgeReviewCard({ submissionId, rubric, locked }: { submissionId: string; rubric: Rubric; locked: boolean }) {
  const toast = useToast();
  const { data, error, loading } = useLoad<{ review: ReviewRow | null }>(`/api/submissions/${submissionId}/review`);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'draft' | 'submitted'>('draft');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncedData, setSyncedData] = useState(data);
  const dirty = useRef(false);

  if (data !== syncedData) {
    setSyncedData(data);
    const r = data?.review;
    setScores(Object.fromEntries((r?.scores_json ?? []).map((s) => [s.criterion_key, s.score])));
    setNotes(Object.fromEntries((r?.scores_json ?? []).map((s) => [s.criterion_key, s.note])));
    setNote(r?.note ?? '');
    setStatus(r?.status ?? 'draft');
    setSavedAt(r?.updated_at ?? null);
  }

  useEffect(() => {
    dirty.current = false;
  }, [data]);

  async function save(nextStatus: 'draft' | 'submitted') {
    setSaving(true);
    try {
      const body = {
        scores: rubric.filter((c) => scores[c.key]).map((c) => ({ criterion_key: c.key, score: scores[c.key]!, note: notes[c.key] ?? '' })),
        note,
        status: nextStatus,
      };
      const res = await api<{ review: ReviewRow }>(`/api/submissions/${submissionId}/review`, { method: 'PUT', body });
      dirty.current = false;
      setStatus(res.review.status);
      setSavedAt(res.review.updated_at);
      if (nextStatus === 'submitted') toast.success(tr('Review submitted to the organizer.'));
    } catch (err) {
      toast.error(tr('Could not save your review. {error}', { error: errorMessage(err) }));
    } finally {
      setSaving(false);
    }
  }

  // Draft autosave, 1.5 s after the last change.
  useEffect(() => {
    if (!dirty.current || locked) return;
    const t = setTimeout(() => void save(status === 'submitted' ? 'submitted' : 'draft'), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, notes, note]);

  const touch = () => (dirty.current = true);
  const complete = rubric.every((c) => scores[c.key]);
  const total = reviewTotal(rubric, rubric.filter((c) => scores[c.key]).map((c) => ({ criterion_key: c.key, score: scores[c.key]!, note: '' })));

  if (loading) return <SkeletonCard />;
  if (error) return <Notice tone="error">{error}</Notice>;

  return (
    <div className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <h3 className="font-serif-heading text-[18px] font-medium text-ink">{tr('Your review')}</h3>
        <Badge tone={status === 'submitted' ? 'good' : 'neutral'}>{status === 'submitted' ? tr('SUBMITTED') : tr('DRAFT')}</Badge>
      </div>
      {locked && <Notice tone="info">{tr('Results are published, so reviews can no longer change.')}</Notice>}
      <ul className="space-y-2.5">
        {rubric.map((c) => (
          <li key={c.key} className="space-y-1.5 rounded-[4px] border border-line bg-paper/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{c.name}</span>
              <Select
                aria-label={tr('Your score for {criterion}', { criterion: c.name })}
                className="h-8 w-20 bg-surface text-[12px]"
                disabled={locked}
                value={scores[c.key] ?? ''}
                onChange={(e) => {
                  touch();
                  setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }));
                }}
              >
                <option value="">–</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
            <input
              aria-label={tr('Note for {criterion}', { criterion: c.name })}
              disabled={locked}
              value={notes[c.key] ?? ''}
              onChange={(e) => {
                touch();
                setNotes((n) => ({ ...n, [c.key]: e.target.value }));
              }}
              placeholder={tr('Why this score (optional)')}
              className="w-full rounded-[4px] border border-line bg-surface px-2 py-1 text-[12px]"
            />
          </li>
        ))}
      </ul>
      <Textarea
        rows={3}
        disabled={locked}
        value={note}
        onChange={(e) => {
          touch();
          setNote(e.target.value);
        }}
        placeholder={tr('Overall note for the organizer')}
        aria-label={tr('Overall note')}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono-code text-[11px] text-muted">
          {saving ? tr('Saving…') : savedAt ? tr('Saved {date}', { date: formatDate(savedAt) }) : tr('Not saved yet')}
          {total != null && <>{' '}{tr('· your total')}{' '}{total.toFixed(1)} / 100</>}
        </span>
        <Button type="button" disabled={locked || saving || !complete} loading={saving} onClick={() => void save('submitted')}>
          {status === 'submitted' ? tr('Submit again') : tr('Submit review')}
        </Button>
      </div>
      {!complete && !locked && <p className="text-[11px] text-muted">{tr('Score every criterion to submit.')}</p>}
    </div>
  );
}

/** Every judge's review of one submission, for the organizer. */
export function JudgeReviewsList({ submissionId, rubric }: { submissionId: string; rubric: Rubric }) {
  const { data, error, loading } = useLoad<{ reviews: ReviewRow[] }>(`/api/submissions/${submissionId}/reviews`);
  if (loading) return <SkeletonCard />;
  if (error) return <Notice tone="error">{error}</Notice>;
  const reviews = data?.reviews ?? [];
  return (
    <div className="space-y-3 rounded-[6px] border border-line bg-surface p-5">
      <h3 className="font-serif-heading border-b border-line pb-2.5 text-[18px] font-medium text-ink">{tr('Judge reviews')}</h3>
      {reviews.length === 0 ? (
        <p className="text-[13px] text-muted">{tr('No judge has reviewed this submission yet. Assign judges from the event console.')}</p>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => {
            const t = reviewTotal(rubric, r.scores_json);
            return (
              <li key={r.id} className="space-y-1 rounded-[4px] border border-line bg-paper/60 p-2.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-ink">{r.profiles?.display_name || tr('Judge')}</span>
                  <span className="flex items-center gap-2">
                    {t != null && <span className="font-mono-code font-bold text-ink">{t.toFixed(1)}</span>}
                    <Badge tone={r.status === 'submitted' ? 'good' : 'neutral'}>{r.status.toUpperCase()}</Badge>
                  </span>
                </div>
                {r.note && <p className="text-muted">{r.note}</p>}
                <p className="font-mono-code text-[10px] text-muted">{tr('Updated')}{' '}{formatDate(r.updated_at)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
