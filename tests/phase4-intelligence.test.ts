import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApprovedOutputs, IntelligenceReport, type HealthRecord, type MlAdvisor } from '@orbital/contracts';
import { allSignals } from '@orbital/signals';
import {
  DEFAULT_CONFIG,
  ML_SETTINGS,
  anomalyScore,
  buildIntelligenceReport,
  cFactor,
  evaluate,
  extractDailyFeatures,
  forecastEvaluation,
  isolationForestAdvisor,
  mannKendall,
  mlAdvisoryBlock,
  mulberry32,
  runMission,
  scoreDays,
  summarise,
  theilSen,
  trainForest,
  trainModel,
  type TrainedModel,
} from '@orbital/engine';
import {
  CREW,
  CREW_IDS,
  EVALUATION_SEED_BASE,
  SCENARIO_TRUTH,
  TRAINING_SEED_BASE,
  evaluationCohortSpecs,
  generateMission,
  generateVirtualMission,
  trainingCohortSpecs,
} from '@orbital/simulation';

const signals = allSignals();
const training = trainingCohortSpecs();
const model: TrainedModel = trainModel(training.map((s) => ({ seed: s.seed, records: generateVirtualMission(s).records })), signals);
const crew = Object.fromEntries(CREW_IDS.map((id) => [id, generateMission(id).records])) as Record<string, HealthRecord[]>;

describe('Isolation Forest (implementation)', () => {
  it('c(n) matches the closed form used by Liu et al.', () => {
    expect(cFactor(1)).toBe(0);
    expect(cFactor(2)).toBe(1);
    expect(cFactor(256)).toBeCloseTo(10.24, 1);
  });

  it('is reproducible: same rows + seed ⇒ identical forest; a different seed ⇒ different forest', () => {
    const r = mulberry32(1);
    const rows = Array.from({ length: 300 }, () => [r(), r(), r()]);
    const a = trainForest(rows, { trees: 20, sampleSize: 64, seed: 7 });
    const b = trainForest(rows, { trees: 20, sampleSize: 64, seed: 7 });
    const c = trainForest(rows, { trees: 20, sampleSize: 64, seed: 8 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('isolates outliers: an extreme point scores higher than typical points', () => {
    const r = mulberry32(3);
    const gauss = () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
    const rows = Array.from({ length: 1000 }, () => [gauss(), gauss(), gauss(), gauss()]);
    const f = trainForest(rows, { trees: 100, sampleSize: 256, seed: 11 });
    expect(anomalyScore(f, [5, 5, -5, 5])).toBeGreaterThan(0.6);
    expect(anomalyScore(f, [0, 0, 0, 0])).toBeLessThan(0.5);
  });

  it('the default model is trained reproducibly (hash stable across retraining)', () => {
    const again = trainModel(training.map((s) => ({ seed: s.seed, records: generateVirtualMission(s).records })), signals);
    expect(again.hash).toBe(model.hash);
    expect(model.training.members).toBe(40);
    expect(model.threshold).toBeGreaterThan(0.45);
  });
});

describe('training / evaluation separation and leakage control', () => {
  it('training, evaluation and named-crew seeds are disjoint', () => {
    const t = new Set(training.map((s) => s.seed));
    const e = evaluationCohortSpecs().map((s) => s.seed);
    expect(e.some((s) => t.has(s))).toBe(false);
    expect(CREW_IDS.some((id) => t.has(CREW[id].profile.seed))).toBe(false);
    expect([...t].every((s) => s > TRAINING_SEED_BASE && s < EVALUATION_SEED_BASE)).toBe(true);
    expect(training.every((s) => s.scenario === 'healthy-adaptation')).toBe(true);
  });

  it('no temporal leakage: the feature vector for day d is identical when all later data are removed', () => {
    const recs = crew['CM-04']!;
    const full = extractDailyFeatures(recs, signals);
    for (const d of [60, 100, 140]) {
      const truncated = extractDailyFeatures(recs.filter((r) => r.missionDay <= d), signals, d);
      expect(truncated[d]).toEqual(full[d]);
    }
  });

  it('no score before the personal baseline period is complete', () => {
    const scores = scoreDays(model, extractDailyFeatures(crew['CM-01']!, signals));
    expect(scores.slice(0, ML_SETTINGS.firstScoredDay).every((s) => s === null)).toBe(true);
  });
});

describe('missing and noisy data', () => {
  it('days with too few features are withheld (never imputed into an alarm)', () => {
    const block = mlAdvisoryBlock(model, extractDailyFeatures(crew['CM-05']!, signals), 70);
    const sparse = crew['CM-01']!.filter((r) => !['mood.vas', 'stress.vas', 'isolation.vas', 'motivation.vas', 'fatigue.vas', 'sleep.quality', 'cog.concentration'].includes(r.signalId));
    const b2 = mlAdvisoryBlock(model, extractDailyFeatures(sparse, signals), 100);
    expect(b2.status).toBe('withheld');
    expect(b2.score).toBeNull();
    expect(['withheld', 'no-alarm']).toContain(block.status);
  });

  it('incomplete-telemetry profile: SCND says INSUFFICIENT and the ML raises no alarm', () => {
    const feats = extractDailyFeatures(crew['CM-05']!, signals);
    for (const d of [60, 100, 150]) {
      expect(evaluate({ records: crew['CM-05']!, signals, asOfDay: d, safety: [] }).state).toBe('INSUFFICIENT_DATA');
      expect(mlAdvisoryBlock(model, feats, d).status).not.toBe('alarm');
    }
  });

  it('a constant shift in one person’s baseline is absorbed by personal baselines (no alarm)', () => {
    const shifted = crew['CM-01']!.map((r) => (r.signalId === 'hr.resting' ? { ...r, value: r.value + 9 } : r));
    const feats = extractDailyFeatures(shifted, signals);
    expect([60, 120, 170].map((d) => mlAdvisoryBlock(model, feats, d).status)).toEqual(['no-alarm', 'no-alarm', 'no-alarm']);
    expect(evaluate({ records: shifted, signals, asOfDay: 170, safety: [] }).state).toBe('NO');
  });
});

describe('ML never overrides the deterministic decision', () => {
  it('a model that always alarms does not change state, reasons or contributors', () => {
    const shouty: MlAdvisor = { id: 'test.always-alarm', advise: () => [{ source: 'test', text: 'ALARM', score: 1 }] };
    for (const id of CREW_IDS) {
      for (const d of [50, 100, 150]) {
        const plain = evaluate({ records: crew[id]!, signals, asOfDay: d, safety: [] });
        const withMl = evaluate({ records: crew[id]!, signals, asOfDay: d, safety: [] }, DEFAULT_CONFIG, { advisors: [shouty, isolationForestAdvisor(model, extractDailyFeatures(crew[id]!, signals))] });
        expect(withMl.state).toBe(plain.state);
        expect(withMl.reasons).toEqual(plain.reasons);
        expect(withMl.contributors).toEqual(plain.contributors);
      }
    }
  });

  it('advisors receive a frozen snapshot (mutation throws)', () => {
    const sneaky: MlAdvisor = {
      id: 'test.sneaky',
      advise(snapshot) {
        (snapshot as { state: string }).state = 'YES';
        return [];
      },
    };
    expect(() => evaluate({ records: crew['CM-01']!, signals, asOfDay: 120, safety: [] }, DEFAULT_CONFIG, { advisors: [sneaky] })).toThrow();
  });

  it('approved outputs carry no ML data and are identical whatever the ML says', () => {
    const a = evaluate({ records: crew['CM-04']!, signals, asOfDay: 130, safety: [] });
    const feats = extractDailyFeatures(crew['CM-04']!, signals);
    const real = buildIntelligenceReport({ subjectId: 'CM-04', records: crew['CM-04']!, signals, asOfDay: 130 }, a, mlAdvisoryBlock(model, feats, 130));
    const fake = buildIntelligenceReport({ subjectId: 'CM-04', records: crew['CM-04']!, signals, asOfDay: 130 }, a, { ...real.ml, status: 'no-alarm', score: 0.1 });
    expect(real.approved).toEqual(fake.approved);
    expect(() => ApprovedOutputs.parse({ ...real.approved, ml: real.ml })).toThrow(); // strict: no extra keys
    expect(Object.keys(real.approved)).not.toContain('ml');
    expect(IntelligenceReport.parse(real)).toBeTruthy();
    expect(real.decision.state).toBe(a.state);
  });
});

describe('statistical methods', () => {
  it('Mann–Kendall and Theil–Sen behave on known series', () => {
    const up = mannKendall([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(up.s).toBe(28);
    expect(up.p).toBeLessThan(0.01);
    expect(mannKendall([3, 1, 4, 1, 5, 9, 2, 6]).p).toBeGreaterThan(0.05);
    expect(theilSen([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }, { x: 3, y: 7 }, { x: 4, y: 100 }])).toBe(2);
  });

  it('every report finding names its signals, method, window, baseline comparison and data quality', () => {
    for (const id of CREW_IDS) {
      for (const d of [100, 150]) {
        const a = evaluate({ records: crew[id]!, signals, asOfDay: d, safety: [] });
        const r = buildIntelligenceReport({ subjectId: id, records: crew[id]!, signals, asOfDay: d }, a, mlAdvisoryBlock(model, extractDailyFeatures(crew[id]!, signals), d));
        for (const f of r.statistical) {
          expect(f.signalId).toBeTruthy();
          expect(f.method.length).toBeGreaterThan(5);
          expect(f.window.endDay).toBe(d);
          expect(f.baseline).not.toBeNull();
        }
        expect(r.dataQuality.signals.length).toBeGreaterThan(10);
        expect(['low', 'moderate', 'high']).toContain(r.uncertainty.level);
      }
    }
  });

  it('physical deconditioning (CM-03) is detected as a longitudinal trend, not as a wellbeing YES', () => {
    const a = evaluate({ records: crew['CM-03']!, signals, asOfDay: 150, safety: [] });
    const r = buildIntelligenceReport({ subjectId: 'CM-03', records: crew['CM-03']!, signals, asOfDay: 150 }, a, mlAdvisoryBlock(model, extractDailyFeatures(crew['CM-03']!, signals), 150));
    expect(a.state).toBe('NO');
    expect(r.approved.physicalTrendSignals.length).toBeGreaterThan(0);
    expect(r.statistical.some((f) => f.kind === 'longitudinal-trend' && f.adverse)).toBe(true);
  });

  it('recovery after the CM-02 sleep intervention lowers the ML anomaly score', () => {
    const s = scoreDays(model, extractDailyFeatures(crew['CM-02']!, signals));
    const mean = (a: number, b: number) => {
      const v = s.slice(a, b).filter((x): x is number => x !== null);
      return v.reduce((x, y) => x + y, 0) / v.length;
    };
    expect(mean(160, 180)).toBeLessThan(mean(100, 120));
  });
});

describe('held-out evaluation (synthetic) — false positives and detection delay', () => {
  const evals = evaluationCohortSpecs().map((s) => ({ label: `V${s.seed}`, scenario: s.scenario, onsetDay: SCENARIO_TRUTH[s.scenario].onsetDay, records: generateVirtualMission(s).records }));
  const results = evals.map((m) => runMission(m, model, signals));
  const metrics = summarise(results);
  const g = (s: string) => metrics.find((m) => m.scenario === s)!;
  const crewResults = CREW_IDS.map((id) => runMission({ label: id, scenario: CREW[id].profile.scenario, onsetDay: SCENARIO_TRUTH[CREW[id].profile.scenario].onsetDay, records: crew[id]! }, model, signals));
  const forecasts = ['exercise.performance', 'hr.resting', 'sleep.duration'].map((id) => ({ id, ...forecastEvaluation(evals.filter((e) => e.scenario !== 'incomplete-telemetry'), signals, id) }));

  if (process.env['ORBITAL_WRITE_EVAL'] === '1') {
    writeFileSync(
      new URL('../docs/phase-4-ml-evaluation.results.json', import.meta.url),
      JSON.stringify({ generatedBy: 'tests/phase4-intelligence.test.ts (ORBITAL_WRITE_EVAL=1)', modelHash: model.hash, threshold: model.threshold, training: { ...model.training, seeds: `${model.training.seeds[0]}–${model.training.seeds.at(-1)}` }, cohort: metrics, crew: crewResults.map((c) => ({ label: c.label, scenario: c.scenario, onsetDay: c.onsetDay, scndFirst: c.scnd.onDays[0] ?? null, mlFirst: c.ml.onDays[0] ?? null, trendFirst: c.trend.onDays[0] ?? null, mlWithheldDays: c.ml.withheldDays, scndInsufficientDays: c.scnd.insufficientDays })), forecasts }, null, 2) + '\n',
    );
  }

  it('daily false-positive rates on held-out healthy astronauts stay low (≤ 2 %) for every detector', () => {
    const h = g('healthy-adaptation').dailyFalsePositiveRate;
    expect(h.scnd).toBeLessThanOrEqual(0.02);
    expect(h.ml).toBeLessThanOrEqual(0.02);
    expect(h.trend).toBeLessThanOrEqual(0.02);
  });

  it('wellbeing and sleep forcing are detected in every held-out member by both SCND and ML', () => {
    for (const s of ['sleep-disruption', 'psych-deterioration']) {
      expect(g(s).detection.scnd.detected).toBe(g(s).members);
      expect(g(s).detection.ml.detected).toBe(g(s).members);
    }
  });

  it('physical deconditioning is detected in every held-out member by the trend detector', () => {
    expect(g('physical-deterioration').detection.trend.detected).toBe(g('physical-deterioration').members);
  });

  it('incomplete telemetry produces no alarms from any detector', () => {
    const i = g('incomplete-telemetry');
    expect(i.membersWithFalseAlarm).toEqual({ scnd: 0, ml: 0, trend: 0 });
  });

  it('the named healthy crew member (CM-01) has no alarms from any detector', () => {
    const c = crewResults.find((r) => r.label === 'CM-01')!;
    expect([c.scnd.onDays.length, c.ml.onDays.length, c.trend.onDays.length]).toEqual([0, 0, 0]);
  });

  it('forecasting investigation: a trend projection does NOT beat "no change" (documented negative result)', () => {
    for (const f of forecasts) {
      expect(f.n).toBeGreaterThan(100);
      expect(f.maeTrend).toBeGreaterThanOrEqual(f.maeNaive);
    }
  });
});
