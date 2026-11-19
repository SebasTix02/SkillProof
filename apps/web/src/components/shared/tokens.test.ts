import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSION_LABEL, permissionLabels } from './tokens';

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
