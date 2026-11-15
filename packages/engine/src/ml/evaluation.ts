import type { HealthRecord, SignalDefinition } from '@orbital/contracts';
import { DEFAULT_CONFIG } from '../config';
import { evaluate } from '../evaluate';
import { computeBaseline, rejectReason, toDailySeries } from '../stats';
import { TREND_SIGNALS, trendFinding } from '../intelligence/trend';
import { alarmDays, extractDailyFeatures, scoreDays, ML_SETTINGS, type TrainedModel } from './model';

/**
 * Offline evaluation of the statistical detectors and the Isolation Forest on HELD-OUT synthetic missions
 * with known ground-truth onset days (docs/phase-4-ml-evaluation.md). Pure: callers supply the missions.
 */

export interface EvalMission {
  label: string;
  scenario: string;
  /** Ground-truth forcing onset (null = none). */
  onsetDay: number | null;
  records: readonly HealthRecord[];
}

export interface DetectorTrace {
  /** Days (≥ first evaluable day) on which the detector is "on". */
  onDays: number[];
}

export interface MissionResult {
  label: string;
  scenario: string;
  onsetDay: number | null;
  evaluableDays: number;
  scnd: DetectorTrace & { insufficientDays: number };
  ml: DetectorTrace & { withheldDays: number };
  trend: DetectorTrace;
}

const FIRST = ML_SETTINGS.firstScoredDay + DEFAULT_CONFIG.window.persistenceDays - 1; // first day SCND can decide (44)

export function runMission(m: EvalMission, model: TrainedModel, signals: readonly SignalDefinition[], step = 1): MissionResult {
  const scndOn: number[] = [];
  let insufficient = 0;
  for (let d = FIRST; d < 180; d += step) {
    const a = evaluate({ records: m.records, signals, asOfDay: d, safety: [] });
    if (a.state === 'YES') scndOn.push(d);
    if (a.state === 'INSUFFICIENT_DATA') insufficient++;
  }
  const scores = scoreDays(model, extractDailyFeatures(m.records, signals));
  const alarms = alarmDays(model, scores);
  const mlOn: number[] = [];
  let withheld = 0;
  for (let d = FIRST; d < 180; d += step) {
    if (alarms[d]) mlOn.push(d);
    if (scores[d] === null) withheld++;
  }
  // Physical trend detector: any adverse significant trend among TREND_SIGNALS.
  const trendOn: number[] = [];
  const prepared = TREND_SIGNALS.map((id) => {
    const def = signals.find((s) => s.id === id)!;
    const series = toDailySeries(def, m.records.filter((r) => r.signalId === id && rejectReason(r, def, DEFAULT_CONFIG.quality) === null));
    const b = computeBaseline(series, DEFAULT_CONFIG.baseline.startDay, DEFAULT_CONFIG.baseline.endDay);
    return b && b.n >= def.baseline.minObservations ? { series, b } : null;
  });
  for (let d = FIRST; d < 180; d += step) {
    if (prepared.some((p) => p && trendFinding({ signal: p.series.signal, points: p.series.points.filter((x) => x.day <= d) }, p.b, d))) trendOn.push(d);
  }
  return {
    label: m.label,
    scenario: m.scenario,
    onsetDay: m.onsetDay,
    evaluableDays: Math.ceil((180 - FIRST) / step),
    scnd: { onDays: scndOn, insufficientDays: insufficient },
    ml: { onDays: mlOn, withheldDays: withheld },
    trend: { onDays: trendOn },
  };
}

export interface GroupMetrics {
  scenario: string;
  members: number;
  /** Fraction of "negative" days (healthy members, or before onset) on which the detector was on. */
  dailyFalsePositiveRate: { scnd: number; ml: number; trend: number };
  /** Members with ≥1 detector-on day while negative. */
  membersWithFalseAlarm: { scnd: number; ml: number; trend: number };
  /** For forced scenarios: members detected after onset, and median/min/max delay (days). */
  detection: Record<'scnd' | 'ml' | 'trend', { detected: number; medianDelay: number | null; minDelay: number | null; maxDelay: number | null }>;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function summarise(results: readonly MissionResult[]): GroupMetrics[] {
  const groups = new Map<string, MissionResult[]>();
  for (const r of results) groups.set(r.scenario, [...(groups.get(r.scenario) ?? []), r]);
  const out: GroupMetrics[] = [];
  for (const [scenario, rs] of groups) {
    const keys = ['scnd', 'ml', 'trend'] as const;
    const fpr = {} as GroupMetrics['dailyFalsePositiveRate'];
    const fam = {} as GroupMetrics['membersWithFalseAlarm'];
    const det = {} as GroupMetrics['detection'];
    for (const k of keys) {
      let negDays = 0;
      let fpDays = 0;
      let members = 0;
      const delays: number[] = [];
      for (const r of rs) {
        const onset = r.onsetDay ?? Infinity;
        const neg = (d: number) => d < onset;
        const total = Array.from({ length: 180 - FIRST }, (_, i) => FIRST + i).filter(neg).length;
        const fps = r[k].onDays.filter(neg).length;
        negDays += total;
        fpDays += fps;
        if (fps > 0) members++;
        if (r.onsetDay !== null) {
          const first = r[k].onDays.find((d) => d >= r.onsetDay!);
          if (first !== undefined) delays.push(first - r.onsetDay);
        }
      }
      fpr[k] = negDays ? fpDays / negDays : 0;
      fam[k] = members;
      det[k] = { detected: delays.length, medianDelay: median(delays), minDelay: delays.length ? Math.min(...delays) : null, maxDelay: delays.length ? Math.max(...delays) : null };
    }
    out.push({ scenario, members: rs.length, dailyFalsePositiveRate: fpr, membersWithFalseAlarm: fam, detection: det });
  }
  return out;
}

/**
 * Forecast evaluation (investigation only — not shown in the app): does a Theil–Sen linear projection of
 * the last 4 weeks predict the 7-day-ahead weekly mean better than "no change" (persistence)?
 */
export function forecastEvaluation(missions: readonly EvalMission[], signals: readonly SignalDefinition[], signalId: string): { n: number; maeTrend: number; maeNaive: number; coverage80: number } {
  const def = signals.find((s) => s.id === signalId)!;
  let n = 0;
  let eT = 0;
  let eN = 0;
  let covered = 0;
  for (const m of missions) {
    const series = toDailySeries(def, m.records.filter((r) => r.signalId === signalId && rejectReason(r, def, DEFAULT_CONFIG.quality) === null));
    const wk = (end: number) => {
      const v = series.points.filter((p) => p.day > end - 7 && p.day <= end).map((p) => p.value);
      return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
    };
    for (let d = 66; d + 7 < 180; d += 7) {
      const hist = [d - 21, d - 14, d - 7, d].map(wk);
      const target = wk(d + 7);
      if (hist.some((h) => h === null) || target === null) continue;
      const pts = hist.map((y, i) => ({ x: i, y: y! }));
      // Theil–Sen on 4 points.
      const slopes: number[] = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) slopes.push((pts[j]!.y - pts[i]!.y) / (j - i));
      slopes.sort((a, b) => a - b);
      const slope = (slopes[2]! + slopes[3]!) / 2;
      const resid = pts.map((p) => p.y - (pts[3]!.y + slope * (p.x - 3)));
      const spread = Math.sqrt(resid.reduce((a, r) => a + r * r, 0) / 2) || 1e-9;
      const pred = pts[3]!.y + slope;
      eT += Math.abs(pred - target);
      eN += Math.abs(pts[3]!.y - target);
      if (Math.abs(pred - target) <= 1.2816 * spread * Math.sqrt(1 + 1 / 4)) covered++;
      n++;
    }
  }
  return { n, maeTrend: n ? eT / n : NaN, maeNaive: n ? eN / n : NaN, coverage80: n ? covered / n : NaN };
}
