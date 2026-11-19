/**
 * What the side menu shows: every screen the signed-in user can open, grouped by section.
 *
 * Pure (no React), so the role rules are tested in nav.test.ts. Screens that need an id (an event, a submission,
 * an interview) are not in the menu: they highlight their parent item instead (see `activeItem`).
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
  | 'members'
  | 'usage'
  | 'audit';

export interface NavItem {
  key: string;
  label: string;
  /** Where the link goes; may carry a #section of the page. */
  to: string;
  icon: NavIcon;
  /** Path patterns this item owns; `*` matches one segment. Defaults to the path of `to`. */
  owns?: string[];
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
  personal.push({ key: 'account', label: 'Account', to: '/me', icon: 'account' });

  const sections: NavSection[] = [{ key: 'personal', title: 'You', items: personal }];
  if (!org) return sections;

  const can = (p: string) => org.permissions.includes(p);
  const items: NavItem[] = [];
  // A judge who runs nothing sees the events list as their review queue (it opens with their assignments).
  if (can('submission.review') && !can('event.manage'))
    items.push({ key: 'org-events', label: 'Review queue', to: '/org/events', icon: 'review', owns: ['/org/events'] });
  else items.push({ key: 'org-events', label: 'Event console', to: '/org/events', icon: 'console', owns: ['/org/events'] });
  if (can('event.create')) items.push({ key: 'org-new', label: 'New event', to: '/org/events/new', icon: 'plus' });
  if (can('course.manage') || can('integrity.decide'))
    items.push({ key: 'org-courses', label: 'Courses & integrity', to: '/org/courses', icon: 'courses', owns: ['/org/courses', '/org/events/*/gradebook'] });
  if (can('org.manage_members'))
    items.push({ key: 'org-members', label: 'Members & invitations', to: '/org/settings#section-roster', icon: 'members' });
  if (can('org.view_usage')) items.push({ key: 'org-usage', label: 'AI usage', to: '/org/settings#section-usage', icon: 'usage' });
  if (can('audit.read')) items.push({ key: 'org-audit', label: 'Audit log', to: '/org/settings#section-enclave', icon: 'audit' });
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

/**
 * The item to highlight for a location: the one whose path owns the most segments of it, so /org/events/new
 * picks New event and /org/events/abc/s/1 picks the event console. A #section only matches its own hash; with
 * no hash, the first item of that page wins.
 */
export function activeItem(sections: NavSection[], pathname: string, hash = ''): string | null {
  let best: { key: string; score: number } | null = null;
  for (const item of sections.flatMap((s) => s.items)) {
    const [base, itemHash] = item.to.split('#') as [string, string | undefined];
    let score = Math.max(...(item.owns ?? [base]).map((o) => prefixScore(pathname, o)));
    if (score < 0) continue;
    if (itemHash !== undefined) {
      if (hash && hash !== `#${itemHash}`) continue;
      if (hash) score += 0.5;
    }
    if (!best || score > best.score) best = { key: item.key, score };
  }
  return best?.key ?? null;
}
