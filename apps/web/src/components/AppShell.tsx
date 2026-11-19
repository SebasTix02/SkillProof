import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { activeItem, navSections, roleLabel, type NavIcon, type NavSection } from '../lib/nav';

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
  members: 'group',
  usage: 'monitoring',
  audit: 'receipt_long',
};

const COLLAPSED_KEY = 'skillproof.sidebar.collapsed';

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

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5 rounded-[4px]">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-line bg-white transition-colors group-hover:border-accent">
        <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span className="font-serif-heading text-[18px] font-semibold tracking-tight text-ink">SkillProof</span>
    </Link>
  );
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
  const name = me?.profile.display_name || me?.email || 'Account';

  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-14 shrink-0 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'px-4')}>
        {collapsed ? (
          <Link to="/events" aria-label="SkillProof home" className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-line bg-white hover:border-accent">
            <svg className="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </Link>
        ) : (
          <Logo to="/events" />
        )}
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        {sections.map((section, i) => (
          <div key={section.key} className={cx(i > 0 && 'mt-5')}>
            {collapsed ? (
              i > 0 && <div className="mx-2 mb-3 h-px bg-line" />
            ) : (
              <p className="font-mono-code mb-1.5 truncate px-2.5 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase" title={section.title}>
                {section.key === 'org' ? `Org // ${section.title}` : section.title}
              </p>
            )}
            {section.key === 'org' && orgs.length > 1 && !collapsed && (
              <label className="mb-2 block px-2.5">
                <span className="sr-only">Organization</span>
                <select
                  value={org?.id ?? ''}
                  onChange={(e) => selectOrg(e.target.value)}
                  className="w-full rounded-[4px] border border-line bg-white px-2 py-1.5 text-[12px] text-ink focus:border-accent focus:outline-none"
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
                return (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cx(
                        'flex items-center gap-3 rounded-[4px] border-l-2 py-2 text-[13px] transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-2.5',
                        isActive
                          ? 'border-accent bg-accent-soft font-semibold text-accent'
                          : 'border-transparent font-medium text-muted hover:bg-paper hover:text-ink',
                      )}
                    >
                      <Symbol name={ICON[item.icon]} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        {!collapsed && (
          <div className="mb-2 flex items-center gap-2.5 px-2.5 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-line bg-paper text-[13px] font-semibold text-ink" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
              <p className="font-mono-code truncate text-[10px] tracking-wider text-muted uppercase">
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
            title={collapsed ? 'Sign out' : undefined}
            aria-label={collapsed ? 'Sign out' : undefined}
            className={cx(
              'btn-tactile flex flex-1 cursor-pointer items-center gap-2 rounded-[4px] border border-line bg-white py-1.5 text-[12px] font-medium text-muted hover:border-muted hover:text-ink',
              collapsed ? 'justify-center px-0' : 'px-2.5',
            )}
          >
            <Symbol name="logout" className="text-[18px]" />
            {!collapsed && <span>Sign out</span>}
          </button>
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
              title={collapsed ? 'Expand menu' : 'Collapse menu'}
              className="btn-tactile flex cursor-pointer items-center justify-center rounded-[4px] border border-line bg-white px-2 py-1.5 text-muted hover:border-muted hover:text-ink"
            >
              <Symbol name={collapsed ? 'left_panel_open' : 'left_panel_close'} className="text-[18px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])';

/** The signed-in app: side menu on desktop, top bar and drawer on smaller screens. */
export function AppShell({ banner, children }: { banner?: ReactNode; children: ReactNode }) {
  const { me, org } = useAuth();
  const location = useLocation();
  const sections = useMemo(() => navSections(me, org), [me, org]);
  const active = activeItem(sections, location.pathname, location.hash);

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
      <a
        href="#main"
        className="sr-only z-[60] rounded-[4px] bg-accent px-3 py-2 text-[13px] font-medium text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* Phones and tablets: a minimal top bar with the menu button. */}
      <header className="no-print sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-4 lg:hidden">
        <Logo to="/events" />
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-menu"
          aria-label="Open menu"
          className="btn-tactile flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border border-line bg-white text-ink hover:border-muted"
        >
          <Symbol name="menu" />
        </button>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-ink/40" />
          <div
            ref={drawer}
            id="app-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 w-[288px] max-w-[85vw] border-r border-line bg-white"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute top-2.5 right-2.5 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[4px] border border-line bg-white text-ink hover:border-muted"
            >
              <Symbol name="close" />
            </button>
            <SidebarBody sections={sections} active={active} collapsed={false} />
          </div>
        </div>
      )}

      {/* Desktop: fixed side menu, collapsible to icons. */}
      <aside
        className={cx(
          'no-print sticky top-0 hidden h-screen shrink-0 border-r border-line bg-white lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarBody sections={sections} active={active} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
        <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:py-10">
          {banner}
          {children}
        </div>
      </main>
    </div>
  );
}
