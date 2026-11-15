import { z } from 'zod';
import { Classification, QualityFlag } from './provenance';
import { AstronautId } from './crew';
import { AssessmentState } from './assessment';

/**
 * Read models served by the main process to the dashboard.
 * Every number displayed in the UI comes from one of these, computed from simulation records.
 */

export const BaselineStats = z.object({
  /** 'baseline' = statistical baseline window; 'first' = first observation (sparse signals, e.g. monthly body composition). */
  kind: z.enum(['baseline', 'first']),
  mean: z.number(),
  sd: z.number(),
  n: z.number().int(),
  startDay: z.number().int(),
  endDay: z.number().int(),
});
export type BaselineStats = z.infer<typeof BaselineStats>;

export const MetricSnapshot = z.object({
  signalId: z.string(),
  value: z.number().nullable(),
  /** Day the shown value was observed (may be earlier than the selected day for weekly/monthly signals). */
  observedDay: z.number().int().nullable(),
  classification: Classification.nullable(),
  quality: z.number().nullable(),
  flags: z.array(QualityFlag),
  baseline: BaselineStats.nullable(),
  /** Signed deviation from baseline in SDs (positive = higher). Null when no statistical baseline. */
  z: z.number().nullable(),
  /** Change relative to the reference value, in percent. */
  deltaPct: z.number().nullable(),
  /** Mean of the 7 days up to and including the selected day. */
  mean7: z.number().nullable(),
  /** Share of the last 14 days with a reliable observation (daily signals) or recency-based for sparse signals. */
  coverage14: z.number().min(0).max(1),
});
export type MetricSnapshot = z.infer<typeof MetricSnapshot>;

export const Snapshot = z.object({
  astronautId: AstronautId,
  day: z.number().int(),
  metrics: z.record(z.string(), MetricSnapshot),
  completeness: z.object({
    /** Share of expected observations present in the last 14 days, across all signals. */
    overall: z.number().min(0).max(1),
    sensor: z.number().min(0).max(1),
    selfReport: z.number().min(0).max(1),
    lowQualityShare: z.number().min(0).max(1),
  }),
});
export type Snapshot = z.infer<typeof Snapshot>;

export const SeriesPoint = z.object({
  day: z.number().int(),
  value: z.number(),
  quality: z.number(),
  classification: Classification,
  flagged: z.boolean(),
});
export type SeriesPoint = z.infer<typeof SeriesPoint>;

export const SeriesRequest = z.object({
  astronautId: AstronautId,
  signalIds: z.array(z.string()).min(1).max(40),
  fromDay: z.number().int().min(0).max(179),
  toDay: z.number().int().min(0).max(179),
});
export const SeriesResponse = z.record(z.string(), z.array(SeriesPoint));
export type SeriesResponse = z.infer<typeof SeriesResponse>;

export const CrewSummary = z.object({
  astronautId: AstronautId,
  day: z.number().int(),
  completeness: z.number().min(0).max(1),
  /** Physical indicators only. Wellbeing results are deliberately NOT part of crew-level views. */
  metrics: z.record(z.string(), z.object({ value: z.number().nullable(), z: z.number().nullable() })),
});
export type CrewSummary = z.infer<typeof CrewSummary>;

export const AssessRequest = z.object({ astronautId: AstronautId, day: z.number().int().min(0).max(179) });

export const AssessmentTimeline = z.array(z.object({ day: z.number().int(), state: AssessmentState }));
export type AssessmentTimeline = z.infer<typeof AssessmentTimeline>;

export const TelemetryDay = z.object({
  astronautId: AstronautId,
  day: z.number().int(),
  stepMinutes: z.number().int(),
  /** Per-sample activity context. */
  phase: z.array(z.enum(['sleep', 'work', 'exercise'])),
  hr: z.array(z.number().nullable()),
  resp: z.array(z.number().nullable()),
  spo2: z.array(z.number().nullable()),
  skinTemp: z.array(z.number().nullable()),
  /** Always true: this is playback of simulated data, not live sensor telemetry. */
  playback: z.literal(true),
});
export type TelemetryDay = z.infer<typeof TelemetryDay>;

