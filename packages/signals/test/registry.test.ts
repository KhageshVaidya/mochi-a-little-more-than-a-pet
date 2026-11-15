import { describe, expect, it } from 'vitest';
import { HrpRiskId, SignalDefinition } from '@orbital/contracts';
import { SIGNALS, allSignals, brainProfileSignals, getSignal } from '../src';

describe('signal registry', () => {
  it('every entry parses against the contract', () => {
    for (const s of SIGNALS) {
      const r = SignalDefinition.safeParse(s);
      expect(r.success, `${s.id}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
  });

  it('ids are unique', () => {
    const ids = SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no clinical reference ranges are declared without a citation (none exist yet)', () => {
    expect(allSignals().filter((s) => s.referenceRangeId !== undefined)).toEqual([]);
  });

  it('HRP risk links only use the verified catalogue', () => {
    for (const s of allSignals()) for (const r of s.hrpRisks) expect(HrpRiskId.options).toContain(r);
  });

  it('brain profile covers the six required domains', () => {
    const domains = new Set(brainProfileSignals().map((s) => s.domain));
    for (const d of ['mood', 'sleep', 'stress', 'fatigue', 'cognition', 'social', 'activity']) expect(domains).toContain(d);
  });

  it('inferred-only signals are never classified as measured', () => {
    for (const id of ['hydration.index', 'fatigue.index', 'body.lean-mass', 'body.fat-mass']) {
      expect(getSignal(id)?.allowedClassifications).toEqual(['inferred']);
    }
  });

  it('includes challenge-named indicators (BP, glucose, HR, temperature, sleep, mood)', () => {
    for (const id of ['bp.systolic', 'glucose.capillary', 'hr.resting', 'temp.skin', 'sleep.duration', 'mood.vas']) {
      expect(getSignal(id)).toBeDefined();
    }
  });

  it('unknown ids return undefined', () => {
    expect(getSignal('nope.nope')).toBeUndefined();
  });
});
