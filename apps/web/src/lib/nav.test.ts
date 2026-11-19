import { describe, expect, it } from 'vitest';
import type { Me, Organization } from './auth';
import { activeItem, navSections, roleLabel } from './nav';

const PERMS: Record<string, string[]> = {
  org_owner: ['score.override', 'event.create', 'event.manage', 'results.publish', 'org.manage_members', 'org.view_usage', 'audit.read', 'integrity.decide', 'submission.review', 'course.manage'],
  organizer: ['score.override', 'event.create', 'event.manage', 'results.publish', 'org.view_usage', 'integrity.decide', 'submission.review', 'course.manage'],
  judge: ['score.override', 'submission.review'],
  auditor: ['org.view_usage', 'audit.read', 'integrity.decide'],
};

const org = (role: string): Organization => ({ id: 'o1', name: 'Test1', slug: 'test1', roles: [role], permissions: PERMS[role]! });
const me = (orgs: Organization[], publicProfile = false): Me => ({
  profile: { id: 'u1', display_name: 'Ana' },
  email: 'ana@example.com',
  public_profile: { slug: 'ana-1', is_public: publicProfile, headline: '' },
  organizations: orgs,
});

const labels = (m: Me, o: Organization | null) => navSections(m, o).map((s) => [s.title, s.items.map((i) => i.label)]);

describe('side menu by role', () => {
  it('a candidate sees their own screens only', () => {
    expect(labels(me([]), null)).toEqual([['You', ['Events', 'Interviews', 'Account']]]);
    expect(labels(me([], true), null)[0]![1]).toEqual(['Events', 'Interviews', 'Public profile', 'Account']);
  });

  it('an owner sees every organization screen', () => {
    const o = org('org_owner');
    expect(labels(me([o]), o)[1]).toEqual([
      'Test1',
      ['Event console', 'New event', 'Courses & integrity', 'Members & invitations', 'AI usage', 'Audit log'],
    ]);
    expect(roleLabel(o)).toBe('Owner');
  });

  it('an organizer runs events and courses but does not manage members or read the audit log', () => {
    const o = org('organizer');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Event console', 'New event', 'Courses & integrity', 'AI usage']);
  });

  it('a judge sees the review queue', () => {
    const o = org('judge');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Review queue']);
    expect(roleLabel(o)).toBe('Judge');
  });

  it('an auditor sees integrity, usage and the audit log', () => {
    const o = org('auditor');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Event console', 'Courses & integrity', 'AI usage', 'Audit log']);
    expect(roleLabel(null)).toBe('Candidate');
  });
});

describe('highlighted item', () => {
  const o = org('org_owner');
  const sections = navSections(me([o], true), o);

  it('highlights the parent of screens that need an id', () => {
    expect(activeItem(sections, '/e/spring-hack')).toBe('events');
    expect(activeItem(sections, '/interview/abc')).toBe('interviews');
    expect(activeItem(sections, '/interview/new')).toBe('interviews');
    expect(activeItem(sections, '/org/events/abc')).toBe('org-events');
    expect(activeItem(sections, '/org/events/abc/s/def')).toBe('org-events');
    expect(activeItem(sections, '/org/events/abc/compare')).toBe('org-events');
  });

  it('picks the most specific item', () => {
    expect(activeItem(sections, '/org/events/new')).toBe('org-new');
    expect(activeItem(sections, '/org/events/abc/gradebook')).toBe('org-courses');
    expect(activeItem(sections, '/p/ana-1')).toBe('profile');
  });

  it('uses the #section of the settings page', () => {
    expect(activeItem(sections, '/org/settings')).toBe('org-members');
    expect(activeItem(sections, '/org/settings', '#section-usage')).toBe('org-usage');
    expect(activeItem(sections, '/org/settings', '#section-enclave')).toBe('org-audit');
  });

  it('highlights nothing for screens outside the menu', () => {
    expect(activeItem(sections, '/invite/tok')).toBeNull();
    expect(activeItem(sections, '/eventsx')).toBeNull();
  });
});
