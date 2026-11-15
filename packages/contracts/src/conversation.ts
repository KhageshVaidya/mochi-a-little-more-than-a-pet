import { z } from 'zod';
import { AstronautId } from './crew';

/** Companion conversation, journal and memory contracts (docs/companion-architecture.md §4–5). */

export const ChatMode = z.enum(['chat', 'journal', 'checkin', 'support']);
export type ChatMode = z.infer<typeof ChatMode>;

export const ChatRequest = z.object({
  text: z.string().max(1000).optional(),
  action: z
    .enum(['open', 'start-journal', 'start-checkin', 'skip', 'end', 'confirm-memory', 'dismiss-memory', 'feeling', 'mood', 'talk-to-someone'])
    .optional(),
  value: z.string().max(80).optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatTurn = z.object({ from: z.enum(['companion', 'user']), text: z.string(), at: z.string() });
export type ChatTurn = z.infer<typeof ChatTurn>;

export const MemoryKind = z.enum(['preferred-activity', 'favourite-game', 'interest', 'goal', 'suggested-activity', 'companion-preference']);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryItem = z.object({
  id: z.string(),
  subjectId: z.string(),
  kind: MemoryKind,
  text: z.string().min(1).max(200),
  /** Nothing is stored silently: every item was stated by the user or confirmed by them. */
  source: z.enum(['user-stated', 'user-confirmed']),
  createdAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

export const ChatResponse = z.object({
  mode: ChatMode,
  reply: z.string(),
  /**
   * Which layer produced the wording. 'safety' and 'template' never involve a language model.
   * 'model' = the local model (Ollama); 'llm' = the optional remote provider (Anthropic).
   */
  voice: z.enum(['template', 'llm', 'safety', 'model']),
  /** Model id that produced the reply (only for 'model' / 'llm'). */
  model: z.string().optional(),
  /** True when Mochi is in simple mode because no conversational model is available. */
  simpleMode: z.boolean().optional(),
  /** Correlates with streamed `chat:stream` events. */
  turnId: z.string().optional(),
  /** Deterministic action requested by the conversation (e.g. "Open Dr G Zero"). */
  action: z.object({ type: z.literal('open-dashboard'), section: z.string() }).optional(),
  quickReplies: z.array(z.object({ label: z.string(), request: ChatRequest })),
  memoryProposal: z.object({ kind: MemoryKind, text: z.string() }).optional(),
  urgent: z.boolean(),
  history: z.array(ChatTurn),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

/** Provenance-tagged journal content. Inferences are never turned into facts without the user's confirmation. */
export const JournalEntry = z.object({
  id: z.string(),
  subjectId: z.string(),
  missionDay: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.array(z.object({ question: z.string(), answer: z.string().nullable() })),
  /** Directly reported emotions (chips the user picked). */
  feelings: z.array(z.string().max(30)),
  /** User-reported events (their own words). */
  events: z.array(z.string().max(500)),
  /** Generated summary — always labelled as generated, editable. */
  summary: z.object({ text: z.string(), kind: z.literal('model-summary') }).nullable(),
  /** Generated possibilities — shown as questions, never as facts. */
  possibilities: z.array(z.object({ text: z.string(), kind: z.literal('model-possibility'), status: z.enum(['unconfirmed', 'confirmed', 'dismissed']) })),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

export const LlmStatus = z.object({
  enabled: z.boolean(),
  state: z.enum(['disabled', 'ready', 'no-credentials', 'model-unavailable', 'offline', 'error', 'checking']),
  smallModel: z.string(),
  deepModel: z.string(),
  detail: z.string().optional(),
});
export type LlmStatus = z.infer<typeof LlmStatus>;

/** Conversational AI status (local-first). */
export const AiStatus = z.object({
  provider: z.enum(['ollama', 'anthropic', 'off']),
  state: z.enum(['off', 'checking', 'ready', 'unreachable', 'model-missing', 'no-credentials', 'error']),
  /** Model actually used for conversation right now (preferred, or fallback when only that is installed). */
  activeModel: z.string().nullable(),
  preferredModel: z.string(),
  fallbackModel: z.string(),
  installedModels: z.array(z.string()),
  ollamaVersion: z.string().nullable(),
  /** Last measured latency of a real model turn. */
  lastTurn: z.object({ model: z.string(), firstTokenMs: z.number(), totalMs: z.number(), at: z.string() }).nullable(),
  /** True when Mochi uses simple (template) replies because no model is available. */
  simpleMode: z.boolean(),
  detail: z.string().optional(),
});
export type AiStatus = z.infer<typeof AiStatus>;

export const SubjectRequest = z.object({ astronautId: AstronautId });
