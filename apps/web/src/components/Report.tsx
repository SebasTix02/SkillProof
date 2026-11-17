import {
  Badge,
  EditorialQuoteBlock,
  KpiCell,
  KpiGrid,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_TONE,
  scoreTone,
  type SkillLevel,
} from './shared';

export interface ReportView {
  skills_json: { skill: string; level: SkillLevel; evidence_quote: string }[];
  ownership_score: number;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
}

/** PostgREST returns a one-to-one relation as an object or a one-item array, depending on the key it detects. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function Report({ report }: { report: ReportView }) {
  const totalSkills = report.skills_json.length;
  const verifiedSkills = report.skills_json.filter((s) => s.level === 'strong' || s.level === 'solid').length;
  const quotedSkills = report.skills_json.filter((s) => Boolean(s.evidence_quote?.trim())).length;
  const tone = scoreTone(report.ownership_score, 100);

  return (
    <div className="space-y-6">
      {/* 4-Column Metric Scorecard */}
      <KpiGrid>
        <KpiCell label="Overall Code Ownership" tinted>
          <div className="flex items-baseline gap-1">
            <span
              className={`font-serif-heading text-[38px] leading-none font-normal tracking-tight ${
                tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : 'text-bad'
              }`}
            >
              {report.ownership_score}
            </span>
            <span className="font-mono-code text-[13px] text-muted">/ 100</span>
          </div>
          <div className="mt-2">
            <Badge tone={tone} dot>
              {report.ownership_score >= 70
                ? 'DIRECT AUTHORSHIP'
                : report.ownership_score >= 45
                  ? 'PARTIAL OWNERSHIP'
                  : 'LOW OWNERSHIP'}
            </Badge>
          </div>
        </KpiCell>

        <KpiCell label="Examiner Confidence" tinted>
          <div className="font-mono-code text-[28px] leading-tight font-semibold text-ink uppercase">
            {report.confidence}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {report.confidence === 'high'
              ? 'Consistent vocal defense across cited files'
              : report.confidence === 'medium'
                ? 'Moderate detail across probed code sections'
                : 'Insufficient verbal detail; interpret with care'}
          </div>
        </KpiCell>

        <KpiCell label="Verified Dimensions" tinted>
          <div className="font-mono-code text-[28px] leading-tight font-semibold text-good">
            {verifiedSkills}
            <span className="text-[14px] font-normal text-muted"> / {totalSkills}</span>
          </div>
          <div className="mt-1 text-[12px] text-muted">Rated Solid or Strong during oral cross-exam</div>
        </KpiCell>

        <KpiCell label="Pinned Audio Quotes" tinted>
          <div className="font-mono-code text-[28px] leading-tight font-semibold text-accent">
            {quotedSkills}
            <span className="text-[14px] font-normal text-muted"> / {totalSkills}</span>
          </div>
          <div className="mt-1 text-[12px] text-muted">Direct candidate quotes linked as evidence</div>
        </KpiCell>
      </KpiGrid>

      {report.confidence === 'low' && (
        <div className="rounded-[4px] border border-warn/30 border-l-[3px] border-l-warn bg-warn-soft/60 px-4 py-2.5 text-[13px] text-warn">
          The candidate said too little for a reliable judgement. Read this score with care.
        </div>
      )}

      {/* Executive Forensic Summary */}
      <div className="space-y-2 rounded-[4px] border border-line border-l-[4px] border-l-warn bg-[#FFFDF5] p-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-warn" />
          <h3 className="font-mono-code text-[11px] font-bold tracking-wider text-warn uppercase">
            Executive Examiner Synthesis
          </h3>
        </div>
        <p className="font-serif-heading text-[17px] leading-[26px] text-ink">{report.summary}</p>
      </div>

      {/* Evaluated Skills Matrix & Verbatim Evidence */}
      {report.skills_json.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <h3 className="font-serif-heading text-[19px] font-medium text-ink">
              Evaluated Dimensions &amp; Verbatim Evidence
            </h3>
            <span className="font-mono-code rounded-[3px] border border-line bg-paper px-2 py-0.5 text-[11px] text-muted">
              {totalSkills} DIMENSIONS ASSESSED • TRANSCRIPT PINNED
            </span>
          </div>

          <ul className="space-y-3.5">
            {report.skills_json.map((s, idx) => (
              <li
                key={s.skill}
                className="card-interactive space-y-3 rounded-[4px] border border-line bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <h4 className="font-serif-heading text-[17px] font-medium text-ink">
                    {idx + 1}. {s.skill}
                  </h4>
                  <Badge tone={SKILL_LEVEL_TONE[s.level]} dot>
                    {SKILL_LEVEL_LABEL[s.level]}
                  </Badge>
                </div>

                {s.evidence_quote && (
                  <EditorialQuoteBlock
                    quote={s.evidence_quote}
                    attribution="Verbatim Candidate Defense Quote • Evidence Verified"
                    theme={s.level === 'strong' ? 'emerald' : s.level === 'solid' ? 'indigo' : 'cobalt'}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
