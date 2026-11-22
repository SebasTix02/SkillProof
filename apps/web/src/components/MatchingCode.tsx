/**
 * The fragments two submissions share (content similarity), and both sides of the one you pick, read at the frozen
 * commits. Used by the forensic comparison of events and of course assignments.
 */
import { useState } from 'react';
import { tr } from '../i18n';
import { useLoad } from '../lib/useLoad';
import { CodeEvidenceViewer, PageState } from './shared';

export interface MatchRow {
  id: string;
  path_a: string;
  start_a: number;
  end_a: number;
  path_b: string;
  start_b: number;
  end_b: number;
  score: number | string;
}

interface Side {
  path: string;
  start: number;
  end: number;
  lines: { number: number; text: string }[];
  repo: { owner: string; name: string; url: string } | null;
  sha: string | null;
}

function SideView({ side, label }: { side: Side; label: string }) {
  const link = side.repo && side.sha ? `${side.repo.url}/blob/${side.sha}/${side.path}#L${side.start}-L${side.end}` : null;
  return (
    <CodeEvidenceViewer
      filePath={side.path}
      lineRangeLabel={tr('lines {start}–{end}', { start: side.start, end: side.end })}
      badge={<span className="font-mono-code text-[10px] font-bold text-muted uppercase">{label}</span>}
      lines={side.lines.map((l) => ({ lineNumber: l.number, content: l.text || ' ', highlighted: l.number >= side.start && l.number <= side.end }))}
      footerRight={
        link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
            {tr('Open on GitHub ↗')}
          </a>
        ) : undefined
      }
    />
  );
}

export function MatchingCode({ matches, scope, labelA, labelB }: { matches: MatchRow[]; scope: 'event' | 'assignment'; labelA: string; labelB: string }) {
  const [selected, setSelected] = useState<string | null>(matches[0]?.id ?? null);
  const current = matches.find((m) => m.id === selected) ?? matches[0] ?? null;
  const code = useLoad<{ a: Side; b: Side }>(current ? `/api/similarity-matches/${current.id}/code?scope=${scope}` : null);

  if (!matches.length) return null;
  return (
    <div className="space-y-4">
      <ul className="font-mono-code divide-y divide-line overflow-hidden rounded-[4px] border border-line text-[12px]">
        {matches.map((m) => {
          const lines = m.end_a - m.start_a + 1;
          const active = current?.id === m.id;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelected(m.id)}
                aria-pressed={active}
                className={`flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-left ${active ? 'bg-accent-soft text-accent-ink' : 'hover:bg-paper'}`}
              >
                <span>
                  {m.path_a}:{m.start_a}–{m.end_a}
                </span>
                <span className="text-muted">↔</span>
                <span>
                  {m.path_b}:{m.start_b}–{m.end_b}
                </span>
                <span className="text-muted">{tr('{n} lines', { n: lines })}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {code.loading || code.error ? (
        <PageState loading={code.loading} error={code.error} />
      ) : code.data ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <SideView side={code.data.a} label={labelA} />
          <SideView side={code.data.b} label={labelB} />
        </div>
      ) : null}
    </div>
  );
}
