import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { tr, trn, useI18n } from '../i18n';
import { errorMessage } from '../lib/api';
import { relativeTime, respondToInvite, useNotifications, type GroupInviteNotification } from '../lib/notifications';
import { useToast } from './toast';
import { Button } from './ui';

export type BellPlacement = 'bottom-start' | 'bottom-end' | 'right-end';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
const PANEL_W = 380;
/** Under two days to answer: the closing time is shown as a warning. */
const URGENT_MS = 48 * 3600_000;

/** Fixed position next to the bell (the side menu scrolls and clips), kept inside the window. */
function panelPosition(el: HTMLElement, placement: BellPlacement): CSSProperties {
  const r = el.getBoundingClientRect();
  const width = Math.min(PANEL_W, window.innerWidth - 16);
  if (placement === 'right-end') return { width, left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) };
  if (placement === 'bottom-end') return { width, right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 };
  return { width, left: Math.min(r.left, window.innerWidth - width - 8), top: r.bottom + 8 };
}

/** A translated sentence with its {variables} in bold: the sentence stays whole, so each language orders it its way. */
function emphasize(sentence: string, vars: Record<string, string>): ReactNode[] {
  return sentence.split(/\{(\w+)\}/).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {vars[part] ?? part}
      </strong>
    ) : (
      part
    ),
  );
}

function InviteItem({ n, onNavigate }: { n: GroupInviteNotification; onNavigate: () => void }) {
  const toast = useToast();
  const { locale } = useI18n();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const urgent = Date.parse(n.closes_at) - Date.now() < URGENT_MS;

  async function answer(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await respondToInvite(n.group_id, accept);
      // The item leaves the list by itself (the store drops it), so there is nothing else to do here.
      toast.success(accept ? tr('You joined {name}.', { name: n.group_name }) : tr('Invitation to {name} declined.', { name: n.group_name }));
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink" aria-hidden="true">
        <span className="material-symbols-outlined text-[19px]">group_add</span>
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] leading-[19px] text-ink">
          {emphasize(tr('{person} invited you to join {group}'), { person: n.invited_by ?? tr('A classmate'), group: n.group_name })}
        </p>
        <p className="truncate text-[12px] text-muted" title={[n.assignment_title, n.course_name].filter(Boolean).join(' · ')}>
          <Link to={`/courses/${n.course_id}/a/${n.assignment_id}`} onClick={onNavigate} className="font-medium text-accent-ink hover:underline">
            {n.assignment_title}
          </Link>
          {n.course_name && <span> · {n.course_name}</span>}
        </p>
        <p className="font-mono-code flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <span>{relativeTime(n.invited_at, locale)}</span>
          <span aria-hidden="true">·</span>
          <span className={cx('inline-flex items-center gap-1', urgent && 'font-semibold text-warn-ink')}>
            {urgent && (
              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                schedule
              </span>
            )}
            {tr('Groups close {when}', { when: relativeTime(n.closes_at, locale) })}
          </span>
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button className="px-3 py-1 text-[12px]" loading={busy === 'accept'} disabled={!!busy} onClick={() => void answer(true)}>
            {tr('Accept')}
          </Button>
          <Button variant="secondary" className="px-3 py-1 text-[12px]" loading={busy === 'decline'} disabled={!!busy} onClick={() => void answer(false)}>
            {tr('Decline')}
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * The bell: how many things wait for an answer, and a panel to answer them without leaving the page. Today those are
 * invitations to groups of course assignments. `onDark`: on the dark side menu or top bar.
 */
export function NotificationBell({
  onDark = false,
  placement = 'bottom-start',
  className = '',
  showMyCourses = false,
}: {
  onDark?: boolean;
  placement?: BellPlacement;
  className?: string;
  /** Link to My courses at the bottom of the panel (people on a course roster). */
  showMyCourses?: boolean;
}) {
  const { items, loaded } = useNotifications(true);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const location = useLocation();
  const count = items.length;
  const label = count
    ? trn('{count} notification waiting for your answer', '{count} notifications waiting for your answer', count)
    : tr('Notifications: none');

  useLayoutEffect(() => {
    if (open && button.current) setStyle(panelPosition(button.current, placement));
  }, [open, placement]);

  // Leaving the page closes it.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onResize = () => button.current && setStyle(panelPosition(button.current, placement));
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open, placement]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[4px] transition-colors',
          onDark
            ? cx('text-dark-muted hover:bg-dark-surface hover:text-dark-ink focus-visible:outline-2 focus-visible:outline-accent-on-dark', open && 'bg-dark-surface text-dark-ink')
            : cx('border border-line bg-surface text-muted hover:border-muted hover:text-ink', open && 'text-ink'),
          className,
        )}
      >
        <span className={cx('material-symbols-outlined text-[21px]', count > 0 && 'text-current')} aria-hidden="true">
          {count > 0 ? 'notifications_unread' : 'notifications'}
        </span>
        {count > 0 && (
          <span
            className={cx(
              'font-mono-code absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
              'bg-bad text-on-bad ring-2',
              onDark ? 'ring-dark-canvas' : 'ring-surface',
            )}
            aria-hidden="true"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* In <body>, not next to the bell: the side menu is sticky (its own stacking context), so a panel inside it
          would sit under page content that has a z-index of its own (images, banners). */}
      {open &&
        createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          style={style}
          className="fixed z-[75] flex max-h-[min(560px,calc(100vh-24px))] flex-col overflow-hidden rounded-[6px] border border-line-strong bg-surface text-ink"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <h2 id={titleId} tabIndex={-1} data-autofocus className="font-serif-heading text-[19px] leading-tight font-medium text-ink outline-none">
                {tr('Notifications')}
              </h2>
              <p className="text-[12px] text-muted">{tr('Group invitations from your courses that wait for your answer.')}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                close();
                button.current?.focus();
              }}
              aria-label={tr('Close notifications')}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-muted hover:bg-well hover:text-ink"
            >
              <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
                close
              </span>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!loaded ? (
              <div className="space-y-3 p-4" aria-busy="true">
                <div className="skeleton h-14 w-full" />
                <div className="skeleton h-14 w-full" />
              </div>
            ) : count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-well text-muted" aria-hidden="true">
                  <span className="material-symbols-outlined text-[22px]">notifications_off</span>
                </span>
                <p className="text-[14px] font-semibold text-ink">{tr('You are all caught up')}</p>
                <p className="max-w-[260px] text-[12px] text-muted">{tr('When a classmate invites you to a group for a course assignment, it shows up here.')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-line" aria-live="polite">
                {/* Answering removes the item (the list reloads); opening the assignment closes the panel. */}
                {items.map((n) => (
                  <InviteItem key={n.id} n={n} onNavigate={close} />
                ))}
              </ul>
            )}
          </div>

          {showMyCourses && (
            <footer className="border-t border-line bg-paper px-4 py-2.5">
              <Link to="/courses" onClick={close} className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-ink hover:underline">
                {tr('Go to My courses')}
                <span className="arrow-nudge font-mono-code text-[11px]" aria-hidden="true">
                  →
                </span>
              </Link>
            </footer>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
