import { z } from 'zod';
import { AlertRiskLink } from './knowledge';

/**
 * Deterministic alert tiers (docs/privacy-and-crew-wellbeing.md §4).
 * Urgent alerts are never playful; the LLM can never create, suppress or change an alert.
 */
export const AlertTier = z.enum(['routine', 'monitor', 'human-review', 'urgent']);
export type AlertTier = z.infer<typeof AlertTier>;

export const AlertItem = z.object({
  id: z.string(),
  tier: AlertTier,
  ruleId: z.string(),
  title: z.string(),
  detail: z.string(),
  day: z.number().int(),
  /** Measurements / rules responsible. */
  reasons: z.array(z.string()),
  section: z.enum(['physical', 'brain', 'reports', 'challenges', 'support']),
  /** Signals whose data produced this alert (set by the deterministic engine). */
  signalIds: z.array(z.string()).optional(),
  /**
   * Related NASA HRP research areas (Phase 3), attached by the main process from the offline registry.
   * Explanatory only: it never changes the alert and never implies the astronaut has the risk.
   * Urgent safety alerts never carry risk context.
   */
  riskContext: z.array(AlertRiskLink).optional(),
});
export type AlertItem = z.infer<typeof AlertItem>;

export const AuditEntry = z.object({
  seq: z.number().int(),
  missionDay: z.number().int(),
  ts: z.string(),
  event: z.string(),
  alertId: z.string(),
  tier: z.string(),
  ruleId: z.string(),
  detail: z.unknown(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** Observable wellbeing patterns — statements of what changed, with uncertainty. Never a diagnosis. */
export const WellbeingPatterns = z.object({
  day: z.number().int(),
  windowDays: z.number().int(),
  summary: z.string().nullable(),
  changes: z.array(z.object({ signalId: z.string(), label: z.string(), phrase: z.string(), z7: z.number(), layer: z.enum(['physiological', 'cognitive', 'self-report']) })),
  relationships: z.array(z.object({ a: z.string(), b: z.string(), r: z.number(), n: z.number().int(), statement: z.string() })),
  checkinPattern: z.object({ recentRate: z.number(), baselineRate: z.number(), statement: z.string().nullable() }),
  repeatedDifficulties: z.object({ days: z.number().int(), of: z.number().int(), statement: z.string().nullable() }),
  uncertainty: z.string(),
});
export type WellbeingPatterns = z.infer<typeof WellbeingPatterns>;
