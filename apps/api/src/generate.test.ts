import { beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// A fake Gemini: each call takes the next scripted outcome for the model it was asked for.
const script = new Map<string, (Error | string)[]>();
const calls: { model: string; thinking: unknown }[] = [];
vi.mock('@google/genai', async (orig) => ({
  ...(await orig<typeof import('@google/genai')>()),
  GoogleGenAI: class {
    models = {
      generateContent: async ({ model, config }: { model: string; config: { thinkingConfig?: unknown } }) => {
        calls.push({ model, thinking: config.thinkingConfig });
        const next = script.get(model)?.shift();
        if (next === undefined) throw new Error(`no scripted answer for ${model}`);
        if (next instanceof Error) throw next;
        return { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, candidates: [{ content: { parts: [{ text: next }] } }] };
      },
    };
  },
}));
// Usage log and model health writes succeed; nothing is read back from the database.
vi.mock('./lib/supabase.js', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'gt', 'upsert', 'insert']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { db: () => ({ from: () => chain }) };
});

const overloaded = () => Object.assign(new Error('{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}'), { status: 503 });

let gemini: typeof import('./lib/gemini.js');
beforeAll(async () => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests',
    GEMINI_API_KEY: 'gemini-key-for-tests',
    GEMINI_MIN_GAP_MS: '0',
  });
  gemini = await import('./lib/gemini.js');
});

const call = () =>
  gemini.generateJson({ model: 'gemini-3.8-flash', schema: z.object({ ok: z.boolean() }), system: 's', parts: [{ text: 'p' }], usage: { kind: 'test' }, effort: 'minimal' });

describe('generateJson under load', () => {
  it('backs off, then skips a model that stays busy, for this and later calls', async () => {
    vi.useFakeTimers();
    script.set('gemini-3.8-flash', [overloaded(), overloaded(), overloaded(), overloaded()]);
    script.set('gemini-3.6-flash', ['{"ok":true}', '{"ok":true}']);
    const first = call();
    await vi.runAllTimersAsync();
    expect((await first).model).toBe('gemini-3.6-flash');
    // 1 try + 3 retries on the main model, then the backup.
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash']);

    calls.length = 0;
    expect((await call()).model).toBe('gemini-3.6-flash');
    expect(calls.map((c) => c.model)).toEqual(['gemini-3.6-flash']);
    vi.useRealTimers();
  });

  it('asks for less thinking when told to', () => {
    expect(calls[0]?.thinking).toMatchObject({ thinkingLevel: 'MINIMAL' });
  });
});
