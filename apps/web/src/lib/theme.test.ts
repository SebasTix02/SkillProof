import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('light or dark page', () => {
  it('follows the choice, and the system only when the choice is System', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});
