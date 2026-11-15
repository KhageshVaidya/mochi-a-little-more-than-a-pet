import { describe, expect, it } from 'vitest';
import { allSignals } from '@orbital/signals';
import { CREW_IDS, SCENARIO_TRUTH, generateMission } from '@orbital/simulation';
import { evaluate, templateExplainer } from '@orbital/engine';
import type { AssessmentState, AstronautId } from '@orbital/contracts';

/**
 * End-to-end: five synthetic profiles through the deterministic Brain Health engine.
 * Ground truth comes from the simulation's scenario forcing (SCENARIO_TRUTH).
 */
const signals = allSignals();
const missions = Object.fromEntries(CREW_IDS.map((id) => [id, generateMission(id)])) as Record<AstronautId, ReturnType<typeof generateMission>>;
const timeline = (id: AstronautId): AssessmentState[] =>
  Array.from({ length: 180 }, (_, d) => evaluate({ records: missions[id].records, signals, asOfDay: d, safety: [] }).state);
const timelines = Object.fromEntries(CREW_IDS.map((id) => [id, timeline(id)])) as Record<AstronautId, AssessmentState[]>;
const assessable = (s: AssessmentState[]) => s.slice(44);

describe('five-astronaut scenarios × Brain Health engine', () => {
  it('everyone is INSUFFICIENT before the personal baseline + 1 week exists', () => {
    for (const id of CREW_IDS) expect(timelines[id].slice(0, 44).every((s) => s === 'INSUFFICIENT_DATA')).toBe(true);
  });

  it('CM-01 Alex (healthy adaptation): no elevated signal on any assessable day', () => {
    expect(assessable(timelines['CM-01']).every((s) => s === 'NO')).toBe(true);
  });

  it('CM-02 Maya (sleep disruption): elevated signal during disruption, partial recovery after intervention', () => {
    const t = timelines['CM-02'];
    const onset = SCENARIO_TRUTH['sleep-disruption'].onsetDay!;
    const first = t.indexOf('YES');
    expect(first).toBeGreaterThan(onset);
    expect(first).toBeLessThan(onset + 30);
    expect(t.slice(90, 120).filter((s) => s === 'YES').length).toBeGreaterThanOrEqual(25);
    expect(t.slice(140).includes('NO')).toBe(true); // recovery windows appear
    const reasons = evaluate({ records: missions['CM-02'].records, signals, asOfDay: 110, safety: [] }).reasons.map((r) => r.text).join(' ');
    expect(reasons).toContain('sleep');
  });

  it('CM-03 Daniel (physical deconditioning): no wellbeing signal; physical indicators change', () => {
    expect(assessable(timelines['CM-03']).every((s) => s === 'NO')).toBe(true);
    const truth = missions['CM-03'].truth;
    expect(truth[170]!.values['hr.resting']! - truth[30]!.values['hr.resting']!).toBeGreaterThan(4);
    expect(truth[170]!.values['exercise.performance']! / truth[30]!.values['exercise.performance']!).toBeLessThan(0.88);
  });

  it('CM-04 Sofia (wellbeing changes): multi-domain elevated signal after onset, persisting', () => {
    const t = timelines['CM-04'];
    const onset = SCENARIO_TRUTH['psych-deterioration'].onsetDay!;
    expect(t.slice(44, onset).every((s) => s === 'NO')).toBe(true); // no false alarm before onset
    const first = t.indexOf('YES');
    expect(first).toBeGreaterThan(onset);
    expect(first).toBeLessThan(onset + 35);
    expect(t.slice(first).every((s) => s === 'YES')).toBe(true);
    const a = evaluate({ records: missions['CM-04'].records, signals, asOfDay: 150, safety: [] });
    expect(a.reasons[0]!.ruleId).toBe('R-BRAIN-01');
    const domains = new Set(a.contributors.filter((c) => c.method === 'cusum').map((c) => c.domain));
    expect(domains.size).toBeGreaterThanOrEqual(4);
    expect(a.suggestedAction).toBe('private-conference');
  });

  it('CM-05 James (incomplete telemetry): predominantly INSUFFICIENT DATA, never YES', () => {
    const t = assessable(timelines['CM-05']);
    expect(t.filter((s) => s === 'INSUFFICIENT_DATA').length / t.length).toBeGreaterThan(0.7);
    expect(t.includes('YES')).toBe(false);
    const a = evaluate({ records: missions['CM-05'].records, signals, asOfDay: 120, safety: [] });
    expect(a.dataQuality.issues.join(' ')).toMatch(/Excluded \d+ record/);
  });

  it('no output wording is diagnostic', () => {
    for (const id of CREW_IDS) {
      for (const d of [60, 120, 179]) {
        const a = evaluate({ records: missions[id].records, signals, asOfDay: d, safety: [] });
        const text = (JSON.stringify(a.reasons) + templateExplainer.explain(a)).toLowerCase();
        for (const banned of ['depress', 'disorder', 'diagnosed', 'diagnosis of', 'mentally healthy', 'illness']) expect(text).not.toContain(banned);
      }
    }
  });
});
