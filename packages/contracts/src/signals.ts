import { z } from 'zod';
import { Classification } from './provenance';

/**
 * Signal registry contract — the engine's expandable "board".
 * Adding an indicator = adding a SignalDefinition; the engine is not modified.
 */

export const SignalDomain = z.enum([
  'cardiovascular',
  'respiratory',
  'sleep',
  'activity',
  'thermal',
  'metabolic',
  'body-composition',
  'mood',
  'stress',
  'social',
  'cognition',
  'fatigue',
]);
export type SignalDomain = z.infer<typeof SignalDomain>;

/**
 * NASA Human Research Program risk catalogue.
 * Verified against https://www.nasa.gov/hrp/risks/ on 2026-11-14.
 * Do not add ids that do not appear on that page.
 */
export const HrpRiskId = z.enum([
  'immune',
  'sensorimotor-vestibular',
  'cardiovascular',
  'decompression-sickness',
  'host-microorganism',
  'hypoxia',
  'food-nutrition',
  'eva-injury-performance',
  'cardiorespiratory-musculoskeletal-fitness',
  'sans',
  'bone',
  'behavioral-psychiatric',
  'teamwork',
  'sleep-schedules',
  'systems-operations-support',
  'dynamic-loads',
  'radiation-cancer',
]);
export type HrpRiskId = z.infer<typeof HrpRiskId>;

export const Cadence = z.enum(['continuous', 'daily', 'nightly', 'weekly', 'intermittent']);
export type Cadence = z.infer<typeof Cadence>;

export const SignalDefinition = z
  .object({
    /** Dotted id, e.g. 'hr.resting', 'hrv.rmssd', 'mood.vas'. */
    id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/),
    label: z.string().min(1),
    /** Canonical unit. Records for this signal must use exactly this unit string. */
    unit: z.string().min(1),
    domain: SignalDomain,
    allowedClassifications: z.array(Classification).min(1),
    cadence: Cadence,
    /** Which direction of change away from the personal baseline is adverse. */
    adverseDirection: z.enum(['up', 'down', 'both']),
    /**
     * PHYSICAL plausibility bounds used only by data-quality rules to reject sensor/entry errors.
     * These are deliberately wide and are NOT clinical reference ranges.
     */
    plausibleRange: z.tuple([z.number(), z.number()]),
    /** Only set when a cited range exists in the reference-range registry. */
    referenceRangeId: z.string().optional(),
    hrpRisks: z.array(HrpRiskId),
    baseline: z.object({
      minObservations: z.number().int().positive(),
      windowDays: z.number().int().positive(),
    }),
    /** Plain-language explanation: what it is and how it is obtained in space. */
    explanation: z.string().min(1),
    /** Whether this signal feeds the Brain & Mental Health assessment profile. */
    brainProfile: z.boolean().default(false),
  })
  .refine((d) => d.plausibleRange[0] < d.plausibleRange[1], {
    message: 'plausibleRange must be [min, max] with min < max',
    path: ['plausibleRange'],
  });
export type SignalDefinition = z.infer<typeof SignalDefinition>;
export type SignalId = SignalDefinition['id'];
/** Authoring shape (defaults not yet applied) — use this to declare registry entries. */
export type SignalDefinitionInput = z.input<typeof SignalDefinition>;
