/**
 * Forensic comparison of two submissions of a course assignment: why they were flagged, the code they share
 * (side by side, at the frozen commits) and the integrity verdict on the pair.
 * Route: /org/courses/:courseId/assignments/:id/compare?flag=<flag id>
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MatchingCode, type MatchRow } from '../../components/MatchingCode';
import { Badge, Button, DossierPageHeader, NumberedSectionCard, Notice, PageState, SIMILARITY_SIGNAL_LABEL, Select, Textarea, formatDate } from '../../components/shared';
import { useToast } from '../../components/toast';
import { tr } from '../../i18n';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { AssignmentConsoleResponse, SimilarityFlag } from '../../lib/courses';
import { useLoad } from '../../lib/useLoad';
import { VERDICT_LABEL } from '../../components/shared';

interface IntegrityResponse {
  flags: SimilarityFlag[];
  matches: (MatchRow & { flag_id: string })[];
  decisions: { id: string; assignment_flag_id: string | null; verdict: string; note: string; created_at: string; profiles: { display_name: string } | null }[];
}

const PAIR_VERDICTS = ['direct_plagiarism', 'collusion', 'starter_template', 'independent_invention'] as const;

export function AssignmentCompare() {
  const { courseId = '', id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { org } = useAuth();
  const toast = useToast();
  const canDecide = !!org?.permissions.includes('integrity.decide');
  const consoleData = useLoad<AssignmentConsoleResponse>(`/api/assignments/${id}/console`);
  const integrity = useLoad<IntegrityResponse>(`/api/assignments/${id}/integrity`);
  const [verdict, setVerdict] = useState<(typeof PAIR_VERDICTS)[number]>('independent_invention');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (!consoleData.data || !integrity.data) return <PageState loading={consoleData.loading || integrity.loading} error={consoleData.error ?? integrity.error} kind="detail" />;
  const { assignment, submissions } = consoleData.data;
  const flags = integrity.data.flags;
  const flag = flags.find((f) => f.id === params.get('flag')) ?? flags[0] ?? null;
  const labelOf = (sid: string) => submissions.find((s) => s.id === sid)?.label ?? tr('Submission');
  const matches = flag ? integrity.data.matches.filter((m) => m.flag_id === flag.id) : [];
  const history = flag ? integrity.data.decisions.filter((d) => d.assignment_flag_id === flag.id) : [];

  async function decide() {
    if (!flag) return;
    setBusy('verdict');
    try {
      await api('/api/integrity-decisions', { body: { assignment_flag_id: flag.id, verdict, note } });
      toast.success(tr('Verdict saved.'));
      setNote('');
      await integrity.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function recompute() {
    setBusy('recompute');
    try {
      await api(`/api/assignments/${id}/similarity`, { method: 'POST' });
      toast.success(tr('Comparing the code again. Refresh in a minute to see the result.'));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <DossierPageHeader
        eyebrow={
          <Link to={`/org/courses/${courseId}/assignments/${id}`} className="text-accent-ink hover:underline">
            ← {assignment.title.toUpperCase()}
          </Link>
        }
        title={tr('Forensic comparison')}
        subtitle={tr('The code two submissions share, side by side at their frozen commits, and your verdict on the pair.')}
        rightSlot={
          <Button variant="secondary" loading={busy === 'recompute'} disabled={!!busy} onClick={() => void recompute()}>
            {tr('Compare the code again')}
          </Button>
        }
      />

      {flags.length === 0 ? (
        <Notice tone="good">{tr('No similarity between submissions was found.')}</Notice>
      ) : (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-[6px] border border-line bg-surface p-4">
            <label htmlFor="pair" className="text-[13px] font-semibold text-ink">
              {tr('Pair')}
            </label>
            <Select id="pair" value={flag?.id ?? ''} onChange={(e) => setParams({ flag: e.target.value })} className="max-w-xl">
              {flags.map((f) => (
                <option key={f.id} value={f.id}>
                  {labelOf(f.submission_a)} ↔ {labelOf(f.submission_b)} · {SIMILARITY_SIGNAL_LABEL[f.signal]}
                  {f.signal === 'shared_code' ? ` · ${Math.round(Number(f.score) * 100)}%` : ''}
                </option>
              ))}
            </Select>
          </section>

          {flag && (
            <>
              <section className="rounded-[6px] border border-warn-ui bg-warn-soft p-4 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">{SIMILARITY_SIGNAL_LABEL[flag.signal]}</Badge>
                  <strong className="text-ink">{labelOf(flag.submission_a)}</strong>
                  <span className="text-muted">↔</span>
                  <strong className="text-ink">{labelOf(flag.submission_b)}</strong>
                </div>
                {flag.explanation && <p className="mt-2 text-ink">{flag.explanation}</p>}
              </section>

              <NumberedSectionCard number="M" icon="difference" title={tr('Matching Code')} subtitle={tr('Fragments that are the same in both repositories.')} theme="neutral">
                {matches.length ? (
                  <MatchingCode matches={matches} scope="assignment" labelA={labelOf(flag.submission_a)} labelB={labelOf(flag.submission_b)} />
                ) : (
                  <p className="text-[13px] text-muted">{tr('This flag does not come from comparing file contents, so there are no fragments to show.')}</p>
                )}
              </NumberedSectionCard>

              <NumberedSectionCard number="V" icon="gavel" title={tr('Verdict')} subtitle={tr('Recorded with who decided and when.')} theme="accent">
                {canDecide ? (
                  <div className="space-y-3">
                    <Select aria-label={tr('Verdict')} value={verdict} onChange={(e) => setVerdict(e.target.value as typeof verdict)}>
                      {PAIR_VERDICTS.map((v) => (
                        <option key={v} value={v}>
                          {VERDICT_LABEL[v]}
                        </option>
                      ))}
                    </Select>
                    <Textarea rows={3} aria-label={tr('Note')} placeholder={tr('Note (kept in the history)')} value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button loading={busy === 'verdict'} disabled={!!busy} onClick={() => void decide()}>
                      {tr('Save verdict')}
                    </Button>
                  </div>
                ) : (
                  <p className="text-[13px] text-muted">{tr('Your role cannot record integrity decisions.')}</p>
                )}
                {history.length > 0 && (
                  <ul className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px]">
                    {history.map((d) => (
                      <li key={d.id}>
                        <span className="font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                        <span className="text-muted">
                          {' '}
                          · {d.profiles?.display_name ?? tr('a reviewer')} · {formatDate(d.created_at)}
                        </span>
                        {d.note && <p className="text-muted">{d.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </NumberedSectionCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
