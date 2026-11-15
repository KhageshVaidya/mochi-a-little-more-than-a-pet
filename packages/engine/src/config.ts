import type { SignalDomain } from '@orbital/contracts';

/**
 * Engine configuration. These are ENGINEERING DEFAULTS chosen for a transparent demonstrator —
 * they are not clinically validated thresholds. All are configurable; changing them changes the
 * config hash in every assessment trace.
 */
export interface EngineConfig {
  version: string;
  baseline: { startDay: number; endDay: number };
  window: { days: number; persistenceDays: number };
  quality: { minQuality: number; rejectFlags: string[] };
  sufficiency: { minCoverage: number; requiredDomains: number };
  detectors: {
    zWatch: number;
    zAttention: number;
    persistenceMin: number;
    ewma: { lambda: number; L: number };
    cusum: { k: number; h: number };
  };
  /** Domains whose sustained change can establish YES. Supporting domains add context only. */
  coreDomains: SignalDomain[];
  supportingDomains: SignalDomain[];
  rules: { multiDomainMin: number; singleDomainStrongDays: number; confirmDays: number };
}

export const DEFAULT_CONFIG: EngineConfig = {
  version: 'brain-wellbeing/1.1',
  // Excludes the first ~10 days of adaptation to microgravity.
  baseline: { startDay: 10, endDay: 37 },
  window: { days: 14, persistenceDays: 7 },
  quality: { minQuality: 0.5, rejectFlags: ['motion-artifact', 'low-contact', 'implausible', 'unit-mismatch', 'duplicate'] },
  sufficiency: { minCoverage: 0.7, requiredDomains: 5 },
  detectors: {
    zWatch: 1.5,
    zAttention: 2.0,
    persistenceMin: 5,
    ewma: { lambda: 0.2, L: 2.7 },
    cusum: { k: 0.5, h: 5 },
  },
  coreDomains: ['mood', 'stress', 'social', 'fatigue', 'sleep', 'cognition'],
  supportingDomains: ['activity'],
  rules: { multiDomainMin: 2, singleDomainStrongDays: 10, confirmDays: 3 },
};
