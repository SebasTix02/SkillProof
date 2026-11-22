import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Tabs, type TabItem, type TabsVariant } from './Tabs';

const TABS: TabItem<'a' | 'b' | 'c'>[] = [
  { key: 'a', label: 'Submissions', count: 3, icon: 'group' },
  { key: 'b', label: 'Similarity', count: 0 },
  { key: 'c', label: 'Rubric', disabled: true },
];

const html = (variant: TabsVariant, tabs: TabItem<string>[] = TABS) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <Tabs variant={variant} tabs={tabs} active="a" onChange={() => {}} ariaLabel="Sections" idBase="rev" />
    </MemoryRouter>,
  );

describe('Tabs', () => {
  it('underline is a labelled tablist; only the selected tab is in the Tab order', () => {
    const out = html('underline');
    expect(out).toContain('role="tablist" aria-label="Sections"');
    expect(out.match(/role="tab"/g)).toHaveLength(3);
    expect(out).toMatch(/id="rev-tab-a" aria-controls="rev-panel-a" aria-selected="true" tabindex="0"/);
    expect(out).toMatch(/id="rev-tab-b" aria-controls="rev-panel-b" aria-selected="false" tabindex="-1"/);
    expect(out).toMatch(/aria-selected="false" tabindex="-1" disabled=""/);
  });

  it('segmented and chips are radio groups', () => {
    for (const v of ['segmented', 'chips'] as const) {
      const out = html(v);
      expect(out).toContain('role="radiogroup" aria-label="Sections"');
      expect(out).toMatch(/role="radio"[^>]*aria-checked="true"/);
      expect(out).not.toContain('role="tab"');
    }
  });

  it('shows counts, including zero, and marks the selected one with the accent', () => {
    const out = html('underline');
    expect(out).toMatch(/bg-accent-soft text-accent-ink">3</);
    expect(out).toMatch(/text-muted">0</);
  });

  it('with links it is a nav with aria-current instead of tabs', () => {
    const out = html('underline', [
      { key: 'a', label: 'Overview', to: '/c/1' },
      { key: 'b', label: 'Roster', to: '/c/1/roster' },
    ]);
    expect(out).toContain('<nav aria-label="Sections">');
    expect(out).toContain('aria-current="page"');
    expect(out).not.toContain('role="tab');
    expect(out).toContain('href="/c/1/roster"');
  });
});
