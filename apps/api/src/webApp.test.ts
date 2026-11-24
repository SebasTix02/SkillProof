import compress from '@fastify/compress';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { contentSecurityPolicy, injectRuntimeConfig, inlineScriptHashes, isApiPath, registerWebApp } from './lib/webApp.js';

describe('web app served by the API (Cloud Run)', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'skillproof-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html><head><title>x</title></head><body></body></html>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dir, 'assets', 'big-abc123.js'), 'console.log("SkillProof");\n'.repeat(200));
    writeFileSync(join(dir, 'robots.txt'), 'User-agent: *');
    app = Fastify({ logger: false });
    await app.register(compress, { global: true, threshold: 1024 });
    app.get('/api/healthz', async () => ({ ok: true }));
    await registerWebApp(app, dir, { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key-0123456789abcdef' });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers page routes with index.html and the runtime config', async () => {
    for (const url of ['/', '/events', '/org/events/123/s/456']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('window.__SKILLPROOF_CONFIG__={"supabaseUrl":"https://example.supabase.co"');
    }
  });

  it('caches hashed assets for a year and other files for an hour', async () => {
    const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(robots.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('compresses files when the browser accepts it', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/big-abc123.js', headers: { 'accept-encoding': 'br, gzip' } });
    expect(res.statusCode).toBe(200);
    expect(['br', 'gzip']).toContain(res.headers['content-encoding']);
  });

  it('keeps API paths as JSON, never the web app', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/healthz' })).json()).toEqual({ ok: true });
    const missing = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect((await app.inject({ method: 'POST', url: '/events' })).statusCode).toBe(404);
  });

  it('does not serve files outside the folder', async () => {
    const res = await app.inject({ method: 'GET', url: '/../package.json' });
    expect(res.body).not.toContain('"dependencies"');
  });

  it('escapes the config so a value cannot close the script tag', () => {
    const html = injectRuntimeConfig('<head></head>', { supabaseUrl: '</script><script>alert(1)', supabaseAnonKey: 'k' });
    expect(html).not.toContain('</script><script>alert');
    expect(html).toContain('\\u003c/script>');
    expect(injectRuntimeConfig('<head></head>', null)).toBe('<head></head>');
  });

  it('sends a strict Content-Security-Policy with the page', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('https://example.supabase.co wss://example.supabase.co');
    expect(csp).toContain('wss://generativelanguage.googleapis.com');
    // Inline scripts are allowed by hash only.
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp.split('script-src')[1]!.split(';')[0]).not.toContain('unsafe-inline');
  });

  it('hashes exactly the inline scripts', () => {
    const html = '<head><script>a()</script><script type="module" src="/x.js"></script><script>b()</script></head>';
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toBe(`'sha256-${createHash('sha256').update('a()').digest('base64')}'`);
    expect(contentSecurityPolicy(html, null)).not.toContain('supabase');
    // A file checked out with Windows line endings: hashed the way the browser sees it.
    expect(inlineScriptHashes('<script>a()\r\nb()</script>')).toEqual(inlineScriptHashes('<script>a()\nb()</script>'));
  });

  it('knows which paths belong to the API', () => {
    expect(isApiPath('/api/me')).toBe(true);
    expect(isApiPath('/internal/tick')).toBe(true);
    expect(isApiPath('/healthz')).toBe(true);
    expect(isApiPath('/interviews')).toBe(false);
  });
});
