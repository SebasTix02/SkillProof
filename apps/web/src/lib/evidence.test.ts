import { describe, expect, it } from 'vitest';
import { evidenceLink, timestampSeconds, videoAt } from './evidence';

const ctx = { repoUrl: 'https://github.com/acme/app', sha: 'abc123', videoUrl: 'https://www.youtube.com/watch?v=XYZ' };

describe('timestampSeconds', () => {
  it('reads mm:ss, h:mm:ss and ranges', () => {
    expect(timestampSeconds('00:06')).toBe(6);
    expect(timestampSeconds('06:00')).toBe(360);
    expect(timestampSeconds('1:02:03')).toBe(3723);
    expect(timestampSeconds('01:10-01:45')).toBe(70);
    expect(timestampSeconds('01:10 – 01:45')).toBe(70);
  });

  it('treats paths as files', () => {
    expect(timestampSeconds('src/app.ts')).toBeNull();
    expect(timestampSeconds('docs/00:06.md')).toBeNull();
    expect(timestampSeconds('README.md')).toBeNull();
  });
});

describe('videoAt', () => {
  it('adds t= to YouTube links, keeping the video id', () => {
    expect(videoAt('https://www.youtube.com/watch?v=XYZ', 6)).toBe('https://www.youtube.com/watch?v=XYZ&t=6s');
    expect(videoAt('https://youtu.be/XYZ?t=99', 360)).toBe('https://youtu.be/XYZ?t=360s');
  });

  it('uses a media fragment for other links', () => {
    expect(videoAt('https://cdn.example.com/demo.mp4', 6)).toBe('https://cdn.example.com/demo.mp4#t=6');
  });
});

describe('evidenceLink', () => {
  it('links a timestamp to the video, never to the repository', () => {
    expect(evidenceLink('00:06', ctx)).toEqual({ kind: 'video', label: '00:06', href: 'https://www.youtube.com/watch?v=XYZ&t=6s' });
    expect(evidenceLink('00:06', { ...ctx, videoUrl: null })).toEqual({ kind: 'video', label: '00:06', href: null });
  });

  it('links a file to the frozen commit', () => {
    expect(evidenceLink('src/app.ts', ctx).href).toBe('https://github.com/acme/app/blob/abc123/src/app.ts');
    expect(evidenceLink('src/app.ts', { ...ctx, sha: null }).href).toBeNull();
  });
});
