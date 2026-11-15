import { z } from 'zod';
import { Classification, Quality, Source } from './provenance';

/** The atomic unit of health data in ORBITAL. */
export const HealthRecord = z.object({
  /** Deterministic id: hash(signalId, timestamp, source.adapterId). */
  id: z.string().min(1),
  /** Crew member the record belongs to (e.g. 'CM-04'). */
  subjectId: z.string().min(1),
  signalId: z.string().min(1),
  /** ISO-8601 UTC. */
  timestamp: z.iso.datetime(),
  /** Mission elapsed day (0 = launch day). Negative = pre-flight baseline. */
  missionDay: z.number().int(),
  value: z.number().finite(),
  unit: z.string().min(1),
  aggregation: z.enum(['sample', 'daily-mean', 'daily-total', 'nightly', 'spot']),
  source: Source,
  classification: Classification,
  quality: Quality,
});
export type HealthRecord = z.infer<typeof HealthRecord>;

export interface DayRange {
  /** Inclusive. */
  fromDay: number;
  /** Inclusive. */
  toDay: number;
}
