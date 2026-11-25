import type { FormEvent } from 'react';
import { MatchingCode } from '../../../components/MatchingCode';
import {
  Button,
  NumberedSectionCard,
  SIMILARITY_SIGNAL_LABEL,
  Textarea,
  VERDICT_LABEL,
  formatDate,
} from '../../../components/shared';
import { tr } from '../../../i18n';
import type { Flag, IntegrityDecisionRow, IntegrityMatchRow, VerdictOption } from './types';

export function AuditorDecisionCard({
  activeFlag,
  canDecide,
  signerName,
  verdict,
  onVerdictChange,
  notes,
  onNotesChange,
  savingDecision,
  onSubmitVerdict,
  onExportJson,
  integrityLoading,
  integrityError,
  flagDecisions,
  flagMatches,
}: {
  activeFlag: Flag | null;
  canDecide: boolean;
  signerName: string | undefined;
  verdict: VerdictOption;
  onVerdictChange: (v: VerdictOption) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  savingDecision: boolean;
  onSubmitVerdict: (e: FormEvent) => void;
  onExportJson: () => void;
  integrityLoading: boolean;
  integrityError: string | null;
  flagDecisions: readonly IntegrityDecisionRow[];
  flagMatches: IntegrityMatchRow[];
}) {
  const latestDecision = flagDecisions[0] ?? null;

  return (
    <>
      <NumberedSectionCard
        number="AD"
        icon="gavel"
        title={tr('Auditor Decision & Sanction Protocol')}
        subtitle={tr('Record your evidentiary determination after inspecting both repositories and oral defense transcripts.')}
        sectionTag={latestDecision ? tr('LAST: {verdict}', { verdict: (VERDICT_LABEL[latestDecision.verdict] ?? latestDecision.verdict).toUpperCase() }) : tr('FORMAL ADJUDICATION')}
        theme="warn"
      >
        <form onSubmit={onSubmitVerdict} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-5">
            <span className="font-mono-code block text-[11px] font-bold tracking-wider text-muted uppercase">
              {tr('Select Adjudication Determination:')}
            </span>
            {(
              [
                {
                  key: 'direct_plagiarism',
                  title: tr('Direct Unauthorized Plagiarism'),
                  desc: tr('Submission B systematically copied or renamed code from Submission A.'),
                },
                {
                  key: 'collusion',
                  title: tr('Coordinated Unauthorized Collaboration'),
                  desc: tr('Both parties jointly developed core logic in violation of assessment rules.'),
                },
                {
                  key: 'starter_template',
                  title: tr('Shared Canonical Boilerplate / Starter Code'),
                  desc: tr('Overlap originates from a public framework or permitted starter kit.'),
                },
                {
                  key: 'independent_invention',
                  title: tr('Independent Invention (Dismiss Flag)'),
                  desc: tr('Algorithmic constraints explain the similarity. No penalty applied.'),
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.key}
                className={`flex cursor-pointer items-start gap-3 rounded-[4px] border p-3 transition-colors ${
                  verdict === opt.key ? 'border-accent bg-accent-soft/45' : 'border-line bg-paper/45 hover:bg-paper'
                }`}
              >
                <input
                  type="radio"
                  name="adjudication_verdict"
                  checked={verdict === opt.key}
                  onChange={() => onVerdictChange(opt.key)}
                  className="mt-1 accent-accent"
                />
                <div>
                  <span className="block text-[13px] font-semibold text-ink">{opt.title}</span>
                  <span className="block text-[11px] leading-snug text-muted">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="flex flex-col justify-between space-y-4 lg:col-span-7">
            <div className="space-y-1.5">
              <label
                htmlFor="auditor_notes"
                className="font-mono-code block text-[11px] font-bold tracking-wider text-muted uppercase"
              >
                {tr('Auditor Findings & Evidentiary Justification')}
              </label>
              <Textarea
                id="auditor_notes"
                rows={6}
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder={tr('Document specific file overlaps, commit history observations, and oral defense comparison notes...')}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <div className="font-mono-code text-[11px] text-muted">
                {tr('SIGNER:')}{' '}<strong className="text-ink">{signerName || tr('Lead Auditor')}</strong>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Button type="button" variant="secondary" onClick={onExportJson}>
                  {tr('Export Forensic JSON')}
                </Button>
                <Button
                  type="submit"
                  disabled={!canDecide || !activeFlag || savingDecision}
                  loading={savingDecision}
                  variant={verdict === 'independent_invention' ? 'primary' : 'danger'}
                >
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  <span>{savingDecision ? tr('Recording…') : tr('Confirm Forensic Determination')}</span>
                </Button>
              </div>
            </div>
            {!activeFlag && <p className="text-[12px] text-muted">{tr('Pick a flagged pair to record a decision. Pairs compared by hand have no flag to decide on.')}</p>}
            {activeFlag && !canDecide && <p className="text-[12px] text-muted">{tr('Your role cannot record integrity decisions.')}</p>}
          </div>
        </form>

        <div className="mt-6 space-y-2 border-t border-line pt-4">
          <div className="font-mono-code text-[11px] font-semibold tracking-wider text-muted uppercase">{tr('Decision history')}</div>
          {integrityLoading ? (
            <p className="text-[12px] text-muted">{tr('Loading decisions…')}</p>
          ) : integrityError ? (
            <p className="text-[12px] text-bad">{integrityError}</p>
          ) : flagDecisions.length === 0 ? (
            <p className="text-[12px] text-muted">{tr('No decision recorded for this pair yet.')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-[4px] border border-line">
              {flagDecisions.map((d) => (
                <li key={d.id} className="space-y-0.5 px-3 py-2 text-[12px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono-code font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                    <span className="text-muted">
                      {tr('by {name} · {date}', { name: d.profiles?.display_name || tr('a reviewer'), date: formatDate(d.created_at) })}
                    </span>
                  </div>
                  {d.note && <p className="text-muted">{d.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </NumberedSectionCard>

      <NumberedSectionCard
        id="section-matches"
        number="M"
        icon="difference"
        title={tr('Matching Code')}
        subtitle={tr('Fragments that are the same in both repositories.')}
        sectionTag={tr('{n} FRAGMENTS', { n: flagMatches.length })}
        theme="neutral"
      >
        {flagMatches.length === 0 ? (
          <p className="text-[13px] text-muted">
            {tr('File comparison is not available yet. This flag comes from the signal "{signal}", not from comparing file contents.', {
              signal: activeFlag ? SIMILARITY_SIGNAL_LABEL[activeFlag.signal] : tr('Similarity'),
            })}
          </p>
        ) : (
          <MatchingCode matches={flagMatches} scope="event" labelA={tr('Submission A')} labelB={tr('Submission B')} />
        )}
      </NumberedSectionCard>
    </>
  );
}
