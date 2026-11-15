import { describe, expect, it } from 'vitest';
import { allSignals } from '@orbital/signals';
import { generateMission } from '@orbital/simulation';
import { deriveAlerts, evaluate, wellbeingPatterns } from '../src';

const signals = allSignals();
const sofia = generateMission('CM-04').records;
const alex = generateMission('CM-01').records;

describe('wellbeing patterns (C2)', () => {
  it('reports several co-occurring observable changes for the wellbeing scenario, in plain non-diagnostic language', () => {
    const p = wellbeingPatterns(sofia, signals, 140);
    expect(p.summary).toMatch(/^Several changes have appeared together over the last 7 days:/);
    expect(p.changes.length).toBeGreaterThanOrEqual(3);
    const text = JSON.stringify(p).toLowerCase();
    for (const banned of ['depress', 'anxiety disorder', 'diagnos', 'disorder', 'condition']) expect(text).not.toContain(banned);
    expect(p.uncertainty).toMatch(/not clinically validated/);
  });
  it('reports nothing notable for healthy adaptation', () => {
    expect(wellbeingPatterns(alex, signals, 140).summary).toBeNull();
  });
  it('relationships are descriptive with n and a causation caveat', () => {
    for (const r of wellbeingPatterns(sofia, signals, 140).relationships) {
      expect(r.n).toBeGreaterThanOrEqual(14);
      expect(r.statement).toMatch(/not causation/);
    }
  });
  it('is deterministic', () => {
    expect(wellbeingPatterns(sofia, signals, 120)).toEqual(wellbeingPatterns(sofia, signals, 120));
  });
});

describe('tiered alerts (C4)', () => {
  const base = { metrics: {}, signals, completeness: 0.95, measurementDue: false };
  it('safety escalation ⇒ urgent first, serious wording', () => {
    const a = evaluate({ records: sofia, signals, asOfDay: 150, safety: [{ day: 150, trigger: 'talk-request', at: '2026-07-30T10:00:00.000Z' }] });
    const alerts = deriveAlerts({ ...base, day: 150, assessment: a });
    expect(alerts.map((x) => x.tier)).toEqual(['urgent', 'human-review']);
    expect(alerts[0]!.title + alerts[0]!.detail).not.toMatch(/!|😀|yay|haha/i);
  });
  it('YES ⇒ human-review with the deciding rule as a reason; NO ⇒ none', () => {
    const yes = deriveAlerts({ ...base, day: 150, assessment: evaluate({ records: sofia, signals, asOfDay: 150, safety: [] }) });
    expect(yes.find((x) => x.tier === 'human-review')?.reasons[0]).toMatch(/R-BRAIN-0[12]/);
    const no = deriveAlerts({ ...base, day: 150, assessment: evaluate({ records: alex, signals, asOfDay: 150, safety: [] }) });
    expect(no.some((x) => x.tier === 'human-review' || x.tier === 'urgent')).toBe(false);
  });
  it('low completeness ⇒ a monitor alert, never a health claim', () => {
    const a = evaluate({ records: alex, signals, asOfDay: 90, safety: [] });
    const alerts = deriveAlerts({ ...base, completeness: 0.5, day: 90, assessment: a });
    expect(alerts.find((x) => x.ruleId === 'A-MONITOR-DATA')?.tier).toBe('monitor');
  });
});
