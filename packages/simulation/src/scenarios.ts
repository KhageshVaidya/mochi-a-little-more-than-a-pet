import type { ScenarioId } from '@orbital/contracts';

/**
 * Scenario forcing functions: each returns 0 (no effect) … 1 (full effect) for a mission day.
 * These are the simulation's GROUND TRUTH — used by tests to measure detection latency.
 */

export interface Forcing {
  /** Early adaptation to microgravity (all scenarios), decays over the first ~2 weeks. */
  adaptation: number;
  sleep: number;
  deconditioning: number;
  wellbeing: number;
}

/** Smooth 0→1 ramp. */
export function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

export const SCENARIO_TRUTH: Record<ScenarioId, { onsetDay: number | null; description: string }> = {
  'healthy-adaptation': { onsetDay: null, description: 'No forcing beyond normal early adaptation.' },
  'sleep-disruption': {
    onsetDay: 45,
    description: 'Sleep forcing ramps from day 45 to full by day 95; recovery intervention on day 120 decays it to ~35%.',
  },
  'physical-deterioration': {
    onsetDay: 55,
    description: 'Deconditioning ramps smoothly from day 55 to full by day 165 (declining exercise adherence).',
  },
  'psych-deterioration': {
    onsetDay: 85,
    description: 'Wellbeing forcing ramps smoothly from day 85 to full by day 140 and persists.',
  },
  'incomplete-telemetry': {
    onsetDay: null,
    description: 'No physiological forcing; data availability and quality are degraded instead.',
  },
};

export const INTERVENTION_DAY = 120;

export function forcing(scenario: ScenarioId, day: number): Forcing {
  const adaptation = Math.exp(-day / 5);
  const f: Forcing = { adaptation, sleep: 0, deconditioning: 0, wellbeing: 0 };
  switch (scenario) {
    case 'sleep-disruption':
      f.sleep =
        day < INTERVENTION_DAY
          ? smoothstep((day - 45) / 50)
          : 0.35 + 0.65 * Math.exp(-(day - INTERVENTION_DAY) / 9);
      break;
    case 'physical-deterioration':
      f.deconditioning = smoothstep((day - 55) / 110);
      break;
    case 'psych-deterioration':
      f.wellbeing = smoothstep((day - 85) / 55);
      break;
    default:
      break;
  }
  return f;
}
