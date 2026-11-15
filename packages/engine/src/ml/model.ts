import type { Advisory, HealthRecord, MlAdvisor, MlAdvisoryBlock, SignalDefinition } from '@orbital/contracts';
import { DEFAULT_CONFIG } from '../config';
import { computeBaseline, hashJson, rejectReason, toDailySeries } from '../stats';
import { anomalyScore, trainForest, type ForestOptions, type IsolationForest } from './isolation-forest';

/**
 * Isolation Forest advisory model (Phase 4). docs/phase-4-ml-evaluation.md documents features,
 * training, evaluation and limitations.
 *
 * What it is: a multivariate ANOMALY detector. For a given day it scores how unusual the astronaut's
 * personal-baseline-standardised measurements are compared with a healthy synthetic training cohort.
 * What it is not: a predictor of depression, of any disorder, or of future disease.
 */

/** Feature set: the daily wellbeing, cognition, sleep and autonomic/activity signals. */
export const ML_FEATURES = [
  'sleep.duration',
  'sleep.efficiency',
  'sleep.quality',
  'fatigue.vas',
  'mood.vas',
  'stress.vas',
  'isolation.vas',
  'motivation.vas',
  'cog.rt.median',
  'cog.rt.lapses',
  'cog.memory.accuracy',
  'cog.concentration',
  'hr.resting',
  'hrv.rmssd',
  'activity.active-minutes',
] as const;

export const ML_SETTINGS = {
  /** Trailing smoothing window for each feature (days, inclusive of today). */
  smoothingDays: 3,
  /** z-scores are clipped to ±zClip so a single gross error cannot dominate. */
  zClip: 6,
  /** Score is withheld when fewer than this fraction of features are present. */
  minPresent: 0.6,
  /** Alarm = score above threshold on ≥ minDays of the last window days (scored days only). */
  persistence: { window: 5, minDays: 3 },
  /** Threshold = this quantile of training-cohort scores (target daily false-positive rate ≈ 1 %). */
  thresholdQuantile: 0.99,
  firstScoredDay: DEFAULT_CONFIG.baseline.endDay + 1,
  forest: { trees: 100, sampleSize: 256, seed: 20_261_115 } satisfies ForestOptions,
} as const;

/** Per-day feature vectors. NaN = missing. Index = mission day (null before scoring begins). */
export type DailyFeatures = (number[] | null)[];

/**
 * Extract personal-baseline z features for every day of one person's records.
 * Leakage control: the baseline uses days 10–37 only; the vector for day d uses data from days ≤ d only.
 */
export function extractDailyFeatures(records: readonly HealthRecord[], signals: readonly SignalDefinition[], lastDay = 179): DailyFeatures {
  const cfg = DEFAULT_CONFIG;
  const perSignal = ML_FEATURES.map((id) => {
    const def = signals.find((s) => s.id === id);
    if (!def) return null;
    const reliable = records.filter((r) => r.signalId === id && r.missionDay <= lastDay && rejectReason(r, def, cfg.quality) === null);
    const series = toDailySeries(def, reliable);
    const b = computeBaseline(series, cfg.baseline.startDay, cfg.baseline.endDay);
    if (!b || b.n < def.baseline.minObservations) return null;
    const byDay = new Map(series.points.map((p) => [p.day, p.value]));
    return { b, byDay };
  });
  const out: DailyFeatures = [];
  for (let d = 0; d <= lastDay; d++) {
    if (d < ML_SETTINGS.firstScoredDay) {
      out.push(null);
      continue;
    }
    out.push(
      perSignal.map((s) => {
        if (!s) return NaN;
        const vals: number[] = [];
        for (let k = d - ML_SETTINGS.smoothingDays + 1; k <= d; k++) {
          const v = s.byDay.get(k);
          if (v !== undefined) vals.push(v);
        }
        if (!vals.length) return NaN;
        const m = vals.reduce((a, v) => a + v, 0) / vals.length;
        const z = (m - s.b.mean) / s.b.sd;
        return Math.max(-ML_SETTINGS.zClip, Math.min(ML_SETTINGS.zClip, z));
      }),
    );
  }
  return out;
}

export const presentFraction = (v: readonly number[]) => v.filter((x) => !Number.isNaN(x)).length / v.length;
/** Missing-value encoding: a missing feature is imputed as 0 (= at personal baseline). This is conservative —
 * it can only make a day look *less* anomalous — and days with too many missing features are not scored. */
export const encode = (v: readonly number[]) => v.map((x) => (Number.isNaN(x) ? 0 : x));

export interface TrainedModel {
  id: string;
  forest: IsolationForest;
  threshold: number;
  featureIds: readonly string[];
  training: { members: number; rows: number; seeds: number[]; quantile: number; scoreMedian: number };
  hash: string;
}

function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Train on a healthy cohort. Each mission contributes its days ≥ firstScoredDay with enough features present. */
export function trainModel(missions: readonly { seed: number; records: readonly HealthRecord[] }[], signals: readonly SignalDefinition[]): TrainedModel {
  const rows: number[][] = [];
  for (const m of missions) {
    for (const v of extractDailyFeatures(m.records, signals)) if (v && presentFraction(v) >= ML_SETTINGS.minPresent) rows.push(encode(v));
  }
  const forest = trainForest(rows, ML_SETTINGS.forest);
  const scores = rows.map((r) => anomalyScore(forest, r)).sort((a, b) => a - b);
  const threshold = quantile(scores, ML_SETTINGS.thresholdQuantile);
  const hash = hashJson({ forest, threshold, features: ML_FEATURES, settings: ML_SETTINGS });
  return {
    id: 'ml.isolation-forest',
    forest,
    threshold,
    featureIds: ML_FEATURES,
    training: { members: missions.length, rows: rows.length, seeds: missions.map((m) => m.seed), quantile: ML_SETTINGS.thresholdQuantile, scoreMedian: quantile(scores, 0.5) },
    hash,
  };
}

/** Score every day (null = not scored: before day 38 or too many missing features). */
export function scoreDays(model: TrainedModel, features: DailyFeatures): (number | null)[] {
  return features.map((v) => (v && presentFraction(v) >= ML_SETTINGS.minPresent ? anomalyScore(model.forest, encode(v)) : null));
}

/** Persistence rule applied to a score series: alarm on day d if ≥ minDays of the last `window` scored days exceed the threshold. */
export function alarmDays(model: TrainedModel, scores: readonly (number | null)[]): boolean[] {
  const { window, minDays } = ML_SETTINGS.persistence;
  return scores.map((_, d) => {
    let above = 0;
    for (let k = d - window + 1; k <= d; k++) if (k >= 0 && (scores[k] ?? -1) > model.threshold) above++;
    return above >= minDays;
  });
}

const NOTE =
  'Anomaly score from an Isolation Forest trained on a healthy SYNTHETIC cohort. It shows how unusual today’s measurements are relative to that cohort after personal-baseline standardisation. Advisory only: it cannot change the YES / NO / INSUFFICIENT DATA decision, it is not a diagnosis, and it does not predict future illness.';

/** Build the ML advisory block for one day. */
export function mlAdvisoryBlock(model: TrainedModel | null, features: DailyFeatures, asOfDay: number): MlAdvisoryBlock {
  if (!model) {
    return { status: 'unavailable', modelId: 'ml.isolation-forest', modelHash: '-', score: null, threshold: 0, daysAboveThreshold: 0, windowDays: ML_SETTINGS.persistence.window, topFeatures: [], featuresPresent: 0, note: 'The ML model is not loaded.' };
  }
  const slice = features.slice(0, asOfDay + 1);
  const scores = scoreDays(model, slice);
  const { window, minDays } = ML_SETTINGS.persistence;
  let above = 0;
  for (let k = asOfDay - window + 1; k <= asOfDay; k++) if (k >= 0 && (scores[k] ?? -1) > model.threshold) above++;
  const today = slice[asOfDay] ?? null;
  const score = scores[asOfDay] ?? null;
  const present = today ? presentFraction(today) : 0;
  const top = today
    ? today
        .map((z, i) => ({ signalId: model.featureIds[i]!, z }))
        .filter((f) => !Number.isNaN(f.z))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
        .slice(0, 3)
        .map((f) => ({ signalId: f.signalId, z: Math.round(f.z * 100) / 100 }))
    : [];
  return {
    status: score === null ? 'withheld' : above >= minDays ? 'alarm' : 'no-alarm',
    modelId: model.id,
    modelHash: model.hash,
    score: score === null ? null : Math.round(score * 1000) / 1000,
    threshold: Math.round(model.threshold * 1000) / 1000,
    daysAboveThreshold: above,
    windowDays: window,
    topFeatures: top,
    featuresPresent: Math.round(present * 100) / 100,
    note: score === null ? `Not scored today: ${today ? `only ${Math.round(present * 100)}% of features present (needs ${ML_SETTINGS.minPresent * 100}%)` : 'personal baseline period not complete'}. ${NOTE}` : NOTE,
  };
}

/**
 * P5 adapter: exposes the model through the engine's MlAdvisor interface. It receives a frozen snapshot
 * and returns advisories only — the type cannot express a state change.
 */
export function isolationForestAdvisor(model: TrainedModel, features: DailyFeatures): MlAdvisor {
  return {
    id: model.id,
    advise(snapshot): Advisory[] {
      const block = mlAdvisoryBlock(model, features, snapshot.window.endDay);
      if (block.status === 'withheld' || block.status === 'unavailable') return [];
      return [
        {
          source: model.id,
          text:
            block.status === 'alarm'
              ? `Multivariate anomaly: score above the training threshold on ${block.daysAboveThreshold} of the last ${block.windowDays} days. Advisory only.`
              : 'No multivariate anomaly in the last few days. Advisory only.',
          score: block.score ?? undefined,
          features: block.topFeatures.map((f) => f.signalId),
        },
      ];
    },
  };
}
