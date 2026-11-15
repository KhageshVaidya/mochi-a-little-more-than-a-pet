import { describe, expect, it } from 'vitest';
import { HealthRecord } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { CREW, CREW_IDS, MISSION_DAYS, generateMission, generateTelemetry, hashSeed } from '../src';

const all = Object.fromEntries(CREW_IDS.map((id) => [id, generateMission(id)]));

function pearson(a: number[], b: number[]) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

describe('synthetic mission generator', () => {
  it('is fully deterministic', () => {
    for (const id of CREW_IDS) expect(generateMission(id)).toEqual(all[id]);
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
  });

  it('every record satisfies the contract, is SYNTHETIC, and uses the registry unit', () => {
    for (const id of CREW_IDS) {
      for (const r of all[id]!.records) {
        const parsed = HealthRecord.safeParse(r);
        expect(parsed.success, JSON.stringify(r)).toBe(true);
        expect(r.source.kind).toBe('synthetic');
        expect(r.source.scenarioId).toBe(CREW[id].profile.scenario);
        expect(r.subjectId).toBe(id);
        const def = getSignal(r.signalId)!;
        expect(def, r.signalId).toBeDefined();
        expect(r.unit).toBe(def.unit);
        expect(def.allowedClassifications).toContain(r.classification);
        expect(r.missionDay).toBeGreaterThanOrEqual(0);
        expect(r.missionDay).toBeLessThan(MISSION_DAYS);
      }
    }
  });

  it('only the incomplete-telemetry profile contains physically implausible values', () => {
    for (const id of CREW_IDS) {
      const bad = all[id]!.records.filter((r) => {
        const [lo, hi] = getSignal(r.signalId)!.plausibleRange;
        return r.value < lo || r.value > hi;
      });
      if (id === 'CM-05') expect(bad.length).toBeGreaterThan(0);
      else expect(bad).toEqual([]);
    }
  });

  it('record ids are unique', () => {
    for (const id of CREW_IDS) {
      const ids = all[id]!.records.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('profiles have distinct personal baselines', () => {
    const rhr = CREW_IDS.map((id) => CREW[id].baselines.restingHr);
    const hrv = CREW_IDS.map((id) => CREW[id].baselines.hrv);
    expect(new Set(rhr).size).toBe(5);
    expect(new Set(hrv).size).toBe(5);
  });

  it('missingness differs as designed: CM-05 has far fewer records', () => {
    const n = (id: string) => all[id]!.records.length;
    for (const id of ['CM-01', 'CM-02', 'CM-03', 'CM-04']) expect(n('CM-05')).toBeLessThan(n(id) * 0.7);
    expect(all['CM-05']!.records.filter((r) => r.quality.flags.length > 0).length).toBeGreaterThan(30);
  });

  it('latent correlations are physiologically coherent (true values)', () => {
    const t = all['CM-02']!.truth;
    const debt = t.map((d) => d.sleepDebt);
    expect(pearson(debt, t.map((d) => d.values['fatigue.vas']!))).toBeGreaterThan(0.5);
    expect(pearson(debt, t.map((d) => d.values['cog.rt.median']!))).toBeGreaterThan(0.5);
    expect(pearson(debt, t.map((d) => d.values['hrv.rmssd']!))).toBeLessThan(-0.4);
    const s = all['CM-04']!.truth;
    expect(pearson(s.map((d) => d.values['mood.vas']!), s.map((d) => d.values['stress.vas']!))).toBeLessThan(-0.6);
  });

  it('body composition is internally consistent (fat-free + fat ≈ mass; segments < fat-free mass)', () => {
    for (const id of CREW_IDS) {
      for (const d of all[id]!.truth) {
        const v = d.values;
        const segs = ['arm-left', 'arm-right', 'trunk', 'leg-left', 'leg-right'].reduce((a, s) => a + v[`body.segment.${s}`]!, 0);
        expect(Math.abs(v['body.lean-mass']! + v['body.fat-mass']! - v['body.mass']!)).toBeLessThan(1.2);
        expect(segs).toBeLessThan(v['body.lean-mass']!);
        expect(v['body.skeletal-muscle']!).toBeLessThan(v['body.muscle-mass']!);
      }
    }
  });

  it('deconditioning reduces leg lean mass more than arm lean mass', () => {
    const t = all['CM-03']!.truth;
    const legLoss = 1 - t[179]!.values['body.segment.leg-left']! / t[0]!.values['body.segment.leg-left']!;
    const armLoss = 1 - t[179]!.values['body.segment.arm-left']! / t[0]!.values['body.segment.arm-left']!;
    expect(legLoss).toBeGreaterThan(armLoss * 2);
  });

  it('telemetry playback is deterministic, anchored to daily records, and gapped when not worn', () => {
    const day = 91; // day 90 is a scheduled rest day (no exercise)
    const recs = all['CM-01']!.records.filter((r) => r.missionDay === day);
    const a = generateTelemetry('CM-01', day, recs);
    expect(generateTelemetry('CM-01', day, recs)).toEqual(a);
    expect(a.playback).toBe(true);
    expect(a.hr).toHaveLength(720);
    const sleepHr = a.hr.filter((h, i) => h !== null && a.phase[i] === 'sleep') as number[];
    const exHr = a.hr.filter((h, i) => h !== null && a.phase[i] === 'exercise') as number[];
    expect(Math.max(...exHr)).toBeGreaterThan(Math.max(...sleepHr));
    const unworn = generateTelemetry('CM-05', day, []);
    expect(unworn.hr.every((h) => h === null)).toBe(true);
  });
});
