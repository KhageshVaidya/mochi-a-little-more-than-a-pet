import { describe, expect, it } from 'vitest';
import type { HealthRecord, MlAdvisor } from '@orbital/contracts';
import { allSignals } from '@orbital/signals';
import { generateMission } from '@orbital/simulation';
import { DEFAULT_CONFIG, cusumDetector, evaluate, ewmaDetector, computeBaseline, toDailySeries } from '../src';
import { getSignal } from '@orbital/signals';

const signals = allSignals();
const sofia = generateMission('CM-04').records;
const alex = generateMission('CM-01').records;

describe('engine determinism & structure', () => {
  it('identical input ⇒ identical output (including trace hashes)', () => {
    for (const d of [30, 90, 150]) {
      const a = evaluate({ records: sofia, signals, asOfDay: d, safety: [] });
      const b = evaluate({ records: [...sofia], signals, asOfDay: d, safety: [] });
      expect(b).toEqual(a);
    }
  });

  it('config changes change the config hash', () => {
    const a = evaluate({ records: alex, signals, asOfDay: 90, safety: [] });
    const b = evaluate({ records: alex, signals, asOfDay: 90, safety: [] }, { ...DEFAULT_CONFIG, sufficiency: { minCoverage: 0.8, requiredDomains: 5 } });
    expect(a.trace.configHash).not.toBe(b.trace.configHash);
  });

  it('returns a frozen assessment', () => {
    const a = evaluate({ records: alex, signals, asOfDay: 90, safety: [] });
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.reasons)).toBe(true);
  });
});

describe('precedence: ML can never change the deterministic state', () => {
  const adversary: MlAdvisor = {
    id: 'ml.adversary',
    advise(snapshot) {
      try {
        (snapshot as { state: string }).state = 'YES';
      } catch {
        /* frozen */
      }
      return [{ source: 'ml.adversary', text: 'Unusual combination of signals.', score: 0.97 }];
    },
  };
  it('a NO stays NO and an INSUFFICIENT stays INSUFFICIENT; advisories are attached', () => {
    const no = evaluate({ records: alex, signals, asOfDay: 120, safety: [] }, DEFAULT_CONFIG, { advisors: [adversary] });
    expect(no.state).toBe('NO');
    expect(no.advisories).toHaveLength(1);
    const insufficient = evaluate({ records: alex, signals, asOfDay: 20, safety: [] }, DEFAULT_CONFIG, { advisors: [adversary] });
    expect(insufficient.state).toBe('INSUFFICIENT_DATA');
  });
});

describe('P0 safety pathway', () => {
  it('escalates immediately, independent of data sufficiency, without changing the state semantics', () => {
    const a = evaluate({ records: alex, signals, asOfDay: 5, safety: [{ day: 5, trigger: 'talk-request', at: '2026-03-07T10:00:00.000Z' }] });
    expect(a.state).toBe('INSUFFICIENT_DATA');
    expect(a.escalation?.pathway).toBe('human-support');
    expect(a.suggestedAction).toBe('human-support-now');
    expect(a.reasons[0]!.tier).toBe('SAFETY');
  });
});

describe('P1 data quality & P2 sufficiency', () => {
  it('excludes implausible, unit-mismatched and flagged records and reports them', () => {
    const base = alex.find((r) => r.signalId === 'mood.vas' && r.missionDay === 100)!;
    const bad: HealthRecord[] = [
      { ...base, id: 'x1', value: 42 },
      { ...base, id: 'x2', unit: 'mg/dL' },
      { ...base, id: 'x3', quality: { score: 0.9, flags: ['motion-artifact'] } },
    ];
    const a = evaluate({ records: [...alex, ...bad], signals, asOfDay: 120, safety: [] });
    expect(a.dataQuality.issues[0]).toMatch(/implausible/);
    expect(a.dataQuality.issues[0]).toMatch(/unit-mismatch/);
    expect(a.state).toBe('NO');
  });

  it('removing check-ins makes the assessment INSUFFICIENT rather than NO', () => {
    const selfReports = new Set(signals.filter((s) => s.allowedClassifications.includes('self-reported')).map((s) => s.id));
    const sparse = alex.filter((r) => !(selfReports.has(r.signalId) && r.missionDay > 100));
    const a = evaluate({ records: sparse, signals, asOfDay: 120, safety: [] });
    expect(a.state).toBe('INSUFFICIENT_DATA');
    expect(a.reasons[0]!.ruleId).toBe('P2-SUFFICIENCY');
  });
});

describe('detectors', () => {
  const def = getSignal('mood.vas')!;
  const flat = Array.from({ length: 60 }, (_, d) => ({ missionDay: d, value: d % 2 ? 7 : 6 }));
  const mk = (pts: { missionDay: number; value: number }[]) =>
    toDailySeries(def, pts.map((p) => ({ ...alex[0]!, id: `m${p.missionDay}`, signalId: 'mood.vas', unit: '{score}', ...p })));
  it('CUSUM stays below threshold on a stable series and alarms on a sustained drop', () => {
    const stable = mk(flat);
    const b = computeBaseline(stable, 10, 37)!;
    expect(cusumDetector.run(stable, b, { asOfDay: 59, cfg: DEFAULT_CONFIG })[0]!.statistic).toBeLessThan(DEFAULT_CONFIG.detectors.cusum.h);
    const drop = mk(flat.map((p) => (p.missionDay > 45 ? { ...p, value: 4 } : p)));
    const out = cusumDetector.run(drop, b, { asOfDay: 59, cfg: DEFAULT_CONFIG });
    expect(out[0]!.statistic).toBeGreaterThanOrEqual(DEFAULT_CONFIG.detectors.cusum.h);
    const cp = out.find((c) => c.method === 'change-point')!;
    expect(cp.sinceDay).toBeGreaterThanOrEqual(44);
    expect(cp.sinceDay).toBeLessThanOrEqual(47);
    expect(ewmaDetector.run(drop, b, { asOfDay: 59, cfg: DEFAULT_CONFIG })[0]!.statistic).toBeGreaterThan(0.9);
  });
});
