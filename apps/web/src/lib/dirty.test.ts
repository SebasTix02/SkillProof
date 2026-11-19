import { describe, expect, it } from 'vitest';
import { internalTarget, isDirty } from './dirty';

describe('unsaved changes', () => {
  it('only counts real changes', () => {
    const loaded = { name: 'Ana', headline: 'Rust', isPublic: false };
    expect(isDirty(loaded, { ...loaded })).toBe(false);
    expect(isDirty(loaded, { isPublic: false, headline: 'Rust', name: 'Ana' })).toBe(false); // key order
    expect(isDirty(loaded, { ...loaded, headline: 'Rust  ' })).toBe(false); // trailing spaces
    expect(isDirty(loaded, { ...loaded, isPublic: true })).toBe(true);
    expect(isDirty({ retention_days: 365 }, { retention_days: 365, allow_judge_overrides: undefined })).toBe(false);
    expect(isDirty({ retention_days: 365 }, { retention_days: 180 })).toBe(true);
  });

  it('asks before in-app links to another page, not for sections of the same page or new tabs', () => {
    const here = new URL('https://skillproof.test/me') as unknown as Location;
    const a = (href: string, target = '') => ({ href, target, hasAttribute: () => false }) as unknown as HTMLAnchorElement;
    expect(internalTarget(a('https://skillproof.test/events'), here)).toBe('/events');
    expect(internalTarget(a('https://skillproof.test/me#section-privacy'), here)).toBeNull();
    expect(internalTarget(a('https://github.com/x'), here)).toBeNull();
    expect(internalTarget(a('https://skillproof.test/events', '_blank'), here)).toBeNull();
    expect(internalTarget(null, here)).toBeNull();
  });
});
