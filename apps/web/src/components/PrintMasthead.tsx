import { tr } from '../i18n';
/**
 * The top of a printed dossier: who, which repository and commit, when, and where to check it online.
 * Hidden on screen; the page's own header is what people see there.
 */
export function PrintMasthead({
  kind,
  name,
  repo,
  commit,
  date,
  url,
}: {
  kind: string;
  name: string;
  repo?: string | null;
  commit?: string | null;
  date?: string | null;
  url?: string | null;
}) {
  return (
    <div className="print-only mb-6 border-b border-line pb-4">
      <div className="font-mono-code flex items-center justify-between text-[8pt] tracking-wider text-muted uppercase">
        <span>
          {tr('Skill')}<span className="text-accent">{tr('Proof')}</span> · {kind}
        </span>
        {date && <span>{new Date(date).toLocaleDateString(undefined, { dateStyle: 'long' })}</span>}
      </div>
      <h1 className="font-serif-heading mt-2 text-[22pt] leading-tight font-medium text-ink">{name}</h1>
      <div className="font-mono-code mt-1 flex flex-wrap gap-x-4 text-[9pt] text-muted">
        {repo && <span>{tr('Repository:')}{' '}{repo}</span>}
        {commit && <span>{tr('Commit:')}{' '}{commit.slice(0, 12)}</span>}
        {url && <span>{tr('Online:')}{' '}{url}</span>}
      </div>
    </div>
  );
}
