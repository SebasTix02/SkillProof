import { tr, trn } from '../i18n';
import { MODEL_FALLBACKS, type ActivityEntry } from '@skillproof/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Badge } from './ui';

const DEFAULT_PRIMARY = Object.keys(MODEL_FALLBACKS);

/** "gemini-3.8-flash" -> "Gemini 3.8 Flash", and "vertex:gemini-3.8-flash" -> "Gemini 3.8 Flash (Vertex AI)". */
export function modelName(key: string): string {
  const [provider, id] = key.includes(':') ? key.split(':') : ['', key];
  const name = id!
    .split('-')
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  return provider === 'vertex' ? `${name} (Vertex AI)` : provider === 'studio' ? `${name} (Gemini API)` : name;
}

/** The models that did the work, marking the ones used as a backup. `primary` are the server's main models. */
export function ModelsUsed({ models, primary = DEFAULT_PRIMARY }: { models: string[] | null | undefined; primary?: string[] }) {
  if (!models || models.length === 0) return null;
  const isBackup = (m: string) => m.includes(':') || !primary.includes(m);
  const backup = models.some(isBackup);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {models.map((m) => (
        <Badge key={m} tone={isBackup(m) ? 'warn' : 'accent'}>{modelName(m)}{isBackup(m) && tr(' (backup)')}</Badge>
      ))}
      {backup && <span className="text-xs text-muted">{tr('The main model was busy, so a backup model answered.')}</span>}
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

/** "+12 s" or "+1 min 5 s" after the previous entry. */
function gap(prev: ActivityEntry | undefined, e: ActivityEntry): string {
  if (!prev) return '';
  const s = Math.round((Date.parse(e.at) - Date.parse(prev.at)) / 1000);
  if (s < 1) return '';
  return s >= 60 ? `+${Math.floor(s / 60)} min ${s % 60} s` : `+${s} s`;
}

/** A new attempt starts with "Attempt N of M started" or "Judging started". */
const startsRun = (e: ActivityEntry) => e.kind === 'step' && /^(Attempt \d+ of \d+ started|Judging started)/.test(e.text);

/** The step that was last reached: shown in tables and while the panel is closed. */
export function latestStep(entries: ActivityEntry[] | undefined): ActivityEntry | undefined {
  return entries ? [...entries].reverse().find((e) => e.kind !== 'thought') : undefined;
}

/**
 * The full history of what the AI did, in order, inside a scrolling panel.
 * While the job runs the panel follows the newest step, unless the reader scrolled up to look at earlier ones;
 * then a button brings them back to the latest. Retries, model switches and attempts stay where they happened.
 * "thought" entries are the model's own summary of its reasoning and can be shown or hidden.
 */
export function AiActivity({ entries, live = false, maxHeight = '28rem' }: { entries: ActivityEntry[]; live?: boolean; maxHeight?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [showThoughts, setShowThoughts] = useState(true);
  const hasThoughts = entries.some((e) => e.kind === 'thought');
  const shown = showThoughts ? entries : entries.filter((e) => e.kind !== 'thought');
  const steps = entries.filter((e) => e.kind !== 'thought').length;
  const last = shown.length - 1;

  // Keep the newest step in view while following.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [shown.length, follow]);

  // Start following again when a new run starts.
  useEffect(() => {
    if (live) setFollow(true);
  }, [live]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== follow) setFollow(atBottom);
  }

  if (entries.length === 0) return null;
  let previous: ActivityEntry | undefined;
  let run = 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>{trn('{count} step', '{count} steps', steps)}</span>
        {hasThoughts && (
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={showThoughts} onChange={(e) => setShowThoughts(e.target.checked)} />
            {tr('Show the AI\'s reasoning')}
          </label>
        )}
        {live && <span className="inline-flex items-center gap-1 text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />{tr('Live')}</span>}
      </div>
      <div className="relative">
        <div
          ref={box}
          onScroll={onScroll}
          className="overflow-y-auto rounded-lg border border-line bg-paper/40 p-4"
          style={{ maxHeight }}
          role="log"
          aria-live={live ? 'polite' : undefined}
          aria-label={tr('AI activity history')}
        >
          <ol className="relative space-y-3 border-l border-line pl-5">
            {shown.map((e, i) => {
              const header = startsRun(e) ? ++run : 0;
              const since = gap(previous, e);
              previous = e;
              const active = live && i === last && e.kind !== 'done' && e.kind !== 'error';
              return (
                <li key={`${e.at}-${i}`} className="relative text-sm">
                  {header > 1 && (
                    <div className="-ml-5 mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                      <span className="h-px flex-1 bg-line" />{' '}{tr('New attempt')}{' '}<span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <span
                    aria-hidden
                    className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${DOT[e.kind]} ${active ? 'animate-pulse' : ''}`}
                  />
                  {e.kind === 'thought' ? (
                    <details className="group">
                      <summary className="cursor-pointer text-muted hover:text-ink">
                        {tr('How the AI reasoned')}{e.model && <> · {modelName(e.model)}</>}
                      </summary>
                      <p className="mt-1 whitespace-pre-line rounded-lg bg-surface p-3 text-xs leading-relaxed text-muted">{e.text.replace(/\*\*/g, '')}</p>
                    </details>
                  ) : (
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={e.kind === 'error' ? 'text-bad' : e.kind === 'retry' || e.kind === 'fallback' ? 'text-warn' : e.kind === 'done' ? 'font-medium text-good' : ''}>
                        {e.text}
                      </span>
                      <span className="text-xs tabular-nums text-muted">
                        {time(e.at)}
                        {since && <> · {since}</>}
                        {e.model && <> · {modelName(e.model)}</>}
                      </span>
                      {e.detail && (
                        <details className="w-full">
                          <summary className="cursor-pointer text-xs text-muted hover:text-ink">{tr('Details')}</summary>
                          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-surface p-2 font-mono text-[11px] leading-relaxed text-muted">{e.detail}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        {!follow && (
          <button
            onClick={() => setFollow(true)}
            className="absolute bottom-3 right-3 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink shadow hover:bg-paper"
          >
            {live ? tr('Follow the latest step ↓') : tr('Go to the end ↓')}
          </button>
        )}
      </div>
    </div>
  );
}
