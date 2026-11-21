import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esText } from './esText';

/** Every tr('…') / trn('…', '…') text written in the app's source files. */
function screenTexts(): Map<string, string> {
  const root = join(__dirname, '..');
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name !== 'i18n') walk(join(dir, e.name));
      } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
        const src = readFileSync(join(dir, e.name), 'utf8');
        for (const m of src.matchAll(/\btrn?\(\s*'((?:[^'\\]|\\.)*)'(?:\s*,\s*'((?:[^'\\]|\\.)*)')?/g)) {
          for (const g of [m[1], m[2]]) if (g !== undefined) out.set(g.replace(/\\'/g, "'").replace(/\\\\/g, '\\'), e.name);
        }
      }
    }
  };
  walk(root);
  return out;
}

describe('the interface in Spanish', () => {
  it('has a Spanish text for every screen text in the code', () => {
    const missing = [...screenTexts()].filter(([text]) => !(text in esText)).map(([text, file]) => `${file}: ${text}`);
    expect(missing).toEqual([]);
  });

  it('keeps the same {variables} in both languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const wrong = Object.entries(esText).filter(([en, es]) => vars(en).join() !== vars(es).join()).map(([en]) => en);
    expect(wrong).toEqual([]);
  });
});
