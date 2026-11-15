import { z } from 'zod';
import { AssessmentState, ActionId, Reason } from './assessment';
import { HrpRiskId, SignalDomain } from './signals';
import { MissionCategory } from './gamification';

/**
 * Phase 4 — hybrid intelligence contracts (docs/phase-4-intelligence-design.md).
 *
 *   Intelligence engine (statistics + ML)  →  Decision engine (SCND, deterministic)  →  ApprovedOutputs
 *   →  Recommendation engine  →  Mission engine  →  Reward engine  →  Companion communication
 *
 * Rules encoded in these types:
 *  - Statistical findings and the ML advisory are separate fields; the ML block has no field that can
 *    express a decision, and ApprovedOutputs (the only input to recommendations) carries no ML data.
 *  - Isolation Forest output is an anomaly score for *today relative to a healthy synthetic cohort*.
 *    It is not a prediction of future disease or of any psychiatric condition.
 */

export const FindingKind = z.enum(['sustained-change', 'notable-deviation', 'longitudinal-trend']);
export type FindingKind = z.infer<typeof FindingKind>;

export const StatisticalFinding = z.object({
  id: z.string(),
  kind: FindingKind,
  domain: SignalDomain,
  signalId: z.string(),
  /** e.g. "persistence + EWMA + CUSUM", "7-day mean z-score", "Mann–Kendall + Theil–Sen (weekly means)". */
  method: z.string(),
  window: z.object({ startDay: z.number().int(), endDay: z.number().int() }),
  baseline: z.object({ mean: z.number(), sd: z.number(), n: z.number().int(), startDay: z.number().int(), endDay: z.number().int() }).nullable(),
  /** Recent value summary (7-day mean or trend-window slope) and its standardised distance from baseline. */
  recent: z.object({ mean: z.number().nullable(), z: z.number().nullable() }),
  statistic: z.number(),
  threshold: z.number(),
  direction: z.enum(['up', 'down']),
  adverse: z.boolean(),
  sinceDay: z.number().int().optional(),
  /** Trend findings: slope per week in signal units and the Mann–Kendall p-value. */
  slopePerWeek: z.number().optional(),
  pValue: z.number().optional(),
});
export type StatisticalFinding = z.infer<typeof StatisticalFinding>;

export const SignalQuality = z.object({
  signalId: z.string(),
  domain: SignalDomain,
  /** Fraction of the last 14 days with ≥1 reliable value (cadence-aware for weekly signals). */
  coverage: z.number().min(0).max(1),
  longestGapDays: z.number().int().nonnegative(),
  /** Fraction of records in the last 14 days rejected by P1 data-quality rules. */
  rejectedFraction: z.number().min(0).max(1),
  reliable: z.boolean(),
});
export type SignalQuality = z.infer<typeof SignalQuality>;

export const MlAdvisoryBlock = z.object({
  status: z.enum(['alarm', 'no-alarm', 'withheld', 'unavailable']),
  modelId: z.string(),
  modelHash: z.string(),
  /** Today's anomaly score in (0,1); null when withheld. */
  score: z.number().nullable(),
  threshold: z.number(),
  /** Days in the persistence window with score above threshold, and the window length. */
  daysAboveThreshold: z.number().int(),
  windowDays: z.number().int(),
  /** Features with the largest absolute deviation from the personal baseline on the latest scored day. */
  topFeatures: z.array(z.object({ signalId: z.string(), z: z.number() })),
  featuresPresent: z.number().min(0).max(1),
  note: z.string(),
});
export type MlAdvisoryBlock = z.infer<typeof MlAdvisoryBlock>;

/** The ONLY intelligence output the recommendation engine may consume. Contains no ML fields. */
export const ApprovedOutputs = z
  .object({
    day: z.number().int(),
    decisionState: AssessmentState,
    escalation: z.boolean(),
    /** Domains with a sustained, multi-detector change (adverse direction). */
    sustainedDomains: z.array(SignalDomain),
    /** Earliest CUSUM change-point (onset) day per sustained domain — used to put the earliest-changing need first. */
    domainOnsetDays: z.record(z.string(), z.number().int()),
    /** Domains with a notable (not sustained) adverse 7-day deviation. */
    notableDomains: z.array(SignalDomain),
    /** Physical signals with a significant adverse longitudinal trend. */
    physicalTrendSignals: z.array(z.string()),
    dataGaps: z.object({
      /** Scheduled measurements overdue (signal ids). */
      overdueMeasurements: z.array(z.string()),
      lowCoverageDomains: z.array(SignalDomain),
    }),
  })
  .strict();
export type ApprovedOutputs = z.infer<typeof ApprovedOutputs>;

export const IntelligenceReport = z.object({
  subjectId: z.string(),
  day: z.number().int(),
  decision: z.object({ state: AssessmentState, rulesFired: z.array(z.string()), reasons: z.array(Reason), suggestedAction: ActionId }),
  statistical: z.array(StatisticalFinding),
  ml: MlAdvisoryBlock,
  dataQuality: z.object({ overallCoverage: z.number().min(0).max(1), signals: z.array(SignalQuality), issues: z.array(z.string()) }),
  uncertainty: z.object({ level: z.enum(['low', 'moderate', 'high']), drivers: z.array(z.string()) }),
  /** NASA HRP risks related to the signals in the findings (explanatory; attached in main). */
  nasaRiskIds: z.array(HrpRiskId),
  approved: ApprovedOutputs,
  trace: z.object({ engineVersion: z.string(), configHash: z.string(), modelHash: z.string() }),
});
export type IntelligenceReport = z.infer<typeof IntelligenceReport>;

// ── Recommendations ──────────────────────────────────────────────────────────

export const RecommendationKind = z.enum([
  'human-support',
  'sleep-recovery-expedition',
  'wind-down',
  'sleep-routine',
  'movement-short',
  'movement-exploration',
  'exercise-optional',
  'cognitive-rest',
  'cognitive-light',
  'journal',
  'recreation',
  'companion-chat',
  'measurement-reminder',
]);
export type RecommendationKind = z.infer<typeof RecommendationKind>;

export const Recommendation = z.object({
  id: z.string(),
  kind: RecommendationKind,
  title: z.string(),
  description: z.string(),
  category: MissionCategory,
  /** Why it was offered: which approved output, which domains/signals. */
  basis: z.object({ source: z.enum(['safety', 'decision', 'statistical', 'trend', 'data-quality']), domains: z.array(z.string()), signals: z.array(z.string()) }),
  /** Every recommendation is optional; nothing is ever required. */
  optional: z.literal(true),
  priority: z.number().int(),
  nasaRiskIds: z.array(HrpRiskId),
});
export type Recommendation = z.infer<typeof Recommendation>;

/** Restrictions that recommendations must respect (e.g. set by a crew surgeon; synthetic default: none). */
export const ActivityRestrictions = z.object({
  exercise: z.enum(['none', 'light-only', 'no-exercise']).default('none'),
  cognitiveGames: z.boolean().default(true),
});
export type ActivityRestrictions = z.infer<typeof ActivityRestrictions>;

export const RecommendationSet = z.object({
  day: z.number().int(),
  recommendations: z.array(Recommendation),
  suppressed: z.array(z.object({ kind: RecommendationKind, reason: z.string() })),
});
export type RecommendationSet = z.infer<typeof RecommendationSet>;
