import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OfflineBannerView } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('renders nothing while online and exposes an accessible polite status banner when offline', () => {
    expect(renderToStaticMarkup(<OfflineBannerView online={true} />)).toBe('');

    const offlineHtml = renderToStaticMarkup(<OfflineBannerView online={false} />);
    expect(offlineHtml).toContain('role="status"');
    expect(offlineHtml).toContain('aria-live="polite"');
    expect(offlineHtml).toContain('You appear to be offline.');
  });
});
