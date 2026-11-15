/**
 * @orbital/simulation — Workstream B.
 * Deterministic 180-day synthetic missions for five fictional crew members. All output is SYNTHETIC.
 * Assumptions are documented in docs/synthetic-scenarios.md.
 */
export { CREW, CREW_IDS, crewProfiles, type Baselines, type SimParams } from './profiles';
export { SCENARIO_TRUTH, INTERVENTION_DAY, forcing, smoothstep, type Forcing } from './scenarios';
export { generateMission, generateFromParams, signalSpec, SIM_VERSION, MISSION_DAYS, MISSION_START_UTC, SIMULATED_SIGNAL_IDS, type MissionData, type TrueDay } from './generate';
export { generateTelemetry, TELEMETRY_STEP_MIN } from './telemetry';
export { Rng, hashSeed, stream } from './rng';
export { virtualParams, generateVirtualMission, cohortSpecs, TRAINING_SEED_BASE, EVALUATION_SEED_BASE, trainingCohortSpecs, evaluationCohortSpecs, type VirtualSpec } from './cohort';
