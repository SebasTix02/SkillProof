import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { batchByTokens, extractFiles, isIgnoredPath, priority, renderFile, sliceLines, splitByBudget } from './engine/files.js';
import { AttemptLimiter, hashAccessCode, verifyAccessCode } from './lib/accessCode.js';
import { AiUnavailableError, aiErrorStatus, isTransientAiError } from './lib/gemini.js';
import { friendlyJobError } from './lib/jobErrors.js';
import { can, isOrgMember, type RoleGrant } from './lib/permissions.js';
import { slugify } from './lib/slug.js';

describe('repository files', () => {
  it('ignores dependencies, lock files, binaries and minified code', () => {
    for (const p of ['node_modules/a/index.js', 'web/dist/app.js', 'package-lock.json', 'assets/logo.png', 'public/app.min.js', 'a/__pycache__/x.py'])
      expect(isIgnoredPath(p)).toBe(true);
    for (const p of ['src/index.ts', 'README.md', 'bin/cli.js', 'app/models.py'])
      expect(isIgnoredPath(p)).toBe(false);
  });

  it('ranks the readme, manifests and entry points above tests and docs', () => {
    const ranked = ['docs/notes.md', 'src/utils/strings.test.ts', 'src/server.ts', 'package.json', 'README.md'].sort((a, b) => priority(b) - priority(a));
    expect(ranked.slice(0, 3)).toEqual(['README.md', 'package.json', 'src/server.ts']);
  });

  it('unpacks a GitHub zipball, strips the wrapper folder and skips what is not source', () => {
    const zip = zipSync({
      'owner-repo-abc123/README.md': strToU8('# Hello'),
      'owner-repo-abc123/src/main.ts': strToU8('export const a = 1;\n'),
      'owner-repo-abc123/node_modules/x/index.js': strToU8('module.exports = 1'),
      'owner-repo-abc123/logo.png': new Uint8Array([137, 80, 78, 71]),
      'owner-repo-abc123/data.bin.txt': new Uint8Array([1, 0, 2]),
      'owner-repo-abc123/gen.ts': strToU8('// @generated\nexport {}'),
      'owner-repo-abc123/empty.ts': new Uint8Array(),
    });
    const files = extractFiles(zip);
    expect(files.map((f) => f.path)).toEqual(['README.md', 'src/main.ts']);
  });

  it('fills the budget by priority and reports the overflow', () => {
    const f = (path: string, tokens: number) => ({ path, text: '', tokens });
    const { full, overflow } = splitByBudget([f('a', 500), f('b', 500), f('c', 100)], 1000);
    expect(full.map((x) => x.path)).toEqual(['a', 'c']);
    expect(overflow.map((x) => x.path)).toEqual(['b']);
  });

  it('batches overflow files under a token limit', () => {
    const f = (path: string, tokens: number) => ({ path, text: '', tokens });
    const batches = batchByTokens([f('a', 60), f('b', 60), f('c', 30), f('huge', 500)], 100, 5);
    expect(batches.map((b) => b.map((x) => x.path))).toEqual([['a'], ['b', 'c']]);
    expect(batchByTokens([f('a', 60), f('b', 60), f('c', 60)], 100, 2)).toHaveLength(2);
  });

  it('numbers lines and slices snippets within bounds', () => {
    expect(renderFile({ path: 'a.ts', text: 'x\ny', tokens: 1 })).toBe('<file path="a.ts">\n1| x\n2| y\n</file>');
    const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    expect(sliceLines(text, 3, 4)).toEqual({ text: 'line 3\nline 4', start: 3, end: 4 });
    expect(sliceLines(text, 90, 500).end).toBe(100);
    expect(sliceLines(text, 1, 100).end).toBe(60);
    expect(sliceLines(text, 500, 600)).toEqual({ text: 'line 100', start: 100, end: 100 });
  });
});

describe('access codes', () => {
  it('verifies the right code and rejects everything else', () => {
    const stored = hashAccessCode('echo-2026');
    expect(stored).not.toContain('echo-2026');
    expect(verifyAccessCode('echo-2026', stored)).toBe(true);
    expect(verifyAccessCode('echo-2027', stored)).toBe(false);
    expect(verifyAccessCode('echo-2026', null)).toBe(false);
    expect(verifyAccessCode('echo-2026', 'garbage')).toBe(false);
  });

  it('limits attempts inside a time window', () => {
    const limiter = new AttemptLimiter(2, 1000);
    expect([limiter.allow('k', 0), limiter.allow('k', 10), limiter.allow('k', 20)]).toEqual([true, true, false]);
    expect(limiter.allow('other', 20)).toBe(true);
    expect(limiter.allow('k', 1500)).toBe(true);
  });
});

describe('permissions', () => {
  const student: RoleGrant = { organization_id: null, role_key: 'student', scope: 'global', permissions: ['event.join', 'interview.take'] };
  const owner: RoleGrant = { organization_id: 'org-a', role_key: 'org_owner', scope: 'organization', permissions: ['event.create', 'event.manage'] };

  it('global permissions apply everywhere, organization permissions only inside that organization', () => {
    const grants = [student, owner];
    expect(can(grants, 'event.join')).toBe(true);
    expect(can(grants, 'event.join', 'org-b')).toBe(true);
    expect(can(grants, 'event.create', 'org-a')).toBe(true);
    expect(can(grants, 'event.create', 'org-b')).toBe(false);
    expect(can(grants, 'event.create')).toBe(false);
    expect(can([student], 'event.create', 'org-a')).toBe(false);
  });

  it('a platform admin can do anything, but only when the role is global', () => {
    expect(can([{ organization_id: null, role_key: 'platform_admin', scope: 'global', permissions: [] }], 'event.create', 'org-b')).toBe(true);
    expect(can([{ organization_id: 'org-a', role_key: 'platform_admin', scope: 'global', permissions: [] }], 'event.create', 'org-b')).toBe(false);
  });

  it('membership', () => {
    expect(isOrgMember([student, owner], 'org-a')).toBe(true);
    expect(isOrgMember([student, owner], 'org-b')).toBe(false);
  });
});

describe('slugs', () => {
  it('makes url-safe slugs', () => {
    expect(slugify('Echo Engineers — Hack 2026!')).toBe('echo-engineers-hack-2026');
    expect(slugify('Ñandú Día')).toBe('nandu-dia');
    expect(slugify('!!')).toBe('event');
  });
});

describe('Gemini errors', () => {
  const overloaded = new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}');

  it('reads the status from the SDK error or from the JSON in the message', () => {
    expect(aiErrorStatus(overloaded)).toBe(503);
    expect(aiErrorStatus(Object.assign(new Error('x'), { status: 429 }))).toBe(429);
    expect(aiErrorStatus(new Error('plain'))).toBeNull();
  });

  it('treats overload, rate limits and dropped connections as worth another try', () => {
    expect(isTransientAiError(overloaded)).toBe(true);
    expect(isTransientAiError(Object.assign(new Error('x'), { status: 429 }))).toBe(true);
    expect(isTransientAiError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientAiError(Object.assign(new Error('bad request'), { status: 400 }))).toBe(false);
    expect(isTransientAiError(new Error('The answer does not match the schema'))).toBe(false);
  });

  it('never shows raw JSON to people', () => {
    const all = new AiUnavailableError(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'], overloaded);
    const text = friendlyJobError(all, 'judge');
    expect(text).toContain('tried 3 models');
    expect(text).toContain('Judge again');
    expect(text).not.toContain('{');
    expect(friendlyJobError(overloaded, 'prepare')).not.toContain('{');
    expect(friendlyJobError(Object.assign(new Error('x'), { status: 403 }), 'evaluate')).toContain('API key');
  });
});
