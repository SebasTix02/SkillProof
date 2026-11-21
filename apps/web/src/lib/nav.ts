/**
 * What the side menu shows: every screen the signed-in user can open, grouped by section.
 *
 * Pure (no React), so the role rules are tested in nav.test.ts. Screens that need an id (an event, a submission,
 * an interview) are not in the menu: they highlight their parent item instead (see `activeItem`). Sections of one
 * page (#section-… of Organization settings or Account) are sub-items (`children`) of that page's item.
 */
import type { Me, Organization } from './auth';

export type NavIcon =
  | 'events'
  | 'interviews'
  | 'profile'
  | 'account'
  | 'console'
  | 'review'
  | 'plus'
  | 'courses'
  | 'integrity'
  | 'myCourses'
  | 'members'
  | 'usage'
  | 'audit'
  | 'settings';

export interface NavItem {
  key: string;
  label: string;
  /** Where the link goes; may carry a #section of the page. */
  to: string;
  icon: NavIcon;
  /** Path patterns this item owns; `*` matches one segment. Defaults to the path of `to`. */
  owns?: string[];
  /** Sections of the same page, shown indented under it. Their `to` carries the #section. */
  children?: NavItem[];
}

export interface NavSection {
  key: string;
  title: string;
  items: NavItem[];
}

export const ROLE_LABEL: Record<string, string> = {
  org_owner: 'Owner',
  organizer: 'Organizer',
  judge: 'Judge',
  auditor: 'Auditor',
};

/** The role shown under the user's name: their highest role in the current organization, else Candidate. */
export function roleLabel(org: Organization | null): string {
  for (const r of ['org_owner', 'organizer', 'auditor', 'judge']) if (org?.roles.includes(r)) return ROLE_LABEL[r]!;
  return 'Candidate';
}

export function navSections(me: Me | null, org: Organization | null): NavSection[] {
  const personal: NavItem[] = [
    { key: 'events', label: 'Events', to: '/events', icon: 'events', owns: ['/events', '/e'] },
    { key: 'interviews', label: 'Interviews', to: '/interviews', icon: 'interviews', owns: ['/interviews', '/interview'] },
  ];
  const slug = me?.public_profile?.slug;
  if (slug && me?.public_profile?.is_public) personal.push({ key: 'profile', label: 'Public profile', to: `/p/${slug}`, icon: 'profile' });
  if ((me?.enrolled_courses ?? 0) > 0) personal.push({ key: 'my-courses', label: 'My courses', to: '/courses', icon: 'myCourses', owns: ['/courses', '/courses/*', '/courses/*/a/*'] });
  personal.push({
    key: 'account',
    label: 'Account',
    to: '/me',
    icon: 'account',
    children: [
      { key: 'account-profile', label: 'Profile', to: '/me#section-profile', icon: 'account' },
      { key: 'account-visibility', label: 'Public dossier', to: '/me#section-visibility', icon: 'account' },
      { key: 'account-integrations', label: 'Connections', to: '/me#section-integrations', icon: 'account' },
      { key: 'account-appearance', label: 'Appearance & language', to: '/me#section-appearance', icon: 'account' },
      { key: 'account-privacy', label: 'Privacy', to: '/me#section-privacy', icon: 'account' },
      { key: 'account-security', label: 'Security & access', to: '/me#section-danger', icon: 'account' },
    ],
  });

  const sections: NavSection[] = [{ key: 'personal', title: 'You', items: personal }];
  if (!org) return sections;

  const can = (p: string) => org.permissions.includes(p);
  const items: NavItem[] = [];
  // A judge who runs nothing sees the events list as their review queue (it opens with their assignments).
  if (can('submission.review') && !can('event.manage'))
    items.push({ key: 'org-events', label: 'Review queue', to: '/org/events', icon: 'review', owns: ['/org/events'] });
  else items.push({ key: 'org-events', label: 'Event console', to: '/org/events', icon: 'console', owns: ['/org/events'] });
  if (can('event.create')) items.push({ key: 'org-new', label: 'New event', to: '/org/events/new', icon: 'plus' });
  // Courses and integrity are separate screens: a course is not an event, and integrity covers events and assignments.
  if (can('course.manage')) items.push({ key: 'org-courses', label: 'Courses', to: '/org/courses', icon: 'courses' });
  if (can('integrity.decide') || can('event.manage'))
    items.push({ key: 'org-integrity', label: 'Integrity', to: '/org/integrity', icon: 'integrity', owns: ['/org/integrity', '/org/events/*/compare'] });
  // Organization settings is one page; its sections are sub-items, each one shown only with its permission.
  const settings: NavItem[] = [];
  if (can('org.manage_members')) {
    settings.push({ key: 'org-members', label: 'Members', to: '/org/settings#section-roster', icon: 'members' });
    settings.push({ key: 'org-invitations', label: 'Invitations', to: '/org/settings#section-dispatch-queue', icon: 'members' });
  }
  if (can('org.view_usage')) settings.push({ key: 'org-usage', label: 'AI usage', to: '/org/settings#section-usage', icon: 'usage' });
  const audit = can('audit.read');
  const policies = can('org.manage_members');
  if (audit || policies)
    settings.push({
      key: 'org-audit',
      label: audit && policies ? 'Audit log & policies' : audit ? 'Audit log' : 'Policies',
      to: '/org/settings#section-enclave',
      icon: 'audit',
    });
  if (settings.length)
    items.push({ key: 'org-settings', label: 'Organization settings', to: '/org/settings', icon: 'settings', children: settings });
  sections.push({ key: 'org', title: org.name, items });
  return sections;
}

/** Segments of a pattern that match the start of a path, or -1. */
function prefixScore(path: string, pattern: string): number {
  const p = path.split('/').filter(Boolean);
  const q = pattern.split('/').filter(Boolean);
  if (q.length > p.length) return -1;
  for (let i = 0; i < q.length; i++) if (q[i] !== '*' && q[i] !== p[i]) return -1;
  return q.length;
}

/** Every item, sub-items included, with the key of its parent. */
export function flatItems(sections: NavSection[]): { item: NavItem; parent: string | null }[] {
  return sections.flatMap((s) =>
    s.items.flatMap((item) => [{ item, parent: null }, ...(item.children ?? []).map((c) => ({ item: c, parent: item.key }))]),
  );
}

/**
 * The item to highlight for a location: the one whose path owns the most segments of it, so /org/events/new
 * picks New event and /org/events/abc/s/1 picks the event console. A sub-item (#section) wins over its page only
 * when the hash names it; with no hash, the page item is highlighted.
 */
export function activeItem(sections: NavSection[], pathname: string, hash = ''): string | null {
  let best: { key: string; score: number } | null = null;
  for (const { item } of flatItems(sections)) {
    const [base, itemHash] = item.to.split('#') as [string, string | undefined];
    let score = Math.max(...(item.owns ?? [base]).map((o) => prefixScore(pathname, o)));
    if (score < 0) continue;
    if (itemHash !== undefined) {
      if (hash !== `#${itemHash}`) continue;
      score += 0.5;
    }
    if (!best || score > best.score) best = { key: item.key, score };
  }
  return best?.key ?? null;
}

/** The page item that holds the highlighted one (itself when it has no parent). */
export function activeParent(sections: NavSection[], key: string | null): string | null {
  if (!key) return null;
  const found = flatItems(sections).find((f) => f.item.key === key);
  return found ? (found.parent ?? found.item.key) : null;
}
