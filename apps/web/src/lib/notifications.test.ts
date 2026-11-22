import { describe, expect, it } from 'vitest';
import { relativeTime } from './notifications';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

describe('relativeTime', () => {
  it('says how long ago an invitation arrived, in the interface language', () => {
    expect(relativeTime(at(-5 * 60), 'en', NOW)).toBe('5 minutes ago');
    expect(relativeTime(at(-2 * 3600), 'en', NOW)).toBe('2 hours ago');
    expect(relativeTime(at(-2 * 3600), 'es', NOW)).toBe('hace 2 horas');
  });

  it('says when groups close', () => {
    expect(relativeTime(at(3 * 86_400), 'en', NOW)).toBe('in 3 days');
    expect(relativeTime(at(86_400), 'en', NOW)).toBe('tomorrow');
    expect(relativeTime(at(3 * 86_400), 'es', NOW)).toBe('dentro de 3 días');
  });
});
