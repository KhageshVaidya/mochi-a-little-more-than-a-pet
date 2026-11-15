import Anthropic from '@anthropic-ai/sdk';
import type { LlmStatus } from '@orbital/contracts';

/**
 * Provider-independent language-model layer for companion WORDING only (docs/companion-architecture.md §4.1).
 *
 * Guarantees:
 *  - Off by default; the user enables it explicitly (prefs.privacy.llmEnabled).
 *  - Main process only (renderers have no network access — CSP connect-src 'self').
 *  - Input is limited to: the companion persona, the deterministic draft reply, and the current chat turns.
 *    Journal entries, memory items, health values and assessment results are never sent.
 *  - Output may only rephrase an already-decided reply. It cannot change intent, safety handling, alerts or SCND.
 *  - Any failure, timeout or refusal ⇒ the caller keeps the deterministic template.
 */

export interface RephraseRequest {
  persona: { name: string; traits: string[] };
  draft: string;
  turns: { from: 'companion' | 'user'; text: string }[];
}

export interface CompanionLanguageModel {
  readonly id: string;
  status(): LlmStatus;
  check(): Promise<LlmStatus>;
  rephrase(req: RephraseRequest, signal: AbortSignal): Promise<string>;
}

/** Model identifiers are configuration, verified against the Models API before use (never assumed current). */
export const DEFAULT_MODELS = { small: 'claude-haiku-5-5', deep: 'claude-opus-5-5' } as const;
const TIMEOUT_MS = 2500;

const SYSTEM = (p: RephraseRequest['persona']) =>
  [
    `You are ${p.name}, a small, friendly desktop companion for an astronaut. Personality: ${p.traits.join(', ')}.`,
    'Rewrite the DRAFT reply in your own voice so it feels natural and not repetitive.',
    'Rules: keep the same meaning and intent as the draft; at most two short sentences; warm, playful and gentle;',
    'never give medical, psychological or clinical advice; never diagnose or label feelings; never mention health data;',
    'never add new suggestions, reminders or facts that are not in the draft; never shame or guilt the user.',
    'Reply with the rewritten text only.',
  ].join(' ');

export class AnthropicCompanionModel implements CompanionLanguageModel {
  readonly id = 'anthropic-small';
  private client: Anthropic | null = null;
  private current: LlmStatus;

  constructor(private readonly models = DEFAULT_MODELS) {
    this.current = { enabled: false, state: 'disabled', smallModel: models.small, deepModel: models.deep };
  }

  status(): LlmStatus {
    return this.current;
  }

  private getClient(): Anthropic {
    // Credentials resolve from the environment / `ant auth login` profile; nothing is stored by ORBITAL.
    this.client ??= new Anthropic({ maxRetries: 0, timeout: TIMEOUT_MS });
    return this.client;
  }

  /** Verifies credentials and that the configured model id exists (avoids silently using a retired id). */
  async check(): Promise<LlmStatus> {
    this.current = { ...this.current, enabled: true, state: 'checking' };
    try {
      await this.getClient().models.retrieve(this.models.small);
      this.current = { ...this.current, state: 'ready', detail: undefined };
    } catch (err) {
      const state =
        err instanceof Anthropic.AuthenticationError
          ? 'no-credentials'
          : err instanceof Anthropic.NotFoundError
            ? 'model-unavailable'
            : err instanceof Anthropic.APIConnectionError
              ? 'offline'
              : err instanceof Error && /api.?key|credential|auth/i.test(err.message)
                ? 'no-credentials'
                : 'error';
      this.current = { ...this.current, state, detail: err instanceof Error ? err.message.slice(0, 160) : undefined };
    }
    return this.current;
  }

  disable(): LlmStatus {
    this.current = { ...this.current, enabled: false, state: 'disabled', detail: undefined };
    return this.current;
  }

  async rephrase(req: RephraseRequest, signal: AbortSignal): Promise<string> {
    if (this.current.state !== 'ready') throw new Error('language model not ready');
    const res = await this.getClient().messages.create(
      {
        model: this.models.small,
        max_tokens: 1024,
        output_config: { effort: 'low' },
        system: SYSTEM(req.persona),
        messages: buildMessages(req),
      },
      { signal, timeout: TIMEOUT_MS },
    );
    if (res.stop_reason === 'refusal') throw new Error('refused');
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
    if (!text || text.length > 280) throw new Error('unusable reply');
    return text;
  }

  /**
   * Reserved for future complex reasoning (not used by any current feature). Uses the stronger model with
   * server-side refusal fallback. Like `rephrase`, it never receives private journal or health data.
   */
  async deepReason(prompt: string, signal: AbortSignal): Promise<string> {
    if (this.current.state !== 'ready') throw new Error('language model not ready');
    const res = await this.getClient().beta.messages.create(
      {
        model: this.models.deep,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') throw new Error('refused');
    return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(' ').trim();
  }
}

/** Last six turns of the current chat, starting with a user turn, then the draft to rephrase. */
export function buildMessages(req: RephraseRequest): Anthropic.MessageParam[] {
  const recent = req.turns.slice(-6);
  const firstUser = recent.findIndex((t) => t.from === 'user');
  const turns = firstUser === -1 ? [] : recent.slice(firstUser);
  return [
    ...turns.map((t): Anthropic.MessageParam => ({ role: t.from === 'user' ? 'user' : 'assistant', content: t.text })),
    { role: 'user', content: `DRAFT: ${req.draft}` },
  ];
}

/** Runs the model with a hard timeout; returns null on any failure so the caller keeps the template. */
export async function tryRephrase(model: CompanionLanguageModel | null, req: RephraseRequest): Promise<string | null> {
  if (!model || model.status().state !== 'ready') return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await model.rephrase(req, ctrl.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
