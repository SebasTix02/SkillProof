import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Safe dummy values so env() validates without touching live Supabase or Gemini services.
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key-0123456789';
process.env.GEMINI_API_KEY ??= 'test-gemini-api-key-0123456789';
process.env.INTERNAL_SECRET ??= 'test-internal-secret-0123456789';
process.env.WEB_ORIGIN ??= 'http://localhost:5173';

const { buildApp } = await import('./app.js');

describe('Fastify HTTP integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false, rateLimit: { max: 5, windowMs: 60_000 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves /healthz and /api/healthz with defensive security headers', async () => {
    for (const url of ['/healthz', '/api/healthz']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toContain('microphone=(self)');
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    }
  });

  it('rejects unauthenticated /api/me with 401 and Cache-Control: no-store', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('rejects /internal/tick without the internal secret', async () => {
    const res = await app.inject({ method: 'POST', url: '/internal/tick' });
    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('enforces per-IP rate limiting on /api/* and returns 429 with Retry-After', async () => {
    // One request was already made to /api/me above; exhaust the remaining slots in our 5-request test window.
    let lastStatus = 0;
    let retryAfter: string | undefined;
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/me' });
      lastStatus = res.statusCode;
      if (res.statusCode === 429) {
        retryAfter = String(res.headers['retry-after'] ?? '');
        break;
      }
    }
    expect(lastStatus).toBe(429);
    expect(retryAfter).toBe('60');
  });

  it('isolates rate limits per client IP via X-Forwarded-For behind Cloud Run / Vercel proxies', async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'GET', url: '/api/me', headers: { 'x-forwarded-for': '203.0.113.10' } });
    }
    const blocked = await app.inject({ method: 'GET', url: '/api/me', headers: { 'x-forwarded-for': '203.0.113.10' } });
    expect(blocked.statusCode).toBe(429);

    const otherClient = await app.inject({ method: 'GET', url: '/api/me', headers: { 'x-forwarded-for': '198.51.100.22' } });
    expect(otherClient.statusCode).toBe(401);
  });
});
