import type { AstronautId, Classification, HealthRecord, QualityFlag } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { CREW, type SimParams } from './profiles';
import { forcing, type Forcing } from './scenarios';
import { Rng, stream } from './rng';

/**
 * ORBITAL synthetic mission generator.
 *
 * Two stages:
 *  1. LATENT MODEL — each day, hidden drivers (sleep variability, stress load, mood, activity) evolve as
 *     AR(1) processes and combine with scenario forcing to produce the person's TRUE physiology and
 *     experience. Signals share drivers, so correlations arise by construction (e.g. short sleep →
 *     accumulated sleep debt → higher fatigue, slower reaction time, lower HRV the next days).
 *  2. OBSERVATION MODEL — decides what instruments actually captured: wear compliance, skipped check-ins,
 *     multi-day outages, motion artefacts, gross errors, measurement noise, quality scores, rounding.
 *
 * Everything is deterministic for a given profile seed. All records are SYNTHETIC.
 */

export const SIM_VERSION = 'sim.v1.0';
export const MISSION_DAYS = 180;
/** Fictional mission start date used only to build timestamps. */
export const MISSION_START_UTC = Date.UTC(2026, 2, 2);

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

type Channel = 'wearable' | 'checkin' | 'task' | 'scheduled' | 'bia' | 'exercise-log' | 'inferred';

interface SignalSpec {
  channel: Channel;
  classification: Classification;
  aggregation: HealthRecord['aggregation'];
  device: string;
  hour: number;
  dp: number;
  /** Measurement noise SD added in the observation stage (before profile noise multiplier). */
  noise: number;
  /** Optional clamp for physically bounded outputs (scores, %). */
  bounds?: [number, number];
}

const SPECS: Record<string, SignalSpec> = {
  'hr.sample': { channel: 'wearable', classification: 'measured', aggregation: 'daily-mean', device: 'Simulated chest-strap ECG', hour: 21, dp: 0, noise: 1 },
  'hr.resting': { channel: 'wearable', classification: 'measured', aggregation: 'nightly', device: 'Simulated chest-strap ECG', hour: 6.5, dp: 0, noise: 0.8 },
  'hrv.rmssd': { channel: 'wearable', classification: 'derived', aggregation: 'nightly', device: 'Simulated chest-strap ECG (RR intervals)', hour: 6.5, dp: 0, noise: 2 },
  'spo2.nightly': { channel: 'wearable', classification: 'measured', aggregation: 'nightly', device: 'Simulated pulse oximeter', hour: 6.5, dp: 1, noise: 0.25, bounds: [0, 100] },
  'resp.rate': { channel: 'wearable', classification: 'measured', aggregation: 'daily-mean', device: 'Simulated respiratory band', hour: 21, dp: 1, noise: 0.3 },
  'temp.skin': { channel: 'wearable', classification: 'measured', aggregation: 'daily-mean', device: 'Simulated skin thermistor', hour: 21, dp: 2, noise: 0.1 },
  'sleep.duration': { channel: 'wearable', classification: 'derived', aggregation: 'nightly', device: 'Simulated wrist actigraph', hour: 6.5, dp: 2, noise: 0.12 },
  'sleep.efficiency': { channel: 'wearable', classification: 'derived', aggregation: 'nightly', device: 'Simulated wrist actigraph', hour: 6.5, dp: 0, noise: 1, bounds: [0, 100] },
  'activity.active-minutes': { channel: 'wearable', classification: 'derived', aggregation: 'daily-total', device: 'Simulated wrist actigraph', hour: 21, dp: 0, noise: 4, bounds: [0, 1440] },
  'exercise.resistance': { channel: 'exercise-log', classification: 'self-reported', aggregation: 'daily-total', device: 'ORBITAL exercise log', hour: 20, dp: 0, noise: 0, bounds: [0, 300] },
  'exercise.aerobic': { channel: 'exercise-log', classification: 'self-reported', aggregation: 'daily-total', device: 'ORBITAL exercise log', hour: 20, dp: 0, noise: 0, bounds: [0, 300] },
  'hydration.intake': { channel: 'checkin', classification: 'self-reported', aggregation: 'daily-total', device: 'ORBITAL check-in', hour: 21.5, dp: 0, noise: 0, bounds: [0, 8000] },
  'sleep.quality': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'fatigue.vas': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'mood.vas': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'stress.vas': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'motivation.vas': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'isolation.vas': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'cog.concentration': { channel: 'checkin', classification: 'self-reported', aggregation: 'spot', device: 'ORBITAL check-in', hour: 8, dp: 0, noise: 0, bounds: [0, 10] },
  'cog.rt.median': { channel: 'task', classification: 'measured', aggregation: 'spot', device: 'ORBITAL vigilance task', hour: 8.25, dp: 0, noise: 6 },
  'cog.rt.lapses': { channel: 'task', classification: 'measured', aggregation: 'spot', device: 'ORBITAL vigilance task', hour: 8.25, dp: 0, noise: 0, bounds: [0, 100] },
  'cog.memory.accuracy': { channel: 'task', classification: 'measured', aggregation: 'spot', device: 'ORBITAL pattern-memory task', hour: 8.3, dp: 0, noise: 1.5, bounds: [0, 100] },
  'bp.systolic': { channel: 'scheduled', classification: 'measured', aggregation: 'spot', device: 'Simulated BP cuff', hour: 7.5, dp: 0, noise: 2 },
  'bp.diastolic': { channel: 'scheduled', classification: 'measured', aggregation: 'spot', device: 'Simulated BP cuff', hour: 7.5, dp: 0, noise: 1.5 },
  'spo2.spot': { channel: 'scheduled', classification: 'measured', aggregation: 'spot', device: 'Simulated pulse oximeter', hour: 7.5, dp: 0, noise: 0.4, bounds: [0, 100] },
  'glucose.capillary': { channel: 'scheduled', classification: 'measured', aggregation: 'spot', device: 'Simulated glucometer (fasting)', hour: 7.4, dp: 0, noise: 3 },
  'body.mass': { channel: 'scheduled', classification: 'measured', aggregation: 'spot', device: 'Simulated inertial mass-measurement device', hour: 7.3, dp: 1, noise: 0.2 },
  'exercise.performance': { channel: 'scheduled', classification: 'derived', aggregation: 'spot', device: 'Simulated cycle ergometer test', hour: 16, dp: 0, noise: 3 },
  'body.lean-mass': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated bioimpedance analyser', hour: 7.6, dp: 1, noise: 0.5 },
  'body.fat-mass': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated bioimpedance analyser', hour: 7.6, dp: 1, noise: 0.4 },
  'body.muscle-mass': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated bioimpedance analyser', hour: 7.6, dp: 1, noise: 0 },
  'body.skeletal-muscle': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated bioimpedance analyser', hour: 7.6, dp: 1, noise: 0 },
  'body.water': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated bioimpedance analyser', hour: 7.6, dp: 1, noise: 0 },
  'body.segment.arm-left': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated segmental bioimpedance', hour: 7.6, dp: 2, noise: 0.05 },
  'body.segment.arm-right': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated segmental bioimpedance', hour: 7.6, dp: 2, noise: 0.05 },
  'body.segment.trunk': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated segmental bioimpedance', hour: 7.6, dp: 1, noise: 0.25 },
  'body.segment.leg-left': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated segmental bioimpedance', hour: 7.6, dp: 2, noise: 0.1 },
  'body.segment.leg-right': { channel: 'bia', classification: 'inferred', aggregation: 'spot', device: 'Simulated segmental bioimpedance', hour: 7.6, dp: 2, noise: 0.1 },
  'hydration.index': { channel: 'inferred', classification: 'inferred', aggregation: 'spot', device: 'ORBITAL inference model (simulated)', hour: 22, dp: 0, noise: 0, bounds: [0, 100] },
  'fatigue.index': { channel: 'inferred', classification: 'inferred', aggregation: 'spot', device: 'ORBITAL inference model (simulated)', hour: 9, dp: 0, noise: 0, bounds: [0, 100] },
};

export const SIMULATED_SIGNAL_IDS = Object.keys(SPECS);
export function signalSpec(id: string): SignalSpec | undefined {
  return SPECS[id];
}

/** True (latent) state for one day, before observation. Exposed for tests and documentation. */
export interface TrueDay {
  day: number;
  forcing: Forcing;
  sleepDebt: number;
  values: Record<string, number>;
}

export interface MissionData {
  astronautId: AstronautId;
  simVersion: string;
  records: HealthRecord[];
  truth: TrueDay[];
}

// ── Stage 1: latent model ─────────────────────────────────────────────────────
function simulateTruth(p: SimParams): TrueDay[] {
  const b = p.baselines;
  const seed = p.profile.seed;
  const r = stream(seed, 'latent');
  const n = () => r.normal();
  const days: TrueDay[] = [];

  // AR(1) hidden drivers (unit stationary variance).
  let zSleep = 0;
  let zStress = 0;
  let zMood = 0;
  let zAct = 0;
  let debt = 0;

  // Segmental lean mass at launch (kg). Fractions of fat-free mass; remaining ~9% is head/neck.
  const ffm0 = b.massKg - b.fatKg;
  const seg0 = {
    'arm-left': ffm0 * 0.055 * (1 - p.asymmetry / 2),
    'arm-right': ffm0 * 0.055 * (1 + p.asymmetry / 2),
    trunk: ffm0 * 0.44,
    'leg-left': ffm0 * 0.18 * (1 - p.asymmetry / 2),
    'leg-right': ffm0 * 0.18 * (1 + p.asymmetry / 2),
  };
  // Microgravity unloading affects legs most, arms least (simulation assumption).
  const segLossWeight = { 'arm-left': 0.6, 'arm-right': 0.6, trunk: 0.7, 'leg-left': 1.8, 'leg-right': 1.8 } as const;

  for (let d = 0; d < MISSION_DAYS; d++) {
    const f = forcing(p.profile.scenario, d);
    const weekend = d % 7 === 5 || d % 7 === 6;
    const restDay = d % 7 === 6;

    zSleep = 0.55 * zSleep + 0.835 * n();
    zStress = 0.7 * zStress + 0.714 * n();
    zMood = 0.7 * zMood + 0.714 * n();
    zAct = 0.5 * zAct + 0.866 * n();

    // Sleep: variability grows with sleep forcing (irregularity), plus a mean shift.
    const sleepSd = 0.32 * (1 + 1.8 * f.sleep);
    const sleepH = clamp(
      b.sleepH + sleepSd * zSleep - 0.6 * f.adaptation - 1.5 * f.sleep - 0.45 * f.wellbeing + (weekend ? 0.15 : 0) -
        f.sleep * 0.6 * Math.abs(n()),
      3,
      10,
    );
    debt = 0.6 * debt + Math.max(0, b.sleepH - sleepH);

    const rhr = b.restingHr + 3 * f.adaptation + 0.6 * debt + 2.6 * f.wellbeing + 7 * f.deconditioning + 1.5 * f.sleep + 0.4 * zStress + 0.9 * n();
    const hrv =
      b.hrv *
      (1 - 0.03 * debt - 0.15 * f.wellbeing - 0.2 * f.deconditioning - 0.1 * f.sleep - 0.05 * f.adaptation) *
      Math.exp(0.07 * n());
    const active = clamp(
      b.activeMin * (1 - 0.55 * f.deconditioning - 0.22 * f.wellbeing - 0.08 * f.sleep) * (weekend ? 0.85 : 1) + 9 * zAct,
      0,
      600,
    );
    const compliance = clamp(1 - 0.65 * f.deconditioning - 0.15 * f.wellbeing - 0.1 * f.sleep + 0.06 * n(), 0, 1.05);
    const resist = restDay ? 0 : Math.round((b.resistMin * compliance) / 5) * 5;
    const aerobic = restDay ? 0 : Math.round((b.aerobicMin * clamp(compliance + 0.05 * n(), 0, 1.1)) / 5) * 5;

    const fatigue = b.fatigue + 0.45 * debt + 2.6 * f.wellbeing + 0.55 * f.deconditioning + 0.7 * f.sleep + 0.3 * zStress + 0.55 * n();
    const stress = b.stress + 2.5 * f.wellbeing + 0.5 * f.sleep + 0.45 * zStress + (weekend ? -0.35 : 0.1) + 0.45 * n();
    const mood = b.mood - 2.7 * f.wellbeing - 0.22 * debt - 0.2 * zStress + 0.45 * zMood + 0.4 * n();
    const motivation = b.motivation - 2.5 * f.wellbeing - 0.3 * f.deconditioning - 0.2 * debt + 0.35 * zMood + 0.45 * n();
    const isolation = b.isolation + 2.9 * f.wellbeing + 0.5 * (d / MISSION_DAYS) - 0.2 * zMood + 0.4 * n();
    const concentration = b.concentration - 0.35 * debt - 2.0 * f.wellbeing - 0.6 * f.sleep + 0.5 * n();
    const slowDay = f.sleep > 0.3 && r.chance(0.15) ? 35 : 0;
    const rt = b.rtMs * (1 + 0.03 * debt + 0.11 * f.wellbeing + 0.04 * f.sleep + 0.02 * f.adaptation) + 7 * n() + slowDay;
    const lapses = Math.max(0, (rt - b.rtMs) / 14 + 1.5 + 1.0 * n());
    const memory = b.memoryPct - 1.5 * debt - 9 * f.wellbeing - 2 * f.sleep + 2 * n();

    // Body composition.
    const leanLoss = 0.02 * (d / MISSION_DAYS) + 0.075 * f.deconditioning;
    const seg = Object.fromEntries(
      (Object.keys(seg0) as (keyof typeof seg0)[]).map((k) => [k, seg0[k] * (1 - leanLoss * segLossWeight[k])]),
    ) as Record<keyof typeof seg0, number>;
    const ffm = (seg['arm-left'] + seg['arm-right'] + seg.trunk + seg['leg-left'] + seg['leg-right']) / 0.91;
    const fat = b.fatKg * (1 + 0.025 * (d / MISSION_DAYS) + 0.1 * f.deconditioning);
    const bone = ffm0 * 0.05 * (1 - 0.005 * (d / 30));

    days.push({
      day: d,
      forcing: f,
      sleepDebt: debt,
      values: {
        'hr.sample': rhr + 18 + 0.06 * (active - b.activeMin) + 1.5 * n(),
        'hr.resting': rhr,
        'hrv.rmssd': hrv,
        'spo2.nightly': b.spo2 - 0.4 * f.adaptation + 0.3 * n(),
        'spo2.spot': b.spo2 + 0.3 + 0.4 * n(),
        'resp.rate': b.resp + 0.3 * zStress + 0.7 * f.wellbeing + 0.4 * f.sleep + 0.3 * n(),
        'temp.skin': b.skinTemp + 0.12 * n() - 0.1 * f.sleep + 0.06 * zStress,
        'bp.systolic': b.sbp + 3 * f.wellbeing + 4 * f.deconditioning + 3 * n(),
        'bp.diastolic': b.dbp + 2 * f.wellbeing + 2.5 * f.deconditioning + 2.2 * n(),
        'glucose.capillary': b.glucose + 2 * f.deconditioning + 4 * n(),
        'sleep.duration': sleepH,
        'sleep.efficiency': b.sleepEff - 2 * f.adaptation - 9 * f.sleep - 3 * f.wellbeing + 1.2 * n() - 0.6 * Math.max(0, -zSleep),
        'sleep.quality': b.sleepQ + 0.55 * (sleepH - b.sleepH) - 2.3 * f.sleep - 1.7 * f.wellbeing + 0.5 * n(),
        'activity.active-minutes': active,
        'exercise.resistance': resist,
        'exercise.aerobic': aerobic,
        'exercise.performance': b.workRate * (1 - 0.19 * f.deconditioning - 0.03 * f.wellbeing - 0.03 * f.adaptation) + 3 * n(),
        'hydration.intake': b.hydration * (1 - 0.08 * f.deconditioning) + 220 * p.hydrationVariability * (1 + f.deconditioning) * n(),
        'fatigue.vas': fatigue,
        'mood.vas': mood,
        'stress.vas': stress,
        'motivation.vas': motivation,
        'isolation.vas': isolation,
        'cog.concentration': concentration,
        'cog.rt.median': rt,
        'cog.rt.lapses': lapses,
        'cog.memory.accuracy': memory,
        'body.mass': ffm + fat + 0.25 * n(),
        'body.lean-mass': ffm,
        'body.fat-mass': fat,
        'body.muscle-mass': ffm - bone,
        'body.skeletal-muscle': 0.565 * ffm * (1 - 0.015 * f.deconditioning),
        'body.water': 0.732 * ffm,
        'body.segment.arm-left': seg['arm-left'],
        'body.segment.arm-right': seg['arm-right'],
        'body.segment.trunk': seg.trunk,
        'body.segment.leg-left': seg['leg-left'],
        'body.segment.leg-right': seg['leg-right'],
      },
    });
  }
  return days;
}

// ── Stage 2: observation model ───────────────────────────────────────────────
function outageDays(p: SimParams): Set<number> {
  const r = stream(p.profile.seed, 'outages');
  const out = new Set<number>();
  for (let i = 0; i < p.outages; i++) {
    const start = r.int(0, MISSION_DAYS - 5);
    const len = r.int(4, 12);
    for (let d = start; d < Math.min(MISSION_DAYS, start + len); d++) out.add(d);
  }
  return out;
}

function timestamp(day: number, hour: number): string {
  return new Date(MISSION_START_UTC + (day * 24 + hour) * 3_600_000).toISOString();
}

export function generateMission(astronautId: AstronautId): MissionData {
  return generateFromParams(CREW[astronautId], astronautId);
}

/**
 * Generate a mission for arbitrary simulation parameters (used for the ML training / evaluation cohorts).
 * `recordPrefix` keeps record ids distinct from the named crew's.
 */
export function generateFromParams(p: SimParams, astronautId: AstronautId, recordPrefix: string = astronautId): MissionData {
  const seed = p.profile.seed;
  const truth = simulateTruth(p);
  const outages = outageDays(p);
  const avail = stream(seed, 'availability');
  const obs = stream(seed, 'observation');
  const records: HealthRecord[] = [];
  // Sparse / incomplete profiles are worse early in the mission (incomplete historical records).
  const early = (d: number) => (p.profile.scenario === 'incomplete-telemetry' && d < 40 ? 0.72 : 1);

  const emit = (day: number, signalId: string, raw: number, quality: number, flags: QualityFlag[]) => {
    const spec = SPECS[signalId]!;
    const def = getSignal(signalId);
    if (!def) throw new Error(`Simulation emits unregistered signal ${signalId}`);
    let value = round(raw, spec.dp);
    if (spec.bounds) value = clamp(value, spec.bounds[0], spec.bounds[1]);
    records.push({
      id: `${recordPrefix}:${signalId}:${day}`,
      subjectId: astronautId,
      signalId,
      timestamp: timestamp(day, spec.hour),
      missionDay: day,
      value,
      unit: def.unit,
      aggregation: spec.aggregation,
      source: { kind: 'synthetic', adapterId: 'sim.v1', device: spec.device, scenarioId: p.profile.scenario },
      classification: spec.classification,
      quality: { score: round(quality, 2), flags },
    });
  };

  /** Applies sensor artefacts / gross errors / noise and emits. */
  const sensor = (day: number, signalId: string, trueValue: number, r: Rng) => {
    const spec = SPECS[signalId]!;
    const def = getSignal(signalId)!;
    const sd = spec.noise * p.noise;
    let value = trueValue + sd * r.normal();
    let quality = p.noise > 1 ? r.range(0.55, 0.95) : r.range(0.86, 0.99);
    const flags: QualityFlag[] = [];
    if (r.chance(p.artifactRate)) {
      value += sd * 4 * r.normal();
      quality = r.range(0.2, 0.45);
      flags.push('motion-artifact');
    } else if (p.noise > 1 && r.chance(0.08)) {
      quality = r.range(0.3, 0.5);
      flags.push('low-contact');
    }
    if (r.chance(p.errorRate)) {
      // Gross error outside physical plausibility; the device does not know — data-quality rules must catch it.
      const [lo, hi] = def.plausibleRange;
      value = r.chance(0.5) ? hi * 1.2 : lo - (hi - lo) * 0.1;
      quality = r.range(0.5, 0.8);
    }
    emit(day, signalId, value, quality, flags);
  };

  for (const t of truth) {
    const d = t.day;
    const v = t.values;
    const wearOk = !outages.has(d) && avail.chance(p.wearCompliance * early(d));
    const checkinOk = avail.chance(p.checkinCompliance * early(d));
    const taskOk = checkinOk && avail.chance(0.96);
    const itemMissing = p.profile.scenario === 'incomplete-telemetry' ? 0.15 : 0.02;

    if (wearOk) {
      for (const id of ['hr.sample', 'hr.resting', 'hrv.rmssd', 'spo2.nightly', 'resp.rate', 'temp.skin', 'sleep.duration', 'sleep.efficiency', 'activity.active-minutes']) {
        if (avail.chance(p.profile.scenario === 'incomplete-telemetry' ? 0.85 : 0.995)) sensor(d, id, v[id]!, obs);
      }
    }
    if (checkinOk) {
      for (const id of ['sleep.quality', 'fatigue.vas', 'mood.vas', 'stress.vas', 'motivation.vas', 'isolation.vas', 'cog.concentration']) {
        if (!avail.chance(itemMissing)) emit(d, id, v[id]!, 1, []);
      }
      if (!avail.chance(itemMissing)) emit(d, 'hydration.intake', Math.round(v['hydration.intake']! / 50) * 50, 0.9, []);
    }
    if (taskOk) {
      sensor(d, 'cog.rt.median', v['cog.rt.median']!, obs);
      emit(d, 'cog.rt.lapses', v['cog.rt.lapses']!, 0.95, []);
      sensor(d, 'cog.memory.accuracy', v['cog.memory.accuracy']!, obs);
    }
    if (wearOk || checkinOk) {
      emit(d, 'exercise.resistance', v['exercise.resistance']!, 0.95, []);
      emit(d, 'exercise.aerobic', v['exercise.aerobic']!, 0.95, []);
    }
    // Weekly scheduled measurements (offset per person so the crew is not measured on the same day).
    if ((d + (seed % 7)) % 7 === 0 && avail.chance(p.profile.scenario === 'incomplete-telemetry' ? 0.7 : 0.97)) {
      for (const id of ['bp.systolic', 'bp.diastolic', 'spo2.spot', 'glucose.capillary', 'body.mass', 'exercise.performance']) {
        sensor(d, id, v[id]!, obs);
      }
    }
    // Monthly bioimpedance session (and at mission end). Includes a small in-flight fluid-shift bias.
    if ((d % 30 === 0 || d === MISSION_DAYS - 1) && (d === 0 || avail.chance(p.profile.scenario === 'incomplete-telemetry' ? 0.7 : 1))) {
      const bias = d === 0 ? 1 : 1.008;
      const err = 1 + 0.008 * obs.normal() * p.noise;
      const ffm = v['body.lean-mass']! * bias * err;
      const q = obs.range(0.8, 0.95);
      emit(d, 'body.lean-mass', ffm, q, []);
      emit(d, 'body.fat-mass', v['body.mass']! - ffm, q, []);
      emit(d, 'body.muscle-mass', v['body.muscle-mass']! * bias * err, q, []);
      emit(d, 'body.skeletal-muscle', v['body.skeletal-muscle']! * bias * err, q, []);
      emit(d, 'body.water', v['body.water']! * bias * err, q, []);
      for (const s of ['arm-left', 'arm-right', 'trunk', 'leg-left', 'leg-right']) {
        const id = `body.segment.${s}`;
        emit(d, id, v[id]! * bias * err + SPECS[id]!.noise * obs.normal(), q, []);
      }
    }
  }

  // Model-inferred indices, computed only from OBSERVED reliable values of the same day.
  const byKey = new Map(records.map((r) => [`${r.signalId}:${r.missionDay}`, r]));
  const ok = (id: string, d: number) => {
    const r = byKey.get(`${id}:${d}`);
    const range = getSignal(id)!.plausibleRange;
    return r && r.quality.score >= 0.5 && r.quality.flags.length === 0 && r.value >= range[0] && r.value <= range[1]
      ? r.value
      : undefined;
  };
  const b = p.baselines;
  for (let d = 0; d < MISSION_DAYS; d++) {
    const sleep = ok('sleep.duration', d);
    const hrv = ok('hrv.rmssd', d);
    const rhr = ok('hr.resting', d);
    if (sleep !== undefined && hrv !== undefined && rhr !== undefined) {
      const idx = 30 + 9 * (b.sleepH - sleep) + 70 * (1 - hrv / b.hrv) + 2 * (rhr - b.restingHr);
      emit(d, 'fatigue.index', idx, 0.6, []);
    }
    const intake = ok('hydration.intake', d);
    if (intake !== undefined) emit(d, 'hydration.index', 70 + (intake - b.hydration) / 25, 0.5, []);
  }

  records.sort((a, z) => a.missionDay - z.missionDay || a.signalId.localeCompare(z.signalId));
  return { astronautId, simVersion: SIM_VERSION, records, truth };
}
