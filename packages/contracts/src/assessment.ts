import { z } from 'zod';

/**
 * Brain & Mental Health assessment output.
 * Exactly three states. The copy for each state is fixed (see ASSESSMENT_COPY) and non-diagnostic.
 */
export const AssessmentState = z.enum(['YES', 'NO', 'INSUFFICIENT_DATA']);
export type AssessmentState = z.infer<typeof AssessmentState>;

export const ASSESSMENT_COPY: Record<AssessmentState, { headline: string; subline: string }> = {
  YES: {
    headline: 'Elevated wellbeing risk signal detected.',
    subline: 'This is a pattern in your data, not a diagnosis.',
  },
  NO: {
    headline: 'No elevated signal detected in the available reliable data.',
    subline: 'This does not confirm wellbeing. You can talk to your crew-support contact at any time.',
  },
  INSUFFICIENT_DATA: {
    headline: 'Insufficient reliable information for assessment.',
    subline: 'Complete a few more check-ins to enable an assessment.',
  },
};

/** Rule precedence tiers. Lower number wins. Enforced structurally by the engine. */
export const PRECEDENCE = {
  SAFETY: 0,
  DATA_QUALITY: 1,
  SUFFICIENCY: 2,
  STATISTICAL: 3,
  DECISION: 4,
  ML_ADVISORY: 5,
} as const;
export type PrecedenceTier = keyof typeof PRECEDENCE;

export const ActionId = z.enum([
  'routine-checkins',
  'complete-checkins',
  'review-sleep-workload',
  'private-conference',
  'human-support-now',
]);
export type ActionId = z.infer<typeof ActionId>;

export const Reason = z.object({
  ruleId: z.string(),
  tier: z.enum(['SAFETY', 'DATA_QUALITY', 'SUFFICIENCY', 'STATISTICAL', 'DECISION', 'ML_ADVISORY']),
  text: z.string(),
});
export type Reason = z.infer<typeof Reason>;

export const Contributor = z.object({
  signalId: z.string(),
  domain: z.string(),
  method: z.enum(['z-score', 'ewma', 'cusum', 'change-point', 'persistence']),
  statistic: z.number(),
  threshold: z.number(),
  direction: z.enum(['up', 'down']),
  /** Estimated onset (mission day), when a change point is available. */
  sinceDay: z.number().int().optional(),
  persistenceDays: z.number().int().optional(),
});
export type Contributor = z.infer<typeof Contributor>;

export const Advisory = z.object({
  source: z.string(), // e.g. 'ml.isolation-forest'
  text: z.string(),
  score: z.number().optional(),
  features: z.array(z.string()).optional(),
});
export type Advisory = z.infer<typeof Advisory>;

export const EscalationEvent = z.object({
  id: z.string(),
  raisedAt: z.iso.datetime(),
  trigger: z.enum(['talk-request', 'safety-item']),
  /** Escalation never waits on data sufficiency and never maps to YES/NO. */
  pathway: z.literal('human-support'),
});
export type EscalationEvent = z.infer<typeof EscalationEvent>;

export const Assessment = z.object({
  profileId: z.string(),
  state: AssessmentState,
  reasons: z.array(Reason),
  contributors: z.array(Contributor),
  window: z.object({
    startDay: z.number().int(),
    endDay: z.number().int(),
    baselineStartDay: z.number().int(),
    baselineEndDay: z.number().int(),
  }),
  dataQuality: z.object({
    coverage: z.record(z.string(), z.number().min(0).max(1)),
    reliableDomains: z.number().int(),
    requiredDomains: z.number().int(),
    issues: z.array(z.string()),
  }),
  uncertainty: z.object({
    level: z.enum(['low', 'moderate', 'high']),
    drivers: z.array(z.string()),
  }),
  suggestedAction: ActionId,
  /** ML / supplementary insights. By contract these can never change `state`. */
  advisories: z.array(Advisory),
  escalation: EscalationEvent.optional(),
  trace: z.object({
    engineVersion: z.string(),
    configHash: z.string(),
    inputHash: z.string(),
    rulesFired: z.array(z.string()),
  }),
});
export type Assessment = z.infer<typeof Assessment>;
