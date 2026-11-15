import { z } from 'zod';

/** User preferences persisted in SQLite (main process). */

export const ThemePreference = z.enum(['light', 'dark', 'system']);
export type ThemePreference = z.infer<typeof ThemePreference>;

/** Id of an installed companion character package (assets/pets/<id>). */
export const CompanionId = z.string().regex(/^[a-z0-9-]+$/);
export type CompanionId = z.infer<typeof CompanionId>;
export const DEFAULT_COMPANION: CompanionId = 'mochi';

export const PetPrefs = z.object({
  companionId: CompanionId,
  visible: z.boolean(),
  /** When false the companion is display-only and fully click-through (re-enable from the dashboard). */
  interactionsEnabled: z.boolean(),
  alwaysOnTop: z.boolean(),
  remindersEnabled: z.boolean(),
  /** Minimum minutes between gentle reminders. */
  reminderIntervalMin: z.number().int().min(30).max(480),
  quietHours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  /** Companion per astronaut profile (falls back to the profile default, then `companionId`). */
  companionByProfile: z.record(z.string(), CompanionId).default({}),
  /** Last position per display id. */
  positions: z.record(z.string(), z.object({ x: z.number().int(), y: z.number().int() })),
});
export type PetPrefs = z.infer<typeof PetPrefs>;

/**
 * Local-first conversational AI (Mochi M1). Ollama on the loopback interface is the default provider; no API
 * key or internet connection is needed. Anthropic is an optional provider, OFF by default, and never receives
 * journal entries or health data (enforced by the context builder, tested).
 */
export const AiProvider = z.enum(['ollama', 'anthropic', 'off']);
export type AiProvider = z.infer<typeof AiProvider>;
/** An Ollama model reference such as `qwen3:4b` or `namespace/model:tag`. */
export const OllamaModelName = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/)
  .refine((s) => !s.includes('//') && !s.includes('..'), 'Not a model name');
export const AiPrefs = z.object({
  provider: AiProvider,
  ollama: z.object({
    /** Loopback only — the main process refuses non-local hosts. */
    baseUrl: z.string().regex(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/),
    /** Preferred conversational model (non-thinking instruct build). Any Ollama model name can be configured. */
    model: OllamaModelName,
    /** Fallback when the preferred model is not installed (hybrid thinking model; reasoning is filtered). */
    fallbackModel: OllamaModelName,
    temperature: z.number().min(0).max(1.5),
    /** How long Ollama keeps the model loaded between turns (avoids a cold start on every message). */
    keepAlive: z.string().regex(/^\d+(s|m|h)$/),
  }),
});
export type AiPrefs = z.infer<typeof AiPrefs>;
export const DEFAULT_AI: AiPrefs = {
  provider: 'ollama',
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen3:4b-instruct-2507-q4_K_M', fallbackModel: 'qwen3:4b', temperature: 0.7, keepAlive: '30m' },
};

export const Prefs = z.object({
  theme: ThemePreference,
  reducedMotion: z.enum(['system', 'reduce']),
  pet: PetPrefs,
  nasaOnline: z.boolean(),
  ai: AiPrefs,
  /** First-run setup (local AI). Completed once the model has answered, or when the user skips it. */
  onboarding: z.object({ completed: z.boolean() }).default({ completed: false }),
  privacy: z.object({
    /** Companion offers a voluntary daily journal conversation (default ON; can be disabled). */
    journalingEnabled: z.boolean(),
    /** 0–10 mood answers given in chat count as self-reported records for the wellbeing monitor. Default OFF. */
    shareCheckinsWithMonitor: z.boolean(),
  }),
});
export type Prefs = z.infer<typeof Prefs>;

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  reducedMotion: 'system',
  pet: {
    companionId: DEFAULT_COMPANION,
    visible: true,
    interactionsEnabled: true,
    alwaysOnTop: true,
    remindersEnabled: true,
    reminderIntervalMin: 90,
    quietHours: { start: '22:00', end: '07:00' },
    companionByProfile: {},
    positions: {},
  },
  nasaOnline: false,
  ai: DEFAULT_AI,
  onboarding: { completed: false },
  privacy: { journalingEnabled: true, shareCheckinsWithMonitor: false },
};

/** Deep-partial patch accepted by prefs:set. */
export const PrefsPatch = z.object({
  theme: ThemePreference.optional(),
  reducedMotion: z.enum(['system', 'reduce']).optional(),
  pet: PetPrefs.partial().optional(),
  nasaOnline: z.boolean().optional(),
  ai: z.object({ provider: AiProvider, ollama: AiPrefs.shape.ollama.partial() }).partial().optional(),
  onboarding: z.object({ completed: z.boolean() }).optional(),
  privacy: z.object({ journalingEnabled: z.boolean(), shareCheckinsWithMonitor: z.boolean() }).partial().optional(),
});
export type PrefsPatch = z.infer<typeof PrefsPatch>;
