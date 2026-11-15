import Anthropic from '@anthropic-ai/sdk';
import type { AiPrefs, AiStatus } from '@orbital/contracts';
import { DEFAULT_GUARD, guardReply, type ModelMessage } from '@orbital/companion';

/**
 * Conversational AI for Mochi (M1). Main process only — renderers have no network access.
 *
 *  - Default provider: Ollama on the LOOPBACK interface (http://127.0.0.1:11434). No API key, no internet.
 *  - Preferred model: a non-thinking instruct build (qwen3:4b-instruct-2507-q4_K_M). Fallback: qwen3:4b
 *    (hybrid thinking model) requested with `think: true` so Ollama returns reasoning in a separate field,
 *    which is discarded; the output guard additionally strips any reasoning that leaks into the content.
 *  - Every streamed chunk passes through the deterministic output guard before anything is displayed.
 *  - Optional provider: Anthropic, OFF by default. It receives exactly the same messages as the local model,
 *    which by construction never contain journal entries or health data (see @orbital/companion prompt.ts).
 *  - Safety handling, journal flow, memory, app commands and all SCND decisions never pass through here.
 */

export interface GenerateResult {
  text: string;
  model: string;
  provider: 'ollama' | 'anthropic';
  firstTokenMs: number;
  totalMs: number;
  /** Raw characters the model produced (incl. any discarded reasoning), for diagnostics/benchmarks. */
  rawChars: number;
  reasoningChars: number;
}

export interface StreamChunk {
  content: string;
  thinking: string;
}

const FIRST_TEXT_TIMEOUT_MS = 20_000; // includes a possible cold model load (~6 s measured on the dev Mac)
const TOTAL_TIMEOUT_MS = 30_000;
const CHECK_INTERVAL_READY_MS = 120_000;
const CHECK_INTERVAL_DOWN_MS = 30_000;

const isLoopback = (url: string) => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url);
/** Hybrid "thinking" models must be asked to separate their reasoning. */
export const isThinkingModel = (model: string) => /^qwen3:(?!.*instruct)/.test(model) || /deepseek-r1|thinking/.test(model);

/** Minimal Ollama HTTP client (official REST API: /api/version, /api/tags, /api/generate, /api/chat). */
export class OllamaClient {
  constructor(private readonly baseUrl: string) {
    if (!isLoopback(baseUrl)) throw new Error('Ollama base URL must be a loopback address');
  }

  async version(signal?: AbortSignal): Promise<string> {
    const r = await fetch(`${this.baseUrl}/api/version`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return ((await r.json()) as { version: string }).version;
  }

  async models(signal?: AbortSignal): Promise<string[]> {
    const r = await fetch(`${this.baseUrl}/api/tags`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return ((await r.json()) as { models: { name: string }[] }).models.map((m) => m.name);
  }

  /** Load a model into memory (empty prompt) so the first real turn doesn't pay the cold start. */
  async warm(model: string, keepAlive: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/generate`, { method: 'POST', body: JSON.stringify({ model, prompt: '', keep_alive: keepAlive, stream: false }) });
  }

  /** Streams /api/chat NDJSON. Calls onChunk with the accumulated content and thinking so far. */
  async chat(
    model: string,
    messages: ModelMessage[],
    opts: { temperature: number; keepAlive: string; numPredict: number; signal: AbortSignal },
    onChunk: (acc: StreamChunk) => void,
  ): Promise<StreamChunk> {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      keep_alive: opts.keepAlive,
      options: { temperature: opts.temperature, num_predict: opts.numPredict, top_p: 0.9 },
    };
    if (isThinkingModel(model)) body['think'] = true; // reasoning goes to message.thinking, never displayed
    const r = await fetch(`${this.baseUrl}/api/chat`, { method: 'POST', body: JSON.stringify(body), signal: opts.signal });
    if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}${r.status === 404 ? ' (model not installed)' : ''}`);
    const acc: StreamChunk = { content: '', thinking: '' };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const j = JSON.parse(line) as { message?: { content?: string; thinking?: string }; error?: string; done?: boolean };
        if (j.error) throw new Error(j.error);
        acc.content += j.message?.content ?? '';
        acc.thinking += j.message?.thinking ?? '';
        onChunk(acc);
      }
    }
    return acc;
  }
}

/** Matches "qwen3:4b" against installed names like "qwen3:4b" or "qwen3:4b:latest"/"qwen3:latest". */
export const installed = (names: readonly string[], model: string) => names.some((n) => n === model || n === `${model}:latest` || (model.endsWith(':latest') && n === model.slice(0, -7)));

export class AiService {
  private current: AiStatus;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly prefs: () => AiPrefs,
    private readonly onStatus: (s: AiStatus) => void = () => {},
  ) {
    const p = prefs();
    this.current = { provider: p.provider, state: p.provider === 'off' ? 'off' : 'checking', activeModel: null, preferredModel: p.ollama.model, fallbackModel: p.ollama.fallbackModel, installedModels: [], ollamaVersion: null, lastTurn: null, simpleMode: true };
  }

  status(): AiStatus {
    return this.current;
  }

  private set(next: Partial<AiStatus>): AiStatus {
    this.current = { ...this.current, ...next };
    this.current.simpleMode = this.current.state !== 'ready';
    this.onStatus(this.current);
    return this.current;
  }

  /** Health check: provider reachable, model installed. Re-schedules itself. */
  async check(): Promise<AiStatus> {
    const p = this.prefs();
    if (this.timer) clearTimeout(this.timer);
    const base = { provider: p.provider, preferredModel: p.ollama.model, fallbackModel: p.ollama.fallbackModel };
    if (p.provider === 'off') return this.set({ ...base, state: 'off', activeModel: null, detail: 'Conversational AI is turned off in settings.' });
    this.set({ ...base, state: 'checking' });
    if (p.provider === 'anthropic') {
      try {
        this.anthropic ??= new Anthropic({ maxRetries: 0, timeout: 4000 });
        await this.anthropic.models.retrieve('claude-haiku-5-5');
        return this.set({ state: 'ready', activeModel: 'claude-haiku-5-5', detail: undefined });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return this.schedule(this.set({ state: /api.?key|auth|credential/i.test(msg) ? 'no-credentials' : 'error', activeModel: null, detail: msg.slice(0, 160) }));
      }
    }
    const client = new OllamaClient(p.ollama.baseUrl);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const [version, names] = await Promise.all([client.version(ctrl.signal), client.models(ctrl.signal)]);
      const active = installed(names, p.ollama.model) ? p.ollama.model : installed(names, p.ollama.fallbackModel) ? p.ollama.fallbackModel : null;
      const next = this.set({
        ollamaVersion: version,
        installedModels: names,
        activeModel: active,
        state: active ? 'ready' : 'model-missing',
        detail: active
          ? active === p.ollama.model
            ? undefined
            : `Preferred model ${p.ollama.model} is not installed; using fallback ${active}.`
          : `Neither ${p.ollama.model} nor ${p.ollama.fallbackModel} is installed. Run: ollama pull ${p.ollama.model}`,
      });
      if (active) void client.warm(active, p.ollama.keepAlive).catch(() => {});
      return this.schedule(next);
    } catch {
      return this.schedule(this.set({ state: 'unreachable', activeModel: null, ollamaVersion: null, installedModels: [], detail: `Ollama is not running at ${p.ollama.baseUrl}. Install it from ollama.com and start it, then Mochi will reconnect automatically.` }));
    } finally {
      clearTimeout(t);
    }
  }

  private schedule(s: AiStatus): AiStatus {
    this.timer = setTimeout(() => void this.check(), s.state === 'ready' ? CHECK_INTERVAL_READY_MS : CHECK_INTERVAL_DOWN_MS);
    this.timer.unref?.();
    return s;
  }

  /**
   * Download a model through Ollama (POST /api/pull, streamed progress). Callers must only invoke this after the
   * user explicitly confirmed the download (several GB). Re-checks status when done.
   */
  async pull(model: string, onProgress: (p: { status: string; completed?: number; total?: number }) => void): Promise<{ ok: boolean; error?: string }> {
    const p = this.prefs();
    if (p.provider !== 'ollama') return { ok: false, error: 'The local provider (Ollama) is not selected.' };
    if (![p.ollama.model, p.ollama.fallbackModel].includes(model)) return { ok: false, error: 'Only the configured models can be downloaded.' };
    try {
      const r = await fetch(`${p.ollama.baseUrl}/api/pull`, { method: 'POST', body: JSON.stringify({ model, stream: true }) });
      if (!r.ok || !r.body) return { ok: false, error: `Ollama answered HTTP ${r.status}` };
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let last = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const j = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (j.error) return { ok: false, error: j.error };
          last = j.status ?? last;
          onProgress({ status: last, ...(j.completed !== undefined ? { completed: j.completed } : {}), ...(j.total !== undefined ? { total: j.total } : {}) });
        }
      }
      await this.check();
      return last === 'success' || this.current.state === 'ready' ? { ok: true } : { ok: false, error: `Download ended with status “${last}”.` };
    } catch {
      return { ok: false, error: `Could not reach Ollama at ${p.ollama.baseUrl}. Is it running?` };
    }
  }

  /** Prove the model works: one short real reply through the normal guarded pipeline. */
  async verify(): Promise<{ ok: boolean; reply?: string; ms?: number; model?: string; error?: string }> {
    if (this.current.state !== 'ready') await this.check();
    const r = await this.generate([
      { role: 'system', content: 'You are Mochi, a small friendly desktop pet. Reply in one short sentence.' },
      { role: 'user', content: 'Say hello to your new astronaut.' },
    ]);
    return r ? { ok: true, reply: r.text, ms: r.totalMs, model: r.model } : { ok: false, error: this.current.detail ?? 'The model did not answer in time.' };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Generate one companion reply, streaming GUARDED text to `onText`. Returns null on any failure, on a
   * blocked reply, or when no model is ready — the caller then uses the deterministic template (simple mode).
   */
  async generate(messages: ModelMessage[], onText: (text: string, done: boolean) => void = () => {}, override?: { model?: string }): Promise<GenerateResult | null> {
    const s = this.current;
    if (s.state !== 'ready' || !s.activeModel) return null;
    const p = this.prefs();
    const model = override?.model ?? s.activeModel;
    const ctrl = new AbortController();
    const started = performance.now();
    let firstTextAt = 0;
    let shown = '';
    let complete = false;
    const total = setTimeout(() => ctrl.abort(), TOTAL_TIMEOUT_MS);
    const first = setTimeout(() => !firstTextAt && ctrl.abort(), FIRST_TEXT_TIMEOUT_MS);
    const consume = (content: string) => {
      if (complete) return;
      const g = guardReply(content, DEFAULT_GUARD, false);
      if (g.blocked) {
        complete = true;
        ctrl.abort();
        return;
      }
      if (g.text && g.text !== shown) {
        if (!firstTextAt) firstTextAt = performance.now();
        shown = g.text;
        onText(shown, false);
      }
      if (g.complete) {
        complete = true;
        ctrl.abort(); // enough text — stop generating
      }
    };
    let raw = '';
    let reasoning = '';
    try {
      if (s.provider === 'anthropic') {
        this.anthropic ??= new Anthropic({ maxRetries: 0, timeout: TOTAL_TIMEOUT_MS });
        const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
        const res = await this.anthropic.messages.create(
          { model, max_tokens: 200, output_config: { effort: 'low' }, system, messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })) },
          { signal: ctrl.signal },
        );
        if (res.stop_reason === 'refusal') return null;
        raw = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ');
        consume(raw);
      } else {
        const client = new OllamaClient(p.ollama.baseUrl);
        try {
          const acc = await client.chat(model, messages, { temperature: p.ollama.temperature, keepAlive: p.ollama.keepAlive, numPredict: isThinkingModel(model) ? 1024 : 120, signal: ctrl.signal }, (a) => {
            raw = a.content;
            reasoning = a.thinking;
            consume(a.content);
          });
          raw = acc.content;
          reasoning = acc.thinking;
        } catch (e) {
          if (!complete) throw e; // aborting after enough text is the normal path
        }
      }
      const final = guardReply(raw, DEFAULT_GUARD, true);
      if (final.blocked) return null;
      const text = complete && shown ? shown : final.text;
      onText(text, true);
      const totalMs = performance.now() - started;
      const result: GenerateResult = { text, model, provider: s.provider === 'anthropic' ? 'anthropic' : 'ollama', firstTokenMs: Math.round((firstTextAt || performance.now()) - started), totalMs: Math.round(totalMs), rawChars: raw.length + reasoning.length, reasoningChars: reasoning.length };
      this.set({ lastTurn: { model, firstTokenMs: result.firstTokenMs, totalMs: result.totalMs, at: new Date().toISOString() } });
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(total);
      clearTimeout(first);
    }
  }
}
