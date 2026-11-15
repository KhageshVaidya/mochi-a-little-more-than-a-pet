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
  /** Last position per display id. */
  positions: z.record(z.string(), z.object({ x: z.number().int(), y: z.number().int() })),
});
export type PetPrefs = z.infer<typeof PetPrefs>;

export const Prefs = z.object({
  theme: ThemePreference,
  reducedMotion: z.enum(['system', 'reduce']),
  pet: PetPrefs,
  nasaOnline: z.boolean(),
  privacy: z.object({
    /** Companion offers a voluntary daily journal conversation (default ON; can be disabled). */
    journalingEnabled: z.boolean(),
    /** Ordinary companion wording via a small language model. Default OFF; only current chat turns are sent. */
    llmEnabled: z.boolean(),
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
    positions: {},
  },
  nasaOnline: false,
  privacy: { journalingEnabled: true, llmEnabled: false, shareCheckinsWithMonitor: false },
};

/** Deep-partial patch accepted by prefs:set. */
export const PrefsPatch = z.object({
  theme: ThemePreference.optional(),
  reducedMotion: z.enum(['system', 'reduce']).optional(),
  pet: PetPrefs.partial().optional(),
  nasaOnline: z.boolean().optional(),
  privacy: z.object({ journalingEnabled: z.boolean(), llmEnabled: z.boolean(), shareCheckinsWithMonitor: z.boolean() }).partial().optional(),
});
export type PrefsPatch = z.infer<typeof PrefsPatch>;
