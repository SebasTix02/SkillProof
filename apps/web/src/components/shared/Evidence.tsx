import type { ReactNode } from 'react';
import { DOSSIER_THEMES, type DossierThemeKey } from './tokens';

export function EditorialQuoteBlock({
  quote,
  attribution,
  theme = 'cobalt',
  size = 'sm',
  className = '',
}: {
  quote: ReactNode;
  attribution?: ReactNode;
  theme?: DossierThemeKey;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = DOSSIER_THEMES[theme];
  return (
    <blockquote
      className={`rounded-r-[3px] border-l-[3px] py-2 pr-3 pl-4 italic text-ink ${t.quoteBorder} ${
        size === 'md'
          ? 'font-serif-heading text-[16px] leading-[24px]'
          : 'text-[13px] leading-[21px]'
      } ${className}`}
    >
      &ldquo;{quote}&rdquo;
      {attribution && (
        <footer className="font-mono-code mt-1 block text-[10px] font-normal text-muted not-italic uppercase">
          {attribution}
        </footer>
      )}
    </blockquote>
  );
}

export interface CodeLineItem {
  lineNumber: number;
  content: ReactNode;
  highlighted?: boolean;
  activeFlash?: boolean;
}

export function CodeEvidenceViewer({
  filePath,
  lineRangeLabel,
  badge,
  commentHeader,
  lines,
  footerLeft,
  footerRight,
  maxHeightClass = 'max-h-[380px]',
}: {
  filePath: string;
  lineRangeLabel?: string;
  badge?: ReactNode;
  commentHeader?: string;
  lines: CodeLineItem[];
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  maxHeightClass?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-line bg-white">
      <div className="flex h-9 items-center justify-between border-b border-line bg-paper px-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-good" />
          <span className="font-mono-code text-[11px] font-semibold text-ink">{filePath}</span>
          {lineRangeLabel && (
            <span className="font-mono-code hidden text-[10px] text-muted sm:inline">{lineRangeLabel}</span>
          )}
        </div>
        {badge}
      </div>

      <div className={`font-mono-code overflow-x-auto overflow-y-auto bg-white p-3 text-[12px] leading-[20px] ${maxHeightClass}`}>
        {commentHeader && <div className="pb-1 text-[11px] text-muted">{commentHeader}</div>}
        {lines.map((row) => (
          <div
            key={row.lineNumber}
            className={`-mx-3 flex px-3 transition-colors ${
              row.activeFlash
                ? 'border-l-2 border-accent bg-accent font-semibold text-white'
                : row.highlighted
                  ? 'border-l-2 border-accent bg-accent-soft/65 font-medium text-ink'
                  : 'text-muted'
            }`}
          >
            <span
              className={`w-8 pr-3 text-right select-none ${
                row.activeFlash
                  ? 'font-semibold text-white'
                  : row.highlighted
                    ? 'font-semibold text-accent'
                    : 'text-muted/60'
              }`}
            >
              {row.lineNumber}
            </span>
            <span className={`whitespace-pre ${row.activeFlash ? 'text-white' : 'text-ink'}`}>{row.content}</span>
          </div>
        ))}
      </div>

      {(footerLeft || footerRight) && (
        <footer className="font-mono-code flex items-center justify-between border-t border-line bg-white px-4 py-2 text-[11px] text-muted">
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </footer>
      )}
    </div>
  );
}

export function VerificationProtocolCard({
  title = 'Verification Protocol & Oral Defense Integrity',
  description,
  steps = [
    {
      code: '01 / SELECTIVE REPO READING',
      tone: 'text-accent',
      text: 'Reads the Git tree, selects high-signal source files, and caches file summaries by blob SHA and commit.',
    },
    {
      code: '02 / 3-MIN VOICE CROSS-EXAM',
      tone: 'text-good',
      text: 'Probes architectural trade-offs and specific code snippets out loud, following up on vague answers.',
    },
    {
      code: '03 / OWNERSHIP REPORT & DOSSIER',
      tone: 'text-ink',
      text: 'Produces an ownership score (0–100) and demonstrated skills backed by verbatim transcript quotes.',
    },
  ],
}: {
  title?: string;
  description?: ReactNode;
  steps?: { code: string; tone: string; text: string }[];
}) {
  return (
    <section className="space-y-5 rounded-[6px] border border-line bg-white p-6">
      <div className="flex items-start gap-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-accent bg-accent-soft text-accent">
          <span className="material-symbols-outlined text-[20px]">security</span>
        </div>
        <div className="space-y-1">
          <h3 className="font-serif-heading text-[20px] font-medium text-ink">{title}</h3>
          <p className="text-[13px] leading-[21px] text-muted">
            {description ?? (
              <>
                SkillProof analyzes your repository structure and prepares an interview plan with expected points that
                never leave the server (
                <code className="font-mono-code rounded-[3px] border border-line bg-paper px-1.5 py-0.5 text-[11px] text-accent">
                  publicQuestions
                </code>
                ). Your browser receives a single-use token for Gemini Live to conduct the 3-minute voice session.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.code} className="space-y-1.5 rounded-[4px] border border-line bg-paper p-3.5">
            <div className={`font-mono-code text-[11px] font-bold ${s.tone}`}>{s.code}</div>
            <p className="text-[12px] leading-snug text-muted">{s.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
