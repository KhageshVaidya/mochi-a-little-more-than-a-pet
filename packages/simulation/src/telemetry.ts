import type { AstronautId, HealthRecord, TelemetryDay } from '@orbital/contracts';
import { CREW } from './profiles';
import { stream } from './rng';

/**
 * Intraday telemetry PLAYBACK for one mission day, generated lazily and deterministically from
 * (profile seed, day). It is anchored to that day's daily records so the intraday trace is
 * consistent with the daily summaries (resting HR, sleep duration, exercise minutes, worn or not).
 * This is simulated playback — never live sensor telemetry.
 */

export const TELEMETRY_STEP_MIN = 2;
const SAMPLES = (24 * 60) / TELEMETRY_STEP_MIN;

export function generateTelemetry(astronautId: AstronautId, day: number, dayRecords: readonly HealthRecord[]): TelemetryDay {
  const p = CREW[astronautId];
  const b = p.baselines;
  const r = stream(p.profile.seed, 'telemetry', day);
  const get = (id: string) => dayRecords.find((x) => x.signalId === id && x.quality.flags.length === 0)?.value;

  const worn = dayRecords.some((x) => x.signalId === 'hr.resting');
  const rhr = get('hr.resting') ?? b.restingHr;
  const resp0 = get('resp.rate') ?? b.resp;
  const spo2N = get('spo2.nightly') ?? b.spo2;
  const skin = get('temp.skin') ?? b.skinTemp;
  const sleepH = get('sleep.duration') ?? b.sleepH;
  const resist = get('exercise.resistance') ?? 0;
  const aerobic = get('exercise.aerobic') ?? 0;

  // Day plan (station time): sleep ends 06:30, began sleepH earlier the previous evening; it starts again 22:30.
  const wake = 6.5 * 60;
  const sleepStartPrev = wake - sleepH * 60;
  const bed = 22.5 * 60;
  const resistStart = 9.5 * 60;
  const aerobicStart = 16 * 60;

  const phase: TelemetryDay['phase'] = [];
  const hr: (number | null)[] = [];
  const resp: (number | null)[] = [];
  const spo2: (number | null)[] = [];
  const skinTemp: (number | null)[] = [];

  // Sensor gaps within a worn day (more for noisy profiles).
  const gapChance = p.noise > 1 ? 0.012 : 0.002;
  let gap = 0;
  let hrAr = 0;
  let rrAr = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const m = i * TELEMETRY_STEP_MIN;
    const asleep = m < wake || m >= bed || (sleepStartPrev < 0 && m >= 24 * 60 + sleepStartPrev);
    const inResist = resist > 0 && m >= resistStart && m < resistStart + resist;
    const inAerobic = aerobic > 0 && m >= aerobicStart && m < aerobicStart + aerobic;
    const ph = asleep ? 'sleep' : inResist || inAerobic ? 'exercise' : 'work';
    phase.push(ph);

    hrAr = 0.85 * hrAr + r.normal() * 1.6 * p.noise;
    rrAr = 0.8 * rrAr + r.normal() * 0.5;
    if (gap > 0) gap--;
    else if (r.chance(gapChance)) gap = r.int(5, 40);

    if (!worn || gap > 0) {
      hr.push(null);
      resp.push(null);
      spo2.push(null);
      skinTemp.push(null);
      continue;
    }
    const circadian = Math.sin(((m - 15 * 60) / (24 * 60)) * 2 * Math.PI); // peak mid-afternoon
    let h: number;
    let rr: number;
    if (ph === 'sleep') {
      h = rhr * 0.97 + hrAr * 0.6;
      rr = resp0 - 1.5 + rrAr;
    } else if (ph === 'exercise') {
      const intensity = inAerobic ? 0.62 : 0.45;
      h = rhr + (190 - rhr) * intensity + hrAr * 1.5;
      rr = resp0 + (inAerobic ? 13 : 8) + rrAr * 1.5;
    } else {
      h = rhr + 16 + 4 * circadian + hrAr;
      rr = resp0 + 1 + rrAr;
    }
    hr.push(Math.round(h));
    resp.push(Math.round(rr * 10) / 10);
    spo2.push(Math.min(100, Math.round((ph === 'sleep' ? spo2N : spo2N + 0.4) + r.normal() * 0.4)));
    skinTemp.push(Math.round((skin + (ph === 'sleep' ? 0.5 : 0) + (ph === 'exercise' ? -0.3 : 0) + 0.15 * circadian + r.normal() * 0.05) * 100) / 100);
  }

  return { astronautId, day, stepMinutes: TELEMETRY_STEP_MIN, phase, hr, resp, spo2, skinTemp, playback: true };
}
