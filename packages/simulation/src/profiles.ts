import type { AstronautId, AstronautProfile } from '@orbital/contracts';

/**
 * Five FICTIONAL crew members. Names, roles and numbers are invented for demonstration.
 * Baselines are plausible healthy-adult values chosen to differ between people; they are
 * simulation parameters, not reference ranges.
 */

export interface Baselines {
  restingHr: number; // bpm
  hrv: number; // ms RMSSD
  spo2: number; // %
  resp: number; // breaths/min
  sbp: number; // mmHg
  dbp: number; // mmHg
  skinTemp: number; // °C
  glucose: number; // mg/dL fasting
  sleepH: number; // h
  sleepEff: number; // %
  sleepQ: number; // 0–10
  activeMin: number; // min/day
  resistMin: number; // prescribed min/day
  aerobicMin: number; // prescribed min/day
  workRate: number; // W at fixed submaximal HR
  hydration: number; // mL/day
  massKg: number;
  fatKg: number;
  mood: number; // 0–10
  stress: number; // 0–10
  motivation: number; // 0–10
  isolation: number; // 0–10
  fatigue: number; // 0–10
  concentration: number; // 0–10
  rtMs: number; // median reaction time
  memoryPct: number; // %
}

export interface SimParams {
  profile: AstronautProfile;
  baselines: Baselines;
  /** Probability a given day has wearable data. */
  wearCompliance: number;
  /** Probability the daily check-in (self-reports + cognitive tasks) is completed. */
  checkinCompliance: number;
  /** Multiplier on measurement noise. */
  noise: number;
  /** Probability of a motion artefact on a sensor reading. */
  artifactRate: number;
  /** Probability of a gross sensor/entry error (outside physical plausibility). */
  errorRate: number;
  /** Multi-day device outages: expected number over the mission. */
  outages: number;
  /** Left/right asymmetry of segmental lean mass (fraction, + = right larger). */
  asymmetry: number;
  /** Hydration logging variability multiplier. */
  hydrationVariability: number;
}

const profile = (p: AstronautProfile) => p;

export const CREW: Record<AstronautId, SimParams> = {
  'CM-01': {
    profile: profile({
      id: 'CM-01',
      name: 'Alex Morgan',
      initials: 'AM',
      role: 'Commander',
      scenario: 'healthy-adaptation',
      scenarioLabel: 'Healthy adaptation',
      scenarioSummary: 'Adapts well after the first week; normal day-to-day variation around a stable baseline.',
      accent: 'blue',
      seed: 410_001,
    }),
    baselines: {
      restingHr: 54, hrv: 68, spo2: 97.6, resp: 13.4, sbp: 116, dbp: 74, skinTemp: 33.4, glucose: 91,
      sleepH: 7.3, sleepEff: 90, sleepQ: 7, activeMin: 96, resistMin: 60, aerobicMin: 35, workRate: 215,
      hydration: 2600, massKg: 78.4, fatKg: 13.2, mood: 7, stress: 3, motivation: 8, isolation: 2,
      fatigue: 3, concentration: 8, rtMs: 268, memoryPct: 88,
    },
    wearCompliance: 0.97, checkinCompliance: 0.96, noise: 1, artifactRate: 0.02, errorRate: 0,
    outages: 0, asymmetry: 0.015, hydrationVariability: 1,
  },
  'CM-02': {
    profile: profile({
      id: 'CM-02',
      name: 'Maya Chen',
      initials: 'MC',
      role: 'Flight Engineer',
      scenario: 'sleep-disruption',
      scenarioLabel: 'Sleep disruption',
      scenarioSummary:
        'Sleep becomes progressively irregular from about day 45; a recovery intervention on day 120 brings partial recovery.',
      accent: 'orange',
      seed: 410_002,
    }),
    baselines: {
      restingHr: 58, hrv: 54, spo2: 97.9, resp: 14.1, sbp: 109, dbp: 70, skinTemp: 33.7, glucose: 87,
      sleepH: 7.1, sleepEff: 89, sleepQ: 7, activeMin: 88, resistMin: 60, aerobicMin: 30, workRate: 168,
      hydration: 2200, massKg: 61.2, fatKg: 14.6, mood: 7, stress: 3, motivation: 8, isolation: 3,
      fatigue: 3, concentration: 7, rtMs: 255, memoryPct: 90,
    },
    wearCompliance: 0.96, checkinCompliance: 0.94, noise: 1, artifactRate: 0.025, errorRate: 0,
    outages: 0, asymmetry: -0.01, hydrationVariability: 1,
  },
  'CM-03': {
    profile: profile({
      id: 'CM-03',
      name: 'Daniel Reed',
      initials: 'DR',
      role: 'Mission Specialist',
      scenario: 'physical-deterioration',
      scenarioLabel: 'Physical deconditioning',
      scenarioSummary:
        'Exercise adherence and activity decline from about day 55, with progressive changes in fitness, resting heart rate and lean mass.',
      accent: 'aqua',
      seed: 410_003,
    }),
    baselines: {
      restingHr: 50, hrv: 76, spo2: 97.4, resp: 12.8, sbp: 121, dbp: 77, skinTemp: 33.2, glucose: 94,
      sleepH: 7.0, sleepEff: 91, sleepQ: 7, activeMin: 112, resistMin: 60, aerobicMin: 40, workRate: 248,
      hydration: 2900, massKg: 86.0, fatKg: 12.4, mood: 7, stress: 3, motivation: 8, isolation: 2,
      fatigue: 3, concentration: 7, rtMs: 274, memoryPct: 86,
    },
    wearCompliance: 0.95, checkinCompliance: 0.93, noise: 1, artifactRate: 0.025, errorRate: 0,
    outages: 0, asymmetry: 0.02, hydrationVariability: 2,
  },
  'CM-04': {
    profile: profile({
      id: 'CM-04',
      name: 'Sofia Patel',
      initials: 'SP',
      role: 'Payload Specialist',
      scenario: 'psych-deterioration',
      scenarioLabel: 'Wellbeing changes',
      scenarioSummary:
        'From about day 85, gradual multi-domain changes in self-reported mood, stress, motivation and isolation, sleep quality and cognitive performance.',
      accent: 'yellow',
      seed: 410_004,
    }),
    baselines: {
      restingHr: 61, hrv: 47, spo2: 98.1, resp: 14.6, sbp: 112, dbp: 72, skinTemp: 33.9, glucose: 89,
      sleepH: 7.5, sleepEff: 90, sleepQ: 8, activeMin: 84, resistMin: 60, aerobicMin: 30, workRate: 172,
      hydration: 2300, massKg: 64.0, fatKg: 16.0, mood: 7, stress: 3, motivation: 8, isolation: 2,
      fatigue: 3, concentration: 8, rtMs: 281, memoryPct: 89,
    },
    wearCompliance: 0.96, checkinCompliance: 0.93, noise: 1, artifactRate: 0.02, errorRate: 0,
    outages: 0, asymmetry: -0.015, hydrationVariability: 1,
  },
  'CM-05': {
    profile: profile({
      id: 'CM-05',
      name: 'James Wilson',
      initials: 'JW',
      role: 'Flight Engineer',
      scenario: 'incomplete-telemetry',
      scenarioLabel: 'Incomplete telemetry',
      scenarioSummary:
        'Frequent sensor gaps, multi-day device outages, noisy readings and many skipped check-ins — the data are too sparse for reliable assessment much of the time.',
      accent: 'magenta',
      seed: 410_005,
    }),
    baselines: {
      restingHr: 57, hrv: 61, spo2: 97.3, resp: 13.9, sbp: 118, dbp: 76, skinTemp: 33.5, glucose: 93,
      sleepH: 6.9, sleepEff: 88, sleepQ: 7, activeMin: 92, resistMin: 60, aerobicMin: 35, workRate: 205,
      hydration: 2500, massKg: 80.6, fatKg: 15.1, mood: 7, stress: 4, motivation: 7, isolation: 3,
      fatigue: 4, concentration: 7, rtMs: 262, memoryPct: 87,
    },
    wearCompliance: 0.76, checkinCompliance: 0.7, noise: 1.8, artifactRate: 0.12, errorRate: 0.012,
    outages: 6, asymmetry: 0.01, hydrationVariability: 1.5,
  },
};

export const CREW_IDS = Object.keys(CREW) as AstronautId[];

export function crewProfiles(): AstronautProfile[] {
  return CREW_IDS.map((id) => CREW[id].profile);
}
