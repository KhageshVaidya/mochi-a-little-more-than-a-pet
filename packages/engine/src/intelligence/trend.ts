import type { Baseline, DailySeries, StatisticalFinding } from '@orbital/contracts';

/**
 * Longitudinal trend detection for slowly changing PHYSICAL signals (Phase 4).
 *
 * Why this method: physical deconditioning in the synthetic mission is a slow ramp over ~110 days and
 * some signals are weekly. EWMA/CUSUM on daily z are tuned for step-like shifts in daily signals; a
 * rank-based monotonic trend test is the better fit:
 *   - Mann–Kendall test (Mann 1945; Kendall 1975) on WEEKLY MEANS — aggregating to weeks reduces the
 *     serial correlation that inflates MK significance on daily data;
 *   - Theil–Sen slope (Theil 1950; Sen 1968) as a robust magnitude estimate.
 * A finding requires statistical significance AND practical magnitude (change over the window ≥ 1
 * personal-baseline SD) in the adverse direction. These are engineering defaults, not clinical thresholds.
 */

export const TREND_SIGNALS = ['exercise.performance', 'hr.resting', 'activity.active-minutes', 'exercise.resistance', 'exercise.aerobic'] as const;

export const TREND_SETTINGS = { windowWeeks: 9, minWeeks: 6, alpha: 0.01, minChangeSd: 1 } as const;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Mann–Kendall S, variance (tie-corrected), z and two-sided p. */
export function mannKendall(xs: readonly number[]): { s: number; z: number; p: number } {
  const n = xs.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(xs[j]! - xs[i]!);
  const ties = new Map<number, number>();
  for (const x of xs) ties.set(x, (ties.get(x) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance > 0 ? (s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0) : 0;
  return { s, z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

/** Theil–Sen slope: median of pairwise slopes. */
export function theilSen(points: readonly { x: number; y: number }[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 1; j < points.length; j++) if (points[j]!.x !== points[i]!.x) slopes.push((points[j]!.y - points[i]!.y) / (points[j]!.x - points[i]!.x));
  slopes.sort((a, b) => a - b);
  if (!slopes.length) return 0;
  const m = slopes.length >> 1;
  return slopes.length % 2 ? slopes[m]! : (slopes[m - 1]! + slopes[m]!) / 2;
}

/** Weekly means over the trend window ending at asOfDay (only post-baseline days). */
export function weeklyMeans(series: DailySeries, asOfDay: number, baselineEnd: number): { week: number; mean: number }[] {
  const out: { week: number; mean: number }[] = [];
  for (let w = 0; w < TREND_SETTINGS.windowWeeks; w++) {
    const end = asOfDay - (TREND_SETTINGS.windowWeeks - 1 - w) * 7;
    const start = end - 6;
    if (start <= baselineEnd) continue;
    const vals = series.points.filter((p) => p.day >= start && p.day <= end).map((p) => p.value);
    if (vals.length) out.push({ week: w, mean: vals.reduce((a, v) => a + v, 0) / vals.length });
  }
  return out;
}

export function trendFinding(series: DailySeries, b: Baseline, asOfDay: number): StatisticalFinding | null {
  const weeks = weeklyMeans(series, asOfDay, b.endDay);
  if (weeks.length < TREND_SETTINGS.minWeeks) return null;
  const { z, p } = mannKendall(weeks.map((w) => w.mean));
  const slope = theilSen(weeks.map((w) => ({ x: w.week, y: w.mean })));
  const change = slope * (weeks.at(-1)!.week - weeks[0]!.week);
  const dir: 'up' | 'down' = slope >= 0 ? 'up' : 'down';
  const adverseDir = series.signal.adverseDirection;
  const adverse = adverseDir === 'both' || adverseDir === dir;
  const changeSd = Math.abs(change) / b.sd;
  if (!(p < TREND_SETTINGS.alpha && changeSd >= TREND_SETTINGS.minChangeSd && adverse)) return null;
  const recentMean = weeks.at(-1)!.mean;
  return {
    id: `trend:${series.signal.id}:${asOfDay}`,
    kind: 'longitudinal-trend',
    domain: series.signal.domain,
    signalId: series.signal.id,
    method: 'Mann–Kendall + Theil–Sen (weekly means)',
    window: { startDay: asOfDay - TREND_SETTINGS.windowWeeks * 7 + 1, endDay: asOfDay },
    baseline: { mean: b.mean, sd: b.sd, n: b.n, startDay: b.startDay, endDay: b.endDay },
    recent: { mean: recentMean, z: (recentMean - b.mean) / b.sd },
    statistic: z,
    threshold: TREND_SETTINGS.alpha,
    direction: dir,
    adverse,
    slopePerWeek: slope,
    pValue: p,
  };
}
