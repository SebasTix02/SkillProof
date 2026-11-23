import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { ToggleSwitch } from './shared/Controls';
import { ScoreBar } from './shared/Telemetry';

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(html).toContain('All good');
  });

  it('exposes getDerivedStateFromError so render exceptions trigger fallback UI', () => {
    expect(ErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });
  });
});

describe('ToggleSwitch accessibility', () => {
  it('renders an accessible switch with role, aria-checked, and visible focus ring styling', () => {
    const html = renderToStaticMarkup(
      <ToggleSwitch checked={true} onChange={() => {}} ariaLabel="Enable voice defense" />,
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Enable voice defense"');
    expect(html).toContain('peer-focus-visible:outline-2');
  });
});

describe('ScoreBar accessibility', () => {
  it('exposes progressbar semantics with bounded aria-valuenow', () => {
    const html = renderToStaticMarkup(<ScoreBar value={87.4} max={100} label="Ownership score" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="87"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="Ownership score"');
  });
});
