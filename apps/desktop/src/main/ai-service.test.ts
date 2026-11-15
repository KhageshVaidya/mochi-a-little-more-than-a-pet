import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_AI, type AiPrefs } from '@orbital/contracts';
import { AiService, OllamaClient, installed, isThinkingModel } from './ai-service';

/**
 * AiService against a local fake of the Ollama REST API (same endpoints and NDJSON streaming format).
 * The real model is exercised separately in apps/desktop/src/main/mochi-live-ollama.test.ts.
 */

type Scenario = { chunks: { content?: string; thinking?: string }[]; delayMs?: number; error?: string };
let models: string[] = [];
let scenario: Scenario = { chunks: [] };
const chatBodies: Record<string, unknown>[] = [];
const warmed: string[] = [];
const pulled: string[] = [];
let pullFails = false;
let server: Server;
let base = '';

const json = (res: ServerResponse, body: unknown) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};
const read = (req: IncomingMessage) => new Promise<string>((r) => {
  let s = '';
  req.on('data', (d) => (s += d));
  req.on('end', () => r(s));
});

beforeAll(async () => {
  server = createServer(async (req, res) => {
    if (req.url === '/api/version') return json(res, { version: '0.0.0-test' });
    if (req.url === '/api/tags') return json(res, { models: models.map((name) => ({ name })) });
    const body = JSON.parse((await read(req)) || '{}') as Record<string, unknown>;
    if (req.url === '/api/generate') {
      warmed.push(String(body['model']));
      return json(res, { done: true });
    }
    if (req.url === '/api/pull') {
      pulled.push(String(body['model']));
      res.setHeader('content-type', 'application/x-ndjson');
      if (pullFails) {
        res.write(JSON.stringify({ error: 'pull model manifest: file does not exist' }) + '\n');
        return res.end();
      }
      for (const [completed, status] of [[0, 'pulling manifest'], [1_250_000_000, 'downloading'], [2_500_000_000, 'downloading'], [2_500_000_000, 'success']] as const) {
        res.write(JSON.stringify({ status, total: 2_500_000_000, completed }) + '\n');
      }
      models = [...models, String(body['model'])];
      return res.end();
    }
    if (req.url === '/api/chat') {
      chatBodies.push(body);
      res.setHeader('content-type', 'application/x-ndjson');
      for (const c of scenario.chunks) {
        if (res.destroyed) return;
        res.write(JSON.stringify({ message: { role: 'assistant', content: c.content ?? '', thinking: c.thinking }, done: false }) + '\n');
        await new Promise((r) => setTimeout(r, scenario.delayMs ?? 5));
      }
      if (scenario.error) res.write(JSON.stringify({ error: scenario.error }) + '\n');
      else res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
      return res.end();
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const prefsFor = (patch: Partial<AiPrefs['ollama']> = {}): AiPrefs => ({ ...DEFAULT_AI, ollama: { ...DEFAULT_AI.ollama, baseUrl: base, ...patch } });
const messages = [
  { role: 'system' as const, content: 'You are Mochi.' },
  { role: 'user' as const, content: 'I had a terrible day.' },
];

describe('health checks and model selection', () => {
  it('unreachable Ollama → simple mode with install guidance', async () => {
    const ai = new AiService(() => ({ ...DEFAULT_AI, ollama: { ...DEFAULT_AI.ollama, baseUrl: 'http://127.0.0.1:9' } }));
    const s = await ai.check();
    ai.dispose();
    expect(s).toMatchObject({ state: 'unreachable', simpleMode: true, activeModel: null });
    expect(s.detail).toMatch(/ollama\.com/);
  });

  it('preferred model installed → ready, preferred model active and pre-warmed', async () => {
    models = ['qwen3:4b-instruct-2507-q4_K_M', 'qwen3:4b'];
    const ai = new AiService(() => prefsFor());
    const s = await ai.check();
    ai.dispose();
    expect(s).toMatchObject({ state: 'ready', simpleMode: false, activeModel: 'qwen3:4b-instruct-2507-q4_K_M', ollamaVersion: '0.0.0-test' });
    await new Promise((r) => setTimeout(r, 30));
    expect(warmed).toContain('qwen3:4b-instruct-2507-q4_K_M');
  });

  it('only the fallback installed → fallback active, and the status says so', async () => {
    models = ['qwen3:4b'];
    const ai = new AiService(() => prefsFor());
    const s = await ai.check();
    ai.dispose();
    expect(s.activeModel).toBe('qwen3:4b');
    expect(s.detail).toMatch(/fallback/);
  });

  it('no model installed → model-missing with the exact pull command', async () => {
    models = ['llama3:8b'];
    const ai = new AiService(() => prefsFor());
    const s = await ai.check();
    ai.dispose();
    expect(s.state).toBe('model-missing');
    expect(s.detail).toMatch(/ollama pull qwen3:4b-instruct-2507-q4_K_M/);
  });

  it('provider "off" → simple mode, no network', async () => {
    const ai = new AiService(() => ({ ...prefsFor(), provider: 'off' }));
    expect((await ai.check()).state).toBe('off');
    ai.dispose();
  });

  it('only loopback addresses are accepted', () => {
    expect(() => new OllamaClient('http://example.com:11434')).toThrow(/loopback/);
    expect(() => new OllamaClient('http://192.168.1.5:11434')).toThrow(/loopback/);
  });

  it('model-name helpers', () => {
    expect(installed(['qwen3:4b'], 'qwen3:4b')).toBe(true);
    expect(installed(['qwen3:latest'], 'qwen3:latest')).toBe(true);
    expect(isThinkingModel('qwen3:4b')).toBe(true);
    expect(isThinkingModel('qwen3:4b-instruct-2507-q4_K_M')).toBe(false);
  });
});

describe('streaming generation', () => {
  const ready = async (patch: Partial<AiPrefs['ollama']> = {}) => {
    models = ['qwen3:4b-instruct-2507-q4_K_M', 'qwen3:4b'];
    const ai = new AiService(() => prefsFor(patch));
    await ai.check();
    ai.dispose();
    return ai;
  };

  it('streams guarded text progressively and records latency', async () => {
    scenario = { chunks: [{ content: 'Oof' }, { content: '.' }, { content: ' Long' }, { content: ' day?' }] };
    const ai = await ready();
    const seen: string[] = [];
    const r = await ai.generate(messages, (t) => seen.push(t));
    expect(r).toMatchObject({ text: 'Oof. Long day?', model: 'qwen3:4b-instruct-2507-q4_K_M', provider: 'ollama' });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]!.length).toBeLessThan(seen.at(-1)!.length);
    expect(ai.status().lastTurn?.model).toBe('qwen3:4b-instruct-2507-q4_K_M');
    const body = chatBodies.at(-1)!;
    expect(body).toMatchObject({ stream: true, keep_alive: '30m' });
    expect(body['think']).toBeUndefined(); // instruct model: no thinking flag
  });

  it('stops generating once the reply is complete (two sentences)', async () => {
    scenario = { chunks: [{ content: 'Long day?' }, { content: ' Tell me.' }, ...Array.from({ length: 50 }, () => ({ content: ' And more and more.' }))], delayMs: 10 };
    const ai = await ready();
    const t0 = performance.now();
    const r = await ai.generate(messages);
    expect(r?.text).toBe('Long day? Tell me.');
    expect(performance.now() - t0).toBeLessThan(300); // aborted early instead of waiting ~500 ms
  });

  it('fallback thinking model: asks for separated reasoning, discards it, shows only the answer', async () => {
    models = ['qwen3:4b'];
    const ai = new AiService(() => prefsFor());
    await ai.check();
    ai.dispose();
    scenario = { chunks: [{ thinking: 'The user is sad, keep it short.' }, { thinking: ' Ok.' }, { content: 'Oof. Rough one?' }] };
    const r = await ai.generate(messages);
    expect(chatBodies.at(-1)!['think']).toBe(true);
    expect(r?.text).toBe('Oof. Rough one?');
    expect(r?.reasoningChars).toBeGreaterThan(10);
  });

  it('reasoning leaked into content is stripped before display', async () => {
    scenario = { chunks: [{ content: 'Okay, the user had a bad day so I should reply kindly.' }, { content: '\n</think>\n' }, { content: 'Oof. Long day?' }] };
    const ai = await ready();
    const seen: string[] = [];
    const r = await ai.generate(messages, (t) => seen.push(t));
    expect(r?.text).toBe('Oof. Long day?');
    for (const t of seen) expect(t).not.toMatch(/the user/i);
  });

  it('clinical replies are blocked (null → template)', async () => {
    scenario = { chunks: [{ content: 'It sounds like you might have depression.' }] };
    const ai = await ready();
    expect(await ai.generate(messages)).toBeNull();
  });

  it('a stream error yields null (template fallback), never a partial reply', async () => {
    scenario = { chunks: [{ content: 'Oof' }], error: 'model crashed' };
    const ai = await ready();
    expect(await ai.generate(messages)).toBeNull();
  });

  it('no model ready → null without any request', async () => {
    const before = chatBodies.length;
    const ai = new AiService(() => ({ ...prefsFor(), provider: 'off' }));
    await ai.check();
    expect(await ai.generate(messages)).toBeNull();
    expect(chatBodies.length).toBe(before);
  });
});

describe('optional Anthropic provider (disabled by default)', () => {
  it('is not the default provider; the app works with Ollama alone (no API key, no internet)', () => {
    expect(DEFAULT_AI.provider).toBe('ollama');
  });

  it('receives exactly the prompt-builder messages — never journal entries or health data', async () => {
    const { buildModelMessages } = await import('@orbital/companion');
    // A context with the only fields the builder accepts; journal/health have no way in.
    const msgs = buildModelMessages(
      { name: 'Mochi', traits: ['playful'] },
      { firstName: 'Alex', timeOfDay: 'evening', restDay: false, suggestions: [], memories: [], achievementsToday: [], ...({ journal: 'PRIVATE JOURNAL ENTRY', heartRate: 142 } as object) },
      [{ from: 'user', text: 'hey' }],
    );
    const ai = new AiService(() => ({ ...DEFAULT_AI, provider: 'anthropic' }));
    let captured: unknown = null;
    const internals = ai as unknown as { current: Record<string, unknown>; anthropic: unknown };
    internals.current = { ...internals.current, provider: 'anthropic', state: 'ready', activeModel: 'claude-haiku-5-5', simpleMode: false };
    internals.anthropic = { messages: { create: async (body: unknown) => ((captured = body), { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hey you.' }] }) } };
    const r = await ai.generate(msgs);
    ai.dispose();
    expect(r).toMatchObject({ provider: 'anthropic', text: 'Hey you.' });
    const sent = JSON.stringify(captured);
    expect(sent).not.toMatch(/PRIVATE JOURNAL|142/);
    expect(Object.keys(captured as object).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config', 'system']);
  });
});

describe('first-run model download (only after explicit confirmation, done by the UI)', () => {
  it('streams progress, then the model is ready', async () => {
    models = [];
    const ai = new AiService(() => prefsFor());
    expect((await ai.check()).state).toBe('model-missing');
    const progress: { status: string; completed?: number }[] = [];
    const r = await ai.pull('qwen3:4b-instruct-2507-q4_K_M', (p) => progress.push(p));
    ai.dispose();
    expect(r).toEqual({ ok: true });
    expect(progress.map((p) => p.status)).toContain('downloading');
    expect(progress.at(-1)!.status).toBe('success');
    expect(ai.status().state).toBe('ready');
  });

  it('refuses to download anything except the configured models', async () => {
    const ai = new AiService(() => prefsFor());
    const before = pulled.length;
    expect((await ai.pull('some-other-model:70b', () => {})).ok).toBe(false);
    ai.dispose();
    expect(pulled.length).toBe(before);
  });

  it('reports Ollama errors and an unreachable server', async () => {
    pullFails = true;
    const ai = new AiService(() => prefsFor());
    expect(await ai.pull('qwen3:4b', () => {})).toMatchObject({ ok: false, error: expect.stringMatching(/does not exist/) });
    pullFails = false;
    ai.dispose();
    const down = new AiService(() => ({ ...DEFAULT_AI, ollama: { ...DEFAULT_AI.ollama, baseUrl: 'http://127.0.0.1:9' } }));
    expect((await down.pull('qwen3:4b', () => {})).error).toMatch(/Is it running/);
    down.dispose();
  });

  it('verify() proves the model answers through the guarded pipeline', async () => {
    models = ['qwen3:4b-instruct-2507-q4_K_M'];
    scenario = { chunks: [{ content: 'Hi there, astronaut!' }] };
    const ai = new AiService(() => prefsFor());
    await ai.check();
    const v = await ai.verify();
    ai.dispose();
    expect(v).toMatchObject({ ok: true, reply: 'Hi there, astronaut!', model: 'qwen3:4b-instruct-2507-q4_K_M' });
  });
});
