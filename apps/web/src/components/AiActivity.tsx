import { MODEL_FALLBACKS, type ActivityEntry } from '@skillproof/shared';
import { Badge } from './ui';

const BACKUPS = new Set(Object.values(MODEL_FALLBACKS).flat());

/** "gemini-3.8-flash" -> "Gemini 3.8 Flash". */
export function modelName(id: string): string {
  return id
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** The models that did the work, marking the ones used as a backup. */
export function ModelsUsed({ models }: { models: string[] | null | undefined }) {
  if (!models || models.length === 0) return null;
  const backup = models.some((m) => BACKUPS.has(m));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {models.map((m) => (
        <Badge key={m} tone={BACKUPS.has(m) ? 'warn' : 'accent'}>{modelName(m)}{BACKUPS.has(m) && ' (backup)'}</Badge>
      ))}
      {backup && <span className="text-xs text-muted">The main model was busy, so a backup model answered.</span>}
    </span>
  );
}

const DOT: Record<ActivityEntry['kind'], string> = {
  step: 'bg-accent',
  thought: 'bg-muted',
  retry: 'bg-warn',
  fallback: 'bg-warn',
  done: 'bg-good',
  error: 'bg-bad',
};

const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * What the AI did, step by step. "thought" entries are the model's own summary of its reasoning
 * and are folded away, so the steps stay readable.
 */
export function AiActivity({ entries, live = false }: { entries: ActivityEntry[]; live?: boolean }) {
  if (entries.length === 0) return null;
  const last = entries.length - 1;
  return (
    <ol className="relative space-y-3 border-l border-line pl-5" aria-live={live ? 'polite' : undefined}>
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative text-sm">
          <span
            aria-hidden
            className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${DOT[e.kind]} ${live && i === last && e.kind !== 'done' && e.kind !== 'error' ? 'animate-pulse' : ''}`}
          />
          {e.kind === 'thought' ? (
            <details className="group">
              <summary className="cursor-pointer text-muted hover:text-ink">
                How the AI reasoned{e.model && <> · {modelName(e.model)}</>}
              </summary>
              <p className="mt-1 whitespace-pre-line rounded-lg bg-paper p-3 text-xs leading-relaxed text-muted">{e.text}</p>
            </details>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={e.kind === 'error' ? 'text-bad' : e.kind === 'retry' || e.kind === 'fallback' ? 'text-warn' : ''}>{e.text}</span>
              <span className="text-xs text-muted">
                {time(e.at)}
                {e.model && <> · {modelName(e.model)}</>}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
