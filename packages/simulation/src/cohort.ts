import type { AstronautId, ScenarioId } from '@orbital/contracts';
import { CREW, type Baselines, type SimParams } from './profiles';
import { generateFromParams, type MissionData } from './generate';
import { stream } from './rng';

/**
 * Virtual (synthetic) cohorts for ML training and evaluation (Phase 4).
 *
 * Each virtual astronaut copies a template crew member's structure, gets its own seed, and has its
 * baselines jittered (±~5–8 %) so the model never sees one person's exact numbers. Training and evaluation
 * cohorts use DISJOINT seed ranges, and the five named crew members are never used for training.
 */
export interface VirtualSpec {
  template: AstronautId;
  scenario: ScenarioId;
  seed: number;
}

const TEMPLATES: AstronautId[] = ['CM-01', 'CM-02', 'CM-03', 'CM-04'];
/** Seed ranges. Disjoint by construction; tests assert no overlap. */
export const TRAINING_SEED_BASE = 900_000;
export const EVALUATION_SEED_BASE = 950_000;

export function virtualParams(spec: VirtualSpec): SimParams {
  const t = CREW[spec.template];
  const r = stream(spec.seed, 'cohort-jitter');
  const b = { ...t.baselines } as Baselines;
  for (const k of Object.keys(b) as (keyof Baselines)[]) {
    const pct = k === 'resistMin' || k === 'aerobicMin' ? 0 : 0.06;
    const v = b[k] * (1 + pct * r.normal());
    // Bounded scales stay on their scale.
    b[k] = ['mood', 'stress', 'motivation', 'isolation', 'fatigue', 'concentration', 'sleepQ'].includes(k) ? Math.min(9, Math.max(1, Math.round(v))) : v;
  }
  b.spo2 = Math.min(99.5, t.baselines.spo2 + 0.4 * r.normal());
  b.sleepEff = Math.min(97, b.sleepEff);
  b.memoryPct = Math.min(97, b.memoryPct);
  const incomplete = spec.scenario === 'incomplete-telemetry';
  const src = incomplete ? CREW['CM-05'] : t;
  return {
    ...src,
    profile: { ...t.profile, scenario: spec.scenario, seed: spec.seed, name: `Virtual ${spec.seed}` },
    baselines: b,
  };
}

export function generateVirtualMission(spec: VirtualSpec): MissionData {
  return generateFromParams(virtualParams(spec), spec.template, `V${spec.seed}`);
}

/** n virtual astronauts for a scenario, seeds base+1..base+n, templates cycled. */
export function cohortSpecs(scenario: ScenarioId, n: number, base: number): VirtualSpec[] {
  return Array.from({ length: n }, (_, i) => ({ template: TEMPLATES[i % TEMPLATES.length]!, scenario, seed: base + i + 1 + scenarioOffset(scenario) }));
}

const scenarioOffset = (s: ScenarioId) => ({ 'healthy-adaptation': 0, 'sleep-disruption': 1000, 'physical-deterioration': 2000, 'psych-deterioration': 3000, 'incomplete-telemetry': 4000 })[s];

/** Default ML training cohort: 40 healthy virtual astronauts (seeds 900_001–900_040). Never the named crew. */
export function trainingCohortSpecs(n = 40): VirtualSpec[] {
  return cohortSpecs('healthy-adaptation', n, TRAINING_SEED_BASE);
}

/** Default held-out evaluation cohort: every scenario, disjoint seeds (950_000+). */
export function evaluationCohortSpecs(perScenario = 8): VirtualSpec[] {
  return (['healthy-adaptation', 'sleep-disruption', 'physical-deterioration', 'psych-deterioration', 'incomplete-telemetry'] as const).flatMap((s) =>
    cohortSpecs(s, s === 'healthy-adaptation' ? perScenario * 2 : perScenario, EVALUATION_SEED_BASE),
  );
}
