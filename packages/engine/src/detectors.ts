import type { Baseline, Contributor, DailySeries, Detector } from '@orbital/contracts';
import { adverseZ } from './stats';
import type { EngineConfig } from './config';

/**
 * P3 statistical detectors. Each is a plug-in implementing the contract `Detector` interface.
 * New detectors can be registered without modifying the engine.
 *
 * All operate on the ADVERSE-direction z series after the baseline window, up to `asOfDay`.
 */

export interface DetectorCfg {
  asOfDay: number;
  cfg: EngineConfig;
}

function adverseSeries(series: DailySeries, b: Baseline, asOfDay: number) {
  return series.points
    .filter((p) => p.day > b.endDay && p.day <= asOfDay)
    .map((p) => ({ day: p.day, z: adverseZ(p.value, b, series.signal.adverseDirection) }));
}

const dirOf = (series: DailySeries, b: Baseline, recentMean: number): 'up' | 'down' =>
  series.signal.adverseDirection === 'both' ? (recentMean >= b.mean ? 'up' : 'down') : series.signal.adverseDirection;

/** Mean adverse z over the persistence window (last 7 days). */
export const zScoreDetector: Detector<DetectorCfg> = {
  id: 'z-score',
  appliesTo: () => true,
  run(series, b, { asOfDay, cfg }) {
    const from = asOfDay - cfg.window.persistenceDays + 1;
    const recent = series.points.filter((p) => p.day >= from && p.day <= asOfDay);
    if (recent.length === 0) return [];
    const m = recent.reduce((a, p) => a + p.value, 0) / recent.length;
    const z = adverseZ(m, b, series.signal.adverseDirection);
    return [{ signalId: series.signal.id, domain: series.signal.domain, method: 'z-score', statistic: z, threshold: cfg.detectors.zWatch, direction: dirOf(series, b, m) }];
  },
};

/** Count of days in the last 7 with adverse z ≥ watch level (requires ≥5 observed days). */
export const persistenceDetector: Detector<DetectorCfg> = {
  id: 'persistence',
  appliesTo: () => true,
  run(series, b, { asOfDay, cfg }) {
    const from = asOfDay - cfg.window.persistenceDays + 1;
    const zs = adverseSeries(series, b, asOfDay).filter((p) => p.day >= from);
    if (zs.length < cfg.detectors.persistenceMin) return [];
    const days = zs.filter((p) => p.z >= cfg.detectors.zWatch).length;
    const m = series.points.filter((p) => p.day >= from && p.day <= asOfDay);
    const mv = m.reduce((a, p) => a + p.value, 0) / m.length;
    return [{ signalId: series.signal.id, domain: series.signal.domain, method: 'persistence', statistic: days, threshold: cfg.detectors.persistenceMin, direction: dirOf(series, b, mv), persistenceDays: days }];
  },
};

/** EWMA control chart on the adverse z series (Roberts 1959). */
export const ewmaDetector: Detector<DetectorCfg> = {
  id: 'ewma',
  appliesTo: () => true,
  run(series, b, { asOfDay, cfg }) {
    const zs = adverseSeries(series, b, asOfDay);
    if (zs.length === 0) return [];
    const { lambda, L } = cfg.detectors.ewma;
    let e = 0;
    for (const p of zs) e = lambda * p.z + (1 - lambda) * e;
    const limit = L * Math.sqrt(lambda / (2 - lambda));
    const last = series.points.filter((p) => p.day <= asOfDay).slice(-7);
    const mv = last.reduce((a, p) => a + p.value, 0) / Math.max(1, last.length);
    return [{ signalId: series.signal.id, domain: series.signal.domain, method: 'ewma', statistic: e, threshold: limit, direction: dirOf(series, b, mv) }];
  },
};

/** One-sided tabular CUSUM in the adverse direction (Page 1954), with change-point (onset) estimate. */
export const cusumDetector: Detector<DetectorCfg> = {
  id: 'cusum',
  appliesTo: () => true,
  run(series, b, { asOfDay, cfg }) {
    const zs = adverseSeries(series, b, asOfDay);
    if (zs.length === 0) return [];
    const { k, h } = cfg.detectors.cusum;
    let s = 0;
    let lastZeroDay = b.endDay;
    for (const p of zs) {
      s = Math.max(0, s + p.z - k);
      if (s === 0) lastZeroDay = p.day;
    }
    const last = series.points.filter((p) => p.day <= asOfDay).slice(-7);
    const mv = last.reduce((a, p) => a + p.value, 0) / Math.max(1, last.length);
    const out: Contributor[] = [
      { signalId: series.signal.id, domain: series.signal.domain, method: 'cusum', statistic: s, threshold: h, direction: dirOf(series, b, mv) },
    ];
    if (s >= h) {
      out.push({ signalId: series.signal.id, domain: series.signal.domain, method: 'change-point', statistic: lastZeroDay + 1, threshold: 0, direction: dirOf(series, b, mv), sinceDay: lastZeroDay + 1 });
    }
    return out;
  },
};

export const DEFAULT_DETECTORS: readonly Detector<DetectorCfg>[] = [zScoreDetector, persistenceDetector, ewmaDetector, cusumDetector];
