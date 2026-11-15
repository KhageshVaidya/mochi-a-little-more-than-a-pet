import type { Baseline, DailySeries, HealthRecord, SignalDefinition } from '@orbital/contracts';

/** Pure statistical helpers shared by the engine and by main-process read models. */

export function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function sd(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs: readonly number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mad(xs: readonly number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

export interface QualityRules {
  minQuality: number;
  rejectFlags: readonly string[];
}

export type Rejection = 'implausible' | 'unit-mismatch' | 'low-quality' | 'flagged' | 'duplicate';

/** P1 data-quality check for one record. Returns null when the record is reliable. */
export function rejectReason(r: HealthRecord, def: SignalDefinition, q: QualityRules): Rejection | null {
  if (r.unit !== def.unit) return 'unit-mismatch';
  if (!Number.isFinite(r.value) || r.value < def.plausibleRange[0] || r.value > def.plausibleRange[1]) return 'implausible';
  if (r.quality.flags.some((f) => q.rejectFlags.includes(f))) return 'flagged';
  if (r.quality.score < q.minQuality) return 'low-quality';
  return null;
}

/** One reliable value per mission day (mean if several). Missing days stay missing — never imputed. */
export function toDailySeries(def: SignalDefinition, records: readonly HealthRecord[]): DailySeries {
  const byDay = new Map<number, number[]>();
  for (const r of records) {
    const arr = byDay.get(r.missionDay) ?? [];
    arr.push(r.value);
    byDay.set(r.missionDay, arr);
  }
  const points = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, vs]) => ({ day, value: mean(vs) }));
  return { signal: def, points };
}

/**
 * Personal baseline over [startDay, endDay]. SD uses the larger of sample SD and robust MAD×1.4826,
 * floored at a resolution-aware minimum so integer self-report scales don't produce tiny SDs.
 */
export function computeBaseline(series: DailySeries, startDay: number, endDay: number): Baseline | null {
  const vals = series.points.filter((p) => p.day >= startDay && p.day <= endDay).map((p) => p.value);
  if (vals.length < 2) return null;
  const m = mean(vals);
  const floor = Math.max(1e-6, 0.02 * Math.abs(m), series.signal.unit === '{score}' ? 0.5 : 0);
  const s = Math.max(sd(vals), 1.4826 * mad(vals), floor);
  return { signalId: series.signal.id, n: vals.length, mean: m, sd: s, median: median(vals), mad: mad(vals), startDay, endDay };
}

/** Adverse-direction standardised deviation: positive = change in the adverse direction. */
export function adverseZ(value: number, b: Baseline, dir: SignalDefinition['adverseDirection']): number {
  const z = (value - b.mean) / b.sd;
  if (dir === 'up') return z;
  if (dir === 'down') return -z;
  return Math.abs(z);
}

/** FNV-1a hex hash of a JSON-serialisable value (for reproducibility traces). */
export function hashJson(value: unknown): string {
  const s = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
