import { tr } from '../i18n';
import { PreferenceControls } from './ThemeControl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { pendingRequests, useDelayed, usePendingRequests } from '../lib/loading';
import { activeItem, activeParent, navSections, roleLabel, type NavIcon, type NavItem, type NavSection } from '../lib/nav';
import { useNavCourses } from '../lib/navCourses';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Material Symbols used by the menu. */
const ICON: Record<NavIcon, string> = {
  events: 'travel_explore',
  interviews: 'mic',
  profile: 'badge',
  account: 'manage_accounts',
  console: 'dashboard',
  review: 'fact_check',
  plus: 'add_box',
  courses: 'school',
  integrity: 'policy',
  myCourses: 'local_library',
  members: 'group',
  usage: 'monitoring',
  audit: 'receipt_long',
  settings: 'tune',
};

const COLLAPSED_KEY = 'skillproof.sidebar.collapsed';
/** Below the mobile top bar; a section whose top passes this line is the one being read. */
const SPY_LINE_PX = 120;

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function Symbol({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('material-symbols-outlined shrink-0 text-[20px] leading-none', className)}>
      {name}
    </span>
  );
}

function Mark({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={cx(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
        dark ? 'border-dark-hairline bg-dark-surface group-hover:border-accent-on-dark' : 'border-line bg-surface group-hover:border-accent',
      )}
    >
      <svg className={cx('h-4 w-4', dark ? 'text-accent-on-dark' : 'text-accent')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

export function Logo({ to = '/', dark = false }: { to?: string; dark?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5 rounded-[4px]">
      <Mark dark={dark} />
      <span className={cx('font-serif-heading text-[18px] font-semibold tracking-tight', dark ? 'text-dark-ink' : 'text-ink')}>SkillProof</span>
    </Link>
  );
}

/** Thin bar at the very top while requests are in flight (after 150 ms, so quick ones show nothing). */
export function TopProgress() {
  const pending = usePendingRequests();
  const shown = useDelayed(pending > 0);
  if (!shown) return null;
  return (
    <div role="progressbar" aria-label={tr('Loading')} className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px] overflow-hidden bg-accent/15">
      <div className="top-progress-bar" />
    </div>
  );
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-on-dark';

/** A floating label (and sub-items) next to an icon of the collapsed menu. */
interface Flyout {
  item: NavItem;
  top: number;
  /** The icon it belongs to, to give focus back on Escape. */
  trigger: HTMLElement;
  /** Opened from the keyboard: focus moves to its first link. */
  focus?: boolean;
}

function SidebarBody({
  sections,
  active,
  collapsed,
  onToggleCollapsed,
}: {
  sections: NavSection[];
  active: string | null;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { me, org, selectOrg, signOut } = useAuth();
  const orgs = me?.organizations ?? [];
  const name = me?.profile.display_name || me?.email || tr('Account');
  const activePage = activeParent(sections, active);

  // A page with sub-items opens by itself when it is the current page; the chevron opens or closes it by hand.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => toggled[key] ?? key === activePage;
  useEffect(() => setToggled({}), [activePage]);

  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const panel = useRef<HTMLDivElement>(null);
  // After Escape, focus goes back to the icon without reopening the panel.
  const quietFocus = useRef(false);
  const showFlyout = (item: NavItem, el: HTMLElement, focus = false) => {
    clearTimeout(hideTimer.current);
    if (quietFocus.current && !focus) {
      quietFocus.current = false;
      return;
    }
    setFlyout({ item, top: el.getBoundingClientRect().top, trigger: el, focus });
  };
  const hideFlyout = () => {
    hideTimer.current = setTimeout(() => setFlyout(null), 120);
  };
  const closeFlyout = (giveFocusBack: boolean) => {
    clearTimeout(hideTimer.current);
    const trigger = flyout?.trigger;
    setFlyout(null);
    if (giveFocusBack && trigger) {
      quietFocus.current = true;
      trigger.focus();
    }
  };
  useEffect(() => setFlyout(null), [active, collapsed]);
  // Opened from the keyboard: focus its first sub-item (or the page link when it has none).
  useEffect(() => {
    if (!flyout?.focus) return;
    const links = panel.current?.querySelectorAll<HTMLElement>('a');
    (links?.[1] ?? links?.[0])?.focus();
  }, [flyout]);

  /** Collapsed menu, on an icon: Enter or → opens the panel of a page with sections and moves focus into it. */
  const onIconKey = (item: NavItem) => (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (!collapsed || !item.children?.length) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      showFlyout(item, e.currentTarget, true);
    }
  };
  /** Inside the panel: ↑/↓ move, Escape or ← close and go back to the icon, leaving it with Tab closes it. */
  const onPanelKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const links = [...(panel.current?.querySelectorAll<HTMLElement>('a') ?? [])];
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      e.preventDefault();
      closeFlyout(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      links[(i + 1) % links.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      links[(i - 1 + links.length) % links.length]?.focus();
    }
  };

  const linkClass = (isActive: boolean, inTrail: boolean, sub = false) =>
    cx(
      'relative flex items-center gap-3 rounded-[4px] text-[13px] transition-colors',
      focusRing,
      sub ? 'py-1.5 pr-2.5 pl-[42px]' : collapsed ? 'justify-center py-2.5' : 'py-2 pr-2.5 pl-3',
      isActive
        ? 'bg-accent/20 font-semibold text-white before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-r-[2px] before:bg-accent-on-dark'
        : inTrail
          ? 'font-semibold text-dark-ink hover:bg-dark-surface'
          : 'font-medium text-dark-muted hover:bg-dark-surface hover:text-dark-ink',
    );

  return (
    <div className="flex h-full flex-col bg-dark-canvas text-dark-ink">
      <div className={cx('flex h-14 shrink-0 items-center border-b border-dark-hairline', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? (
          <Link to="/events" aria-label={tr('SkillProof home')} className={cx('group rounded-[4px]', focusRing)}>
            <Mark dark />
          </Link>
        ) : (
          <Logo to="/events" dark />
        )}
      </div>

      <nav aria-label={tr('Main')} className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        {sections.map((section, i) => (
          <div key={section.key} className={cx(i > 0 && 'mt-4 border-t border-dark-hairline pt-4')}>
            {!collapsed && (
              <p className="font-mono-code mb-2 truncate px-3 text-[10px] font-semibold tracking-[0.14em] text-dark-muted uppercase" title={section.title}>
                {section.key === 'org' ? tr('Org // {name}', { name: section.title }) : section.title}
              </p>
            )}
            {section.key === 'org' && orgs.length > 1 && !collapsed && (
              <label className="mb-2 block px-2">
                <span className="sr-only">{tr('Organization')}</span>
                <select
                  value={org?.id ?? ''}
                  onChange={(e) => selectOrg(e.target.value)}
                  className="w-full rounded-[4px] border border-dark-hairline bg-dark-surface px-2 py-1.5 text-[12px] text-dark-ink focus:border-accent-on-dark focus:outline-none"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = item.key === active;
                const inTrail = item.key === activePage && !isActive;
                const children = item.children ?? [];
                const open = children.length > 0 && !collapsed && isOpen(item.key);
                const subId = `nav-sub-${item.key}`;
                return (
                  <li
                    key={item.key}
                    onMouseEnter={collapsed ? (e) => showFlyout(item, e.currentTarget) : undefined}
                    onMouseLeave={collapsed ? hideFlyout : undefined}
                  >
                    <div className="flex items-center gap-1">
                      <Link
                        to={item.to}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={collapsed ? item.label : undefined}
                        aria-haspopup={collapsed && children.length > 0 ? 'menu' : undefined}
                        aria-expanded={collapsed && children.length > 0 ? flyout?.item.key === item.key : undefined}
                        onFocus={collapsed ? (e) => showFlyout(item, e.currentTarget) : undefined}
                        onBlur={collapsed ? hideFlyout : undefined}
                        onKeyDown={onIconKey(item)}
                        className={cx(linkClass(isActive || (collapsed && item.key === activePage), inTrail), 'min-w-0 flex-1')}
                      >
                        <Symbol name={ICON[item.icon]} className={isActive || inTrail ? 'text-accent-on-dark' : undefined} />
                        {!collapsed && (
                          <span className="truncate" title={item.label}>
                            {item.label}
                          </span>
                        )}
                      </Link>
                      {children.length > 0 && !collapsed && (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={subId}
                          aria-label={open ? tr('Collapse {page}', { page: item.label }) : tr('Expand {page}', { page: item.label })}
                          onClick={() => setToggled((t) => ({ ...t, [item.key]: !open }))}
                          className={cx('flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-dark-muted hover:bg-dark-surface hover:text-dark-ink', focusRing)}
                        >
                          <Symbol name="expand_more" className={cx('text-[18px] transition-transform', open && 'rotate-180')} />
                        </button>
                      )}
                    </div>
                    {open && (
                      <ul id={subId} className="relative mt-0.5 mb-1 space-y-0.5 before:absolute before:inset-y-1 before:left-[22px] before:w-px before:bg-dark-hairline">
                        {children.map((c) => (
                          <li key={c.key}>
                            {/* A #section is a place on the page; a course is a page of its own. */}
                            <Link
                              to={c.to}
                              aria-current={c.key === active ? (c.to.includes('#') ? 'location' : 'page') : undefined}
                              className={linkClass(c.key === active, false, true)}
                            >
                              <span className="truncate" title={c.label}>
                                {c.label}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {flyout && collapsed && (
        <div
          ref={panel}
          role="menu"
          aria-label={flyout.item.label}
          onMouseEnter={() => clearTimeout(hideTimer.current)}
          onMouseLeave={hideFlyout}
          onFocus={() => clearTimeout(hideTimer.current)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideFlyout();
          }}
          onKeyDown={onPanelKey}
          className="fixed left-[60px] z-[60] min-w-[200px] rounded-[6px] border border-dark-hairline bg-dark-surface p-1.5 text-[13px] text-dark-ink"
          style={{ top: flyout.top }}
        >
          <Link role="menuitem" to={flyout.item.to} className={cx('block rounded-[4px] px-3 py-1.5 font-semibold hover:bg-dark-canvas', focusRing)}>
            {flyout.item.label}
          </Link>
          {(flyout.item.children ?? []).map((c) => (
            <Link
              key={c.key}
              role="menuitem"
              to={c.to}
              title={c.label}
              className={cx(
                'block max-w-[280px] truncate rounded-[4px] py-1.5 pr-3 pl-5 hover:bg-dark-canvas',
                focusRing,
                c.key === active ? 'font-semibold text-accent-on-dark' : 'text-dark-muted hover:text-dark-ink',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}

      <div className="shrink-0 border-t border-dark-hairline p-2">
        {!collapsed && !me && (
          <div aria-hidden="true" className="mb-2 flex items-center gap-2.5 px-2 py-1.5">
            <span className="h-8 w-8 shrink-0 rounded-[4px] bg-dark-surface" />
            <div className="flex-1 space-y-1.5">
              <span className="block h-3 w-24 rounded-[3px] bg-dark-surface" />
              <span className="block h-2 w-16 rounded-[3px] bg-dark-surface" />
            </div>
          </div>
        )}
        {!collapsed && me && (
          <div className="mb-2 flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-dark-hairline bg-dark-surface text-[13px] font-semibold text-dark-ink" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-dark-ink">{name}</p>
              <p className="font-mono-code truncate text-[10px] tracking-wider text-dark-muted uppercase">
                {roleLabel(org)}
                {org ? ` · ${org.name}` : ''}
              </p>
            </div>
          </div>
        )}
        <div className={cx('flex gap-1', collapsed && 'flex-col')}>
          <button
            type="button"
            onClick={() => void signOut()}
            title={collapsed ? tr('Sign out') : undefined}
            aria-label={collapsed ? tr('Sign out') : undefined}
            className={cx(
              'flex flex-1 cursor-pointer items-center gap-2 rounded-[4px] border border-dark-hairline py-1.5 text-[12px] font-medium text-dark-muted hover:bg-dark-surface hover:text-dark-ink',
              focusRing,
              collapsed ? 'justify-center px-0' : 'px-2.5',
            )}
          >
            <Symbol name="logout" className="text-[18px]" />
            {!collapsed && <span>{tr('Sign out')}</span>}
          </button>
          {/* Theme and language together: the page preferences live in one place. */}
          <PreferenceControls onDark vertical={collapsed} placement={collapsed ? 'right-end' : 'top-end'} />
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? tr('Expand menu') : tr('Collapse menu')}
            title={collapsed ? tr('Expand menu') : tr('Collapse menu')}
            className={cx(
              'mt-1 flex w-full cursor-pointer items-center gap-2 rounded-[4px] py-1.5 text-[12px] font-medium text-dark-muted hover:bg-dark-surface hover:text-dark-ink',
              focusRing,
              collapsed ? 'justify-center px-0' : 'px-2.5',
            )}
          >
            <Symbol name={collapsed ? 'left_panel_open' : 'left_panel_close'} className="text-[18px]" />
            {!collapsed && <span>{tr('Collapse menu')}</span>}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The #section being read on pages whose sections are sub-items of the menu (scroll-spy): the last one whose top
 * has passed the line below the top bar. '' when none has, or the page has no such sections.
 */
function useSectionSpy(ids: string[]): string {
  const [current, setCurrent] = useState('');
  const key = ids.join(',');
  useEffect(() => {
    if (!ids.length) {
      setCurrent('');
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      let found = '';
      let bestTop = -Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= SPY_LINE_PX && top > bestTop) {
          bestTop = top;
          found = `#${id}`;
        }
      }
      // At the very bottom, the last section counts even if it is short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        const last = [...ids].reverse().find((id) => document.getElementById(id));
        if (last) found = `#${last}`;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return current;
}

/**
 * Scrolls to the #section of the URL once it exists and the page has finished loading (content loading above it
 * would push it down after the scroll). Gives up waiting after 4 s.
 */
function useScrollToHash(hash: string, pathname: string) {
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if ((el && pendingRequests() === 0) || ++tries > 40) {
        clearInterval(timer);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
    return () => clearInterval(timer);
  }, [hash, pathname]);
}

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])';

/** The signed-in app: dark side menu on desktop, top bar and drawer on smaller screens. */
export function AppShell({ children }: { children: ReactNode }) {
  const { me, org } = useAuth();
  const location = useLocation();
  const courses = useNavCourses(org?.id ?? null, !!org?.permissions.includes('course.manage'));
  const sections = useMemo(() => navSections(me, org, courses), [me, org, courses]);

  // Sections of the current page that are sub-items of the menu, for the scroll-spy.
  const pageSections = useMemo(() => {
    const ids: string[] = [];
    for (const s of sections)
      for (const item of s.items)
        for (const c of item.children ?? []) {
          const [base, hash] = c.to.split('#');
          if (base === location.pathname && hash) ids.push(hash);
        }
    return ids;
  }, [sections, location.pathname]);
  const spied = useSectionSpy(pageSections);
  const active = activeItem(sections, location.pathname, spied || location.hash);
  useScrollToHash(location.hash, location.pathname);

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // storage blocked: the choice lasts for this visit only
      }
      return !c;
    });
  }

  // The drawer closes when the user navigates.
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  // While the drawer is open: no page scroll, focus stays inside, Escape closes it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const button = opener.current;
    drawer.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !drawer.current) return;
      const items = [...drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
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
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-paper text-ink lg:flex">
      <TopProgress />
      <a
        href="#main"
        className="sr-only z-[60] rounded-[4px] bg-accent px-3 py-2 text-[13px] font-medium text-on-accent focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {tr('Skip to content')}
      </a>

      {/* Phones and tablets: a minimal dark top bar with the menu button. */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-dark-hairline bg-dark-canvas px-4 lg:hidden">
        <Logo to="/events" dark />
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-menu"
          aria-label={tr('Open menu')}
          className={cx('flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border border-dark-hairline text-dark-ink hover:bg-dark-surface', focusRing)}
        >
          <Symbol name="menu" />
        </button>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label={tr('Close menu')} tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-ink/50" />
          <div ref={drawer} id="app-menu" role="dialog" aria-modal="true" aria-label={tr('Menu')} className="absolute inset-y-0 left-0 w-[288px] max-w-[85vw]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tr('Close menu')}
              className={cx('absolute top-2.5 right-2.5 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border border-dark-hairline text-dark-ink hover:bg-dark-surface', focusRing)}
            >
              <Symbol name="close" />
            </button>
            <SidebarBody sections={sections} active={active} collapsed={false} />
          </div>
        </div>
      )}

      {/* Desktop: fixed dark side menu, collapsible to icons. */}
      <aside className={cx('no-print sticky top-0 hidden h-screen shrink-0 lg:block', collapsed ? 'w-16' : 'w-64')}>
        <SidebarBody sections={sections} active={active} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto w-full max-w-[1760px] px-4 py-6 sm:px-6 md:px-8 lg:px-10 lg:py-8 2xl:px-12">{children}</div>
      </main>
    </div>
  );
}
