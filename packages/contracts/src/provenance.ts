import { z } from 'zod';

/**
 * Provenance — every value ORBITAL shows must carry these.
 * See docs/architecture-plan.md §0 (Provenance first) and §2.
 */

/** Where a record physically came from. */
export const SourceKind = z.enum(['synthetic', 'nasa', 'user', 'model', 'device']);
export type SourceKind = z.infer<typeof SourceKind>;

/**
 * How a value was obtained. Kept separate from SourceKind on purpose:
 * a synthetic record can still simulate a *measured* signal.
 */
export const Classification = z.enum([
  /** Direct sensor reading (HR from PPG/ECG, SpO2, skin temperature, BP cuff). */
  'measured',
  /** Deterministic computation from measured data (RMSSD from RR intervals, sleep duration from actigraphy). */
  'derived',
  /** Statistical or model estimate (fatigue index, hydration estimate, segmental fat). */
  'inferred',
  /** Astronaut input (mood, stress, isolation scales). */
  'self-reported',
  /** Knowledge content (NASA HRP text, cited reference ranges). */
  'reference',
]);
export type Classification = z.infer<typeof Classification>;

export const ScenarioId = z.enum([
  'healthy-adaptation',
  'sleep-disruption',
  'physical-deterioration',
  'psych-deterioration',
  'incomplete-telemetry',
]);
export type ScenarioId = z.infer<typeof ScenarioId>;

export const Source = z
  .object({
    kind: SourceKind,
    /** Adapter that produced the record, e.g. 'sim.v1', 'user.checkin', 'nasa.hrp', 'nasa.osdr'. */
    adapterId: z.string().min(1),
    /** Descriptive device label. For synthetic data this is always a simulated device, never a real product claim. */
    device: z.string().optional(),
    /** Required for synthetic records so they can never be mistaken for real telemetry. */
    scenarioId: ScenarioId.optional(),
    /** URL or DOI for NASA / reference content. */
    citation: z.string().optional(),
    /** ISO timestamp when external content was snapshotted. */
    retrievedAt: z.iso.datetime().optional(),
  })
  .refine((s) => s.kind !== 'synthetic' || s.scenarioId !== undefined, {
    message: 'Synthetic records must declare a scenarioId',
    path: ['scenarioId'],
  })
  .refine((s) => s.kind !== 'nasa' || s.citation !== undefined, {
    message: 'NASA-sourced records must carry a citation',
    path: ['citation'],
  });
export type Source = z.infer<typeof Source>;

export const QualityFlag = z.enum([
  'implausible',
  'motion-artifact',
  'low-contact',
  'gap',
  'duplicate',
  'unit-mismatch',
  'stale',
  'imputed',
]);
export type QualityFlag = z.infer<typeof QualityFlag>;

export const Quality = z.object({
  /** 0 (unusable) … 1 (excellent). */
  score: z.number().min(0).max(1),
  flags: z.array(QualityFlag),
});
export type Quality = z.infer<typeof Quality>;
