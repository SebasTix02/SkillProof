import { describe, expect, it } from 'vitest';
import type { Me, Organization } from './auth';
import { activeItem, activeParent, navSections, roleLabel } from './nav';

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
/** Sub-items of Settings. */
const subs = (o: Organization) =>
  navSections(me([o]), o)[1]!.items.find((i) => i.key === 'org-settings')?.children?.map((c) => c.label) ?? [];

describe('side menu by role', () => {
  it('a candidate sees their own screens only', () => {
    expect(labels(me([]), null)).toEqual([['You', ['Events', 'Interviews', 'Account']]]);
    expect(labels(me([], true), null)[0]![1]).toEqual(['Events', 'Interviews', 'Public profile', 'Account']);
  });

  it('an owner sees every organization screen', () => {
    const o = org('org_owner');
    expect(labels(me([o]), o)[1]).toEqual(['Test1', ['Event console', 'New event', 'Courses', 'Integrity', 'Settings']]);
    expect(subs(o)).toEqual(['Members', 'Invitations', 'AI usage', 'Audit log & policies']);
    expect(roleLabel(o)).toBe('Owner');
  });

  it('an organizer runs events and courses but does not manage members or read the audit log', () => {
    const o = org('organizer');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Event console', 'New event', 'Courses', 'Integrity', 'Settings']);
    expect(subs(o)).toEqual(['AI usage']);
  });

  it('a judge sees the review queue', () => {
    const o = org('judge');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Review queue']);
    expect(subs(o)).toEqual([]);
    expect(roleLabel(o)).toBe('Judge');
  });

  it('an auditor sees integrity, usage and the audit log', () => {
    const o = org('auditor');
    expect(labels(me([o]), o)[1]![1]).toEqual(['Event console', 'Integrity', 'Settings']);
    expect(subs(o)).toEqual(['AI usage', 'Audit log']);
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
    expect(activeItem(sections, '/org/events/abc/compare')).toBe('org-integrity');
  });

  it('picks the most specific item', () => {
    expect(activeItem(sections, '/org/events/new')).toBe('org-new');
    expect(activeItem(sections, '/org/courses/c1/roster')).toBe('org-courses');
    expect(activeItem(sections, '/org/courses/c1/assignments/a1')).toBe('org-courses');
    expect(activeItem(sections, '/org/courses/c1/assignments/a1/s/s1')).toBe('org-courses');
    expect(activeItem(sections, '/org/integrity/e1')).toBe('org-integrity');
    expect(activeItem(sections, '/p/ana-1')).toBe('profile');
  });

  it('marks the section being read as a sub-item, and its page as the parent', () => {
    expect(activeItem(sections, '/org/settings')).toBe('org-settings');
    expect(activeItem(sections, '/org/settings', '#section-usage')).toBe('org-usage');
    expect(activeItem(sections, '/org/settings', '#section-enclave')).toBe('org-audit');
    expect(activeParent(sections, 'org-usage')).toBe('org-settings');
    expect(activeParent(sections, 'org-settings')).toBe('org-settings');
    expect(activeItem(sections, '/me', '#section-privacy')).toBe('account-privacy');
    expect(activeParent(sections, 'account-privacy')).toBe('account');
    expect(activeItem(sections, '/me', '#unknown')).toBe('account');
  });

  it('highlights nothing for screens outside the menu', () => {
    expect(activeItem(sections, '/invite/tok')).toBeNull();
    expect(activeItem(sections, '/eventsx')).toBeNull();
  });
});

describe('courses of the organization in the menu', () => {
  const o = org('org_owner');
  const course = (i: number) => ({ id: `c${i}`, name: `Course ${i}`, code: `C-${i}` });
  const courseItem = (courses: ReturnType<typeof course>[], role = 'org_owner') =>
    navSections(me([org(role)]), org(role), courses)[1]!.items.find((i) => i.key === 'org-courses');

  it('lists each course under Courses, and nothing when there are none', () => {
    expect(courseItem([])?.children).toBeUndefined();
    expect(courseItem([course(1), course(2)])?.children?.map((c) => [c.label, c.to])).toEqual([
      ['Course 1', '/org/courses/c1'],
      ['Course 2', '/org/courses/c2'],
    ]);
  });

  it('with many courses, shows the first ones and a link to all of them', () => {
    const many = Array.from({ length: 11 }, (_, i) => course(i + 1));
    const children = courseItem(many)!.children!;
    expect(children).toHaveLength(9);
    expect(children.at(-1)).toMatchObject({ label: 'All courses (11)', to: '/org/courses' });
  });

  it('highlights the course on any of its pages, and Courses on the list', () => {
    const sections = navSections(me([o]), o, [course(1), course(2)]);
    expect(activeItem(sections, '/org/courses')).toBe('org-courses');
    expect(activeItem(sections, '/org/courses/c2')).toBe('org-course-c2');
    expect(activeItem(sections, '/org/courses/c1/roster')).toBe('org-course-c1');
    expect(activeItem(sections, '/org/courses/c1/assignments/a1/s/s1')).toBe('org-course-c1');
    expect(activeParent(sections, 'org-course-c1')).toBe('org-courses');
  });

  it('is not shown to roles that cannot manage courses', () => {
    expect(courseItem([course(1)], 'judge')).toBeUndefined();
    expect(courseItem([course(1)], 'auditor')).toBeUndefined();
  });
});

describe('courses for students', () => {
  it('shows My courses only to people on a course roster', () => {
    const student = (n: number) => ({ ...me([]), enrolled_courses: n });
    expect(labels(student(0), null)[0]![1]).not.toContain('My courses');
    expect(labels(student(2), null)[0]![1]).toEqual(['Events', 'Interviews', 'My courses', 'Account']);
    expect(activeItem(navSections(student(2), null), '/courses')).toBe('my-courses');
    expect(activeItem(navSections(student(2), null), '/courses/c1')).toBe('my-courses');
    expect(activeItem(navSections(student(2), null), '/courses/c1/a/a1')).toBe('my-courses');
  });
});
