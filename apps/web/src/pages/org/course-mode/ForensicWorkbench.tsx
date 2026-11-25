import type { Rubric } from '@skillproof/shared';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  ScoreBar,
  Select,
  Textarea,
  VERDICT_LABEL,
  WaveformVisualizer,
  formatDate,
  linkButtonSecondary,
  scoreTone,
} from '../../../components/shared';
import { tr } from '../../../i18n';
import { STATUS_LABEL, type ScoreView } from '../../../lib/types';
import type { Analysis, ConsoleSubmission, IntegrityDecision, Target, VerdictChoice } from './types';

export function ForensicWorkbench({
  target,
  selectedSummary,
  isFlagged,
  interview,
  selectedAnalysis,
  selectedScores,
  selectedRubric,
  canOverride,
  canDecide,
  busyScoreId,
  onOverrideScore,
  verdictChoice,
  onVerdictChoiceChange,
  docketNote,
  onDocketNoteChange,
  savingVerdict,
  onSaveVerdict,
  decisions,
}: {
  target: Target | null;
  selectedSummary: ConsoleSubmission;
  isFlagged: boolean;
  interview: { id: string; status: string } | null | undefined;
  selectedAnalysis: Analysis | null;
  selectedScores: readonly ScoreView[];
  selectedRubric: Rubric;
  canOverride: boolean;
  canDecide: boolean;
  busyScoreId: string | null;
  onOverrideScore: (scoreId: string, value: number) => void;
  verdictChoice: VerdictChoice;
  onVerdictChoiceChange: (v: VerdictChoice) => void;
  docketNote: string;
  onDocketNoteChange: (note: string) => void;
  savingVerdict: boolean;
  onSaveVerdict: (submissionId: string, who: string) => void;
  decisions: readonly IntegrityDecision[];
}) {
  const history = decisions.filter((d) => (d.submission_id ?? d.assignment_submission_id) === selectedSummary.id);

  return (
    <section className="overflow-hidden rounded-[6px] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${isFlagged ? 'bg-bad' : 'bg-good'}`} />
          <h2 className="font-serif-heading text-[20px] font-medium text-ink">
            {tr('Forensic Cross-Examination:')}{' '}{selectedSummary.submitted_by_name || selectedSummary.team_name}
          </h2>
          {isFlagged && <Badge tone="bad">{tr('FLAGGED FOR REVIEW')}</Badge>}
        </div>
        <div className="font-mono-code flex items-center gap-2 text-[11px] text-muted">
          <span>{tr('TEAM:')}{' '}{selectedSummary.team_name}</span>
          {selectedSummary.locked_commit_sha && (
            <>
              <span>•</span>
              <span>{tr('COMMIT: @')}{selectedSummary.locked_commit_sha.slice(0, 7)}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left 7 Cols: Audio Defense Telemetry & Repo Map Summary */}
        <div className="space-y-5 p-6 lg:col-span-7">
          <div className="space-y-2">
            <div className="font-mono-code flex items-center justify-between text-[11px] text-muted uppercase">
              <span>{tr('AI Oral Defense Telemetry')}</span>
              <span className="font-semibold text-ink">
                {selectedSummary.ownership
                  ? tr('OWNERSHIP: {score}/100 ({level})', { score: selectedSummary.ownership.score, level: selectedSummary.ownership.confidence })
                  : tr('NO ORAL DEFENSE RECORDED')}
              </span>
            </div>
            <div className="rounded-[4px] border border-line bg-paper p-3.5">
              <WaveformVisualizer active={Boolean(selectedSummary.ownership)} />
              {interview && (
                <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2 text-[12px]">
                  <span className="font-mono-code text-muted">
                    {tr('Session Status:')}{' '}{interview.status.toUpperCase()}
                  </span>
                  <Link
                    to={`/interview/${interview.id}`}
                    className="font-mono-code font-semibold text-accent hover:underline"
                  >
                    {tr('Open Full Voice Transcript →')}
                  </Link>
                </div>
              )}
            </div>
          </div>

          {selectedAnalysis && (
            <div className="space-y-2 rounded-[4px] border border-line bg-paper/50 p-4">
              <div className="font-mono-code flex items-center justify-between text-[11px] text-muted uppercase">
                <span>{tr('Repository Analysis Summary')}</span>
                <span>{selectedAnalysis.file_count}{' '}{tr('files inspected')}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-ink">{selectedAnalysis.map_json.summary}</p>
            </div>
          )}

          {selectedScores.length > 0 && (
            <div className="space-y-2">
              <span className="font-mono-code block text-[11px] font-bold text-muted uppercase">
                {tr('Criterion Breakdown')}
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {selectedScores.map((sc) => {
                  const crit = selectedRubric.find((c) => c.key === sc.criterion_key);
                  const val = sc.override_score ?? sc.ai_score ?? null;
                  return (
                    <div key={sc.id} className="rounded-[4px] border border-line bg-paper/45 p-3 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{crit?.name ?? sc.criterion_key}</span>
                        <Badge tone={scoreTone(val)}>{val ?? '–'}/10</Badge>
                      </div>
                      <ScoreBar value={(val ?? 0) * 10} max={100} tone={scoreTone(val) === 'bad' ? 'bad' : 'accent'} heightClass="h-1" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Faculty Grading & Determination */}
        <div className="flex flex-col justify-between space-y-5 bg-surface p-6 lg:col-span-5">
          <div className="space-y-4">
            <div className="font-mono-code flex items-center justify-between border-b border-line pb-2 text-[11px] text-muted uppercase">
              <span>{tr('Score override & verdict')}</span>
              <span>{canOverride ? tr('OVERRIDE ACTIVE') : STATUS_LABEL[target?.status ?? 'open']}</span>
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-ink">{tr('Composite Assignment Grade')}</span>
              <div className="font-mono-code">
                <span className="text-[24px] font-bold text-ink">
                  {selectedSummary.total != null ? selectedSummary.total.toFixed(1) : '—'}
                </span>
                <span className="text-[12px] text-muted"> / 100</span>
              </div>
            </div>

            {canOverride && selectedScores[0] && (
              <div className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3">
                <label className="font-mono-code block text-[11px] font-semibold text-ink">
                  {tr('Quick Adjust First Criterion (')}{selectedRubric[0]?.name ?? selectedScores[0].criterion_key})
                </label>
                <div className="flex items-center gap-2">
                  <Select
                    disabled={busyScoreId === selectedScores[0].id}
                    value={selectedScores[0].override_score ?? ''}
                    onChange={(e) => {
                      if (e.target.value) onOverrideScore(selectedScores[0]!.id, Number(e.target.value));
                    }}
                    className="font-mono-code h-8 bg-surface text-[12px]"
                  >
                    <option value="">{tr('Keep AI (')}{selectedScores[0].ai_score ?? '–'})</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} / 10
                      </option>
                    ))}
                  </Select>
                  {target && (
                    <Link
                      to={target.submissionLink(selectedSummary.id)}
                      className="font-mono-code shrink-0 text-[11px] font-semibold text-accent hover:underline"
                    >
                      {tr('All Criteria →')}
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <span className="font-mono-code block text-[11px] font-bold text-ink uppercase">
                {tr('Integrity Verdict')}
              </span>
              {(
                [
                  {
                    key: 'cod',
                    title: tr('Refer to Committee on Discipline'),
                    desc: tr('Unexplained similarity + failed oral defense.'),
                  },
                  {
                    key: 'live_defense',
                    title: tr('Mandate Live In-Person Defense'),
                    desc: tr('Schedule 15-minute whiteboard walk with TA/instructor.'),
                  },
                  {
                    key: 'clear',
                    title: tr('Clear Flag (Verified Authorship)'),
                    desc: tr('Approve grade for final roster publication.'),
                  },
                ] as const
              ).map((v) => (
                <label
                  key={v.key}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[4px] border p-2.5 text-[12px] ${
                    verdictChoice === v.key ? 'border-accent bg-accent-soft/40' : 'border-line bg-paper/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="faculty_verdict"
                    checked={verdictChoice === v.key}
                    onChange={() => onVerdictChoiceChange(v.key)}
                    className="mt-0.5 accent-accent"
                  />
                  <div>
                    <div className="font-semibold text-ink">{v.title}</div>
                    <div className="text-[11px] text-muted">{v.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <label className="font-mono-code block text-[11px] font-semibold text-ink uppercase">
                {tr('Official Docket Notes')}
              </label>
              <Textarea
                rows={3}
                value={docketNote}
                onChange={(e) => onDocketNoteChange(e.target.value)}
                placeholder={tr('Notes for this verdict (kept in the history)…')}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
            <Button
              type="button"
              variant={verdictChoice === 'cod' ? 'danger' : 'primary'}
              className="flex-1"
              disabled={!canDecide || savingVerdict}
              onClick={() => onSaveVerdict(selectedSummary.id, selectedSummary.submitted_by_name || selectedSummary.team_name)}
            >
              {savingVerdict ? tr('Saving…') : tr('Save Determination')}
            </Button>
            {target && (
              <Link to={target.submissionLink(selectedSummary.id)} className={linkButtonSecondary}>
                {tr('Full Judge View')}
              </Link>
            )}
          </div>
          {!canDecide && <p className="text-[11px] text-muted">{tr('Your role cannot record integrity determinations.')}</p>}
          {history.length === 0 ? (
            <p className="text-[11px] text-muted">{tr('No determination recorded for this student yet.')}</p>
          ) : (
            <ul className="space-y-1 border-t border-line pt-3 text-[11px]">
              {history.map((d) => (
                <li key={d.id}>
                  <span className="font-mono-code font-semibold text-ink">{VERDICT_LABEL[d.verdict] ?? d.verdict}</span>
                  <span className="text-muted"> · {d.profiles?.display_name || tr('reviewer')} · {formatDate(d.created_at)}</span>
                  {d.note && <span className="block text-muted">{d.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
