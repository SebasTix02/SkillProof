import { Badge, scoreTone } from './ui';

export interface ReportView {
  skills_json: { skill: string; level: 'not_shown' | 'basic' | 'solid' | 'strong'; evidence_quote: string }[];
  ownership_score: number;
  confidence: 'low' | 'medium' | 'high';
  summary: string;
}

const LEVEL_LABEL = { not_shown: 'Not shown', basic: 'Basic', solid: 'Solid', strong: 'Strong' } as const;
const LEVEL_TONE = { not_shown: 'neutral', basic: 'warn', solid: 'good', strong: 'good' } as const;

/** PostgREST returns a one-to-one relation as an object or a one-item array, depending on the key it detects. */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function Report({ report }: { report: ReportView }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl font-semibold tabular-nums">{report.ownership_score}<span className="text-base font-normal text-muted">/100</span></span>
        <Badge tone={scoreTone(report.ownership_score, 100)}>Code ownership</Badge>
        <Badge>{report.confidence} confidence</Badge>
      </div>
      {report.confidence === 'low' && (
        <p className="text-sm text-muted">The candidate said too little for a reliable judgement. Read this score with care.</p>
      )}
      <p className="text-sm">{report.summary}</p>
      <ul className="space-y-3">
        {report.skills_json.map((s) => (
          <li key={s.skill} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{s.skill}</span>
              <Badge tone={LEVEL_TONE[s.level]}>{LEVEL_LABEL[s.level]}</Badge>
            </div>
            {s.evidence_quote && <blockquote className="mt-2 border-l-2 border-line pl-3 text-sm text-muted">“{s.evidence_quote}”</blockquote>}
          </li>
        ))}
      </ul>
    </div>
  );
}
