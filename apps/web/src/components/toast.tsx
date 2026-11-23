import { tr } from '../i18n';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Tone = 'good' | 'error' | 'info';
interface Toast { id: number; tone: Tone; text: string }
interface ToastApi { show: (text: string, tone?: Tone) => void; error: (text: string) => void; success: (text: string) => void }

const ToastContext = createContext<ToastApi | null>(null);

/** Short messages in a corner of the screen, for the result of an action. Errors stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const show = useCallback(
    (text: string, tone: Tone = 'info') => {
      const id = next.current++;
      setToasts((list) => [...list.filter((t) => t.text !== text), { id, tone, text }].slice(-4));
      setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo<ToastApi>(() => ({ show, error: (t) => show(t, 'error'), success: (t) => show(t, 'good') }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Above everything (floating panels 75, confirmation 80): a toast confirms what was just done in them. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface px-4 py-3 text-sm shadow-lg ' +
              (t.tone === 'error' ? 'border-bad/40' : t.tone === 'good' ? 'border-good/40' : 'border-line')
            }
          >
            <span
              aria-hidden="true"
              className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (t.tone === 'error' ? 'bg-bad' : t.tone === 'good' ? 'bg-good' : 'bg-accent')}
            />
            <span className="flex-1">{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} className="cursor-pointer text-muted hover:text-ink" aria-label={tr('Dismiss')}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast needs a ToastProvider');
  return ctx;
}
