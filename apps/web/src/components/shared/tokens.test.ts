import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOSSIER_THEMES, PERMISSION_LABEL, permissionLabels } from './tokens';

describe('permission labels', () => {
  it('names every permission the database defines', () => {
    const dir = join(__dirname, '../../../../../supabase/migrations');
    const sql = readdirSync(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const keys = new Set<string>();
    for (const block of sql.matchAll(/insert into public\.permissions[\s\S]*?;/g))
      for (const m of block[0].matchAll(/\('([a-z_]+\.[a-z_]+)'/g)) keys.add(m[1]!);
    expect(keys.size).toBeGreaterThan(5);
    for (const k of keys) expect(PERMISSION_LABEL[k], k).toBeDefined();
  });

  it('shows readable names in a stable order and keeps unknown keys', () => {
    expect(permissionLabels(['audit.read', 'event.manage', 'new.thing'])).toEqual(['Run events', 'Read the audit log', 'new.thing']);
    expect(permissionLabels([])).toEqual([]);
  });
});

describe('colors come from the design system', () => {
  it('section themes are the semantic tones only', () => {
    expect(Object.keys(DOSSIER_THEMES).sort()).toEqual(['accent', 'bad', 'good', 'neutral', 'warn']);
    for (const theme of Object.values(DOSSIER_THEMES)) expect(JSON.stringify(theme)).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('no component uses a loose hex color', () => {
    const root = join(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (/\.(tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(join(dir, e.name));
      }
    };
    walk(root);
    const offenders = files.filter((f) => /\[#[0-9a-fA-F]{3,8}\]|['"`]#[0-9a-fA-F]{3,8}['"`]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('no component paints a fixed white or black surface (dark mode uses surface, paper and well)', () => {
    const root = join(__dirname, '../..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else if (/\.(tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(join(dir, e.name));
      }
    };
    walk(root);
    // bg-white/10 and similar tints on the dark banners are fine; a solid bg-white is not (after:bg-white: switch knob).
    const offenders = files.filter((f) => /(?<![\w:/-])(?:hover:|focus:)?bg-(?:white|black)(?![\w/-])/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
