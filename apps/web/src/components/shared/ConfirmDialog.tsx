import { tr } from '../../i18n';
/**
 * Confirmations in the app's own style, instead of the browser's window.confirm.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Remove Ana?', body: 'She loses access at once.', confirmLabel: 'Remove', tone: 'danger' }))) return;
 *
 * Accessible: role="alertdialog" with title and description, focus starts on Cancel (the safe choice) and stays inside,
 * Escape or a click outside cancels, and focus goes back to where it was.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  /** What is about to happen, as a question: "Revoke the invitation for ana@x.com?" */
  title: string;
  /** The consequence, and whether it can be undone. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' for actions that delete, revoke, end or cannot be undone. */
  tone?: 'danger' | 'primary';
  /** Shown under the text: "This cannot be undone." when false. */
  undoable?: boolean;
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

/** The dialog itself, without state: rendered by ConfirmProvider, and testable on its own. */
export function ConfirmDialogView({
  options,
  onAnswer,
  dialogRef,
}: {
  options: ConfirmOptions;
  onAnswer: (yes: boolean) => void;
  dialogRef?: React.Ref<HTMLDivElement>;
}) {
  const danger = (options.tone ?? 'danger') === 'danger';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" tabIndex={-1} aria-label={tr('Cancel')} onClick={() => onAnswer(false)} className="absolute inset-0 h-full w-full cursor-default bg-ink/50" />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="relative w-full max-w-md rounded-[6px] border border-line bg-surface p-6"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`material-symbols-outlined mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] text-[20px] ${
              danger ? 'bg-bad-soft text-bad-ink' : 'bg-accent-soft text-accent-ink'
            }`}
          >
            {danger ? 'warning' : 'help'}
          </span>
          <div className="min-w-0 space-y-2">
            <h2 id="confirm-title" className="font-serif-heading text-[20px] leading-[26px] text-ink">
              {options.title}
            </h2>
            <div id="confirm-body" className="space-y-1.5 text-[13px] leading-[20px] text-muted">
              {options.body && <div>{options.body}</div>}
              {options.undoable === false && <p className="font-medium text-bad-ink">{tr('This cannot be undone.')}</p>}
              {options.undoable === true && <p>{tr('You can change this later.')}</p>}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            data-autofocus
            onClick={() => onAnswer(false)}
            className="btn-tactile cursor-pointer rounded-[4px] border border-line bg-surface px-4 py-2 text-[13px] font-medium text-ink hover:border-muted hover:bg-paper"
          >
            {options.cancelLabel ?? tr('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            className={`btn-tactile cursor-pointer rounded-[4px] border px-4 py-2 text-[13px] font-medium ${
              danger
                ? 'border-bad bg-bad text-on-bad hover:border-bad-hover hover:bg-bad-hover'
                : 'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover'
            }`}
          >
            {options.confirmLabel ?? tr('Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), a[href], input, select, textarea';

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ options: ConfirmOptions; resolve: (yes: boolean) => void } | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  const ask = useCallback<Ask>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setCurrent((prev) => {
          prev?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const answer = useCallback(
    (yes: boolean) => {
      current?.resolve(yes);
      setCurrent(null);
    },
    [current],
  );

  useEffect(() => {
    if (!current) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        answer(false);
        return;
      }
      if (e.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [current, answer]);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {/* Inside the full-screen element when there is one (the interview stage), or it would not be seen. */}
      {current &&
        createPortal(
          <ConfirmDialogView options={current.options} onAnswer={answer} dialogRef={dialog} />,
          document.fullscreenElement ?? document.body,
        )}
    </ConfirmContext.Provider>
  );
}

/**
 * Splits a sentence like "Cancel the report? Your answers stay saved." into a title (the question) and a body.
 */
export function questionToOptions(text: string, extra: Partial<ConfirmOptions> = {}): ConfirmOptions {
  const i = text.indexOf('?');
  const title = i >= 0 ? text.slice(0, i + 1).trim() : text.trim();
  const body = i >= 0 ? text.slice(i + 1).trim() : '';
  return { title, body: body || undefined, ...extra };
}

/** Asks for confirmation in a dialog; resolves true only if the person confirms. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ask;
}
