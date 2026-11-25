import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Report, one } from './Report';

describe('Report component & PostgREST relation helper', () => {
  it('normalizes one-to-one PostgREST arrays and objects via one()', () => {
    expect(one([{ id: 'r1' }])).toEqual({ id: 'r1' });
    expect(one([])).toBeNull();
    expect(one({ id: 'r2' })).toEqual({ id: 'r2' });
    expect(one(null)).toBeNull();
  });

  it('renders ownership tier badges, verified skill counts, and candidate verbatim quotes', () => {
    const html = renderToStaticMarkup(
      <Report
        report={{
          ownership_score: 84,
          confidence: 'high',
          summary: 'Strong command of queue backpressure and idempotent retries.',
          skills_json: [
            { skill: 'Concurrency', level: 'strong', evidence_quote: 'We cap active workers at two per instance.' },
            { skill: 'Error handling', level: 'basic', evidence_quote: '' },
          ],
        }}
      />,
    );

    expect(html).toContain('84');
    expect(html).toContain('DIRECT AUTHORSHIP');
    expect(html).toContain('high');
    expect(html).toContain('We cap active workers at two per instance.');
    expect(html).toContain('Strong command of queue backpressure');
  });
});
