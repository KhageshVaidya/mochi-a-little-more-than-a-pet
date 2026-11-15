import { describe, expect, it } from 'vitest';
import type { ApprovedOutputs } from '@orbital/contracts';
import { FORBIDDEN_WORDING, MAX_RECOMMENDATIONS, TEMPLATES, recommend } from '../src';

const base: ApprovedOutputs = {
  day: 100,
  decisionState: 'NO',
  escalation: false,
  sustainedDomains: [],
  domainOnsetDays: {},
  notableDomains: [],
  physicalTrendSignals: [],
  dataGaps: { overdueMeasurements: [], lowCoverageDomains: [] },
};
const kinds = (a: Partial<ApprovedOutputs>, ctx = { restDay: false }) => recommend({ ...base, ...a }, ctx).recommendations.map((r) => r.kind);

describe('recommendation engine', () => {
  it('nothing detected ⇒ no adaptive recommendations (routine missions continue)', () => {
    expect(kinds({})).toEqual([]);
  });

  it('safety pathway ⇒ only human support, nothing else, games suppressed', () => {
    const r = recommend({ ...base, escalation: true, decisionState: 'YES', sustainedDomains: ['sleep', 'mood'], physicalTrendSignals: ['hr.resting'] }, { restDay: false });
    expect(r.recommendations.map((x) => x.kind)).toEqual(['human-support']);
    expect(r.suppressed.some((s) => s.kind === 'cognitive-light')).toBe(true);
  });

  it('sleep disruption ⇒ recovery expedition, wind-down, sleep routine', () => {
    expect(kinds({ sustainedDomains: ['sleep'] })).toEqual(['sleep-recovery-expedition', 'wind-down', 'sleep-routine']);
  });

  it('reduced activity / physical trend ⇒ movement missions', () => {
    expect(kinds({ physicalTrendSignals: ['exercise.performance'] })).toEqual(['movement-short', 'movement-exploration', 'exercise-optional']);
  });

  it('cognitive fatigue ⇒ rest first, and no game while cognition/fatigue is in sustained change', () => {
    const r = recommend({ ...base, sustainedDomains: ['cognition'] }, { restDay: false });
    expect(r.recommendations.map((x) => x.kind)).toEqual(['cognitive-rest']);
    expect(r.suppressed.find((s) => s.kind === 'cognitive-light')?.reason).toMatch(/Rest is preferred/);
    expect(kinds({ notableDomains: ['cognition'] })).toEqual(['cognitive-rest', 'cognitive-light']);
  });

  it('wellbeing changes ⇒ voluntary journal, recreation, companion chat', () => {
    expect(kinds({ decisionState: 'YES', sustainedDomains: ['mood', 'social'] })).toEqual(['journal', 'recreation', 'companion-chat']);
  });

  it('missing measurements ⇒ a gentle measurement reminder', () => {
    expect(kinds({ dataGaps: { overdueMeasurements: ['bp.systolic'], lowCoverageDomains: [] } })).toEqual(['measurement-reminder']);
  });

  it('a sustained wellbeing change puts connection first and mixes areas in a short list', () => {
    expect(kinds({ decisionState: 'YES', sustainedDomains: ['sleep', 'mood', 'stress'] })).toEqual(['journal', 'sleep-recovery-expedition', 'recreation']);
    // The area that changed first leads: sleep first when sleep changed before mood (secondary mood change).
    expect(kinds({ decisionState: 'YES', sustainedDomains: ['sleep', 'mood'], domainOnsetDays: { sleep: 46, mood: 76 } })[0]).toBe('sleep-recovery-expedition');
    expect(kinds({ decisionState: 'YES', sustainedDomains: ['sleep', 'mood'], domainOnsetDays: { sleep: 102, mood: 80 } })[0]).toBe('journal');
  });

  it('respects restrictions and rest days (never contradicts safety guidance)', () => {
    const noEx = recommend({ ...base, physicalTrendSignals: ['hr.resting'] }, { restDay: false, restrictions: { exercise: 'no-exercise' } });
    expect(noEx.recommendations.filter((r) => r.category === 'exercise')).toEqual([]);
    expect(kinds({ physicalTrendSignals: ['hr.resting'] }, { restDay: true } as never)).toEqual([]);
    const light = recommend({ ...base, physicalTrendSignals: ['hr.resting'] }, { restDay: false, restrictions: { exercise: 'light-only' } });
    expect(light.recommendations.map((r) => r.kind)).not.toContain('exercise-optional');
    const noGames = recommend({ ...base, notableDomains: ['cognition'] }, { restDay: false, restrictions: { cognitiveGames: false } });
    expect(noGames.recommendations.map((r) => r.kind)).not.toContain('cognitive-light');
  });

  it('keeps the list short and everything optional', () => {
    const r = recommend({ ...base, decisionState: 'YES', sustainedDomains: ['sleep', 'mood', 'cognition'], physicalTrendSignals: ['hr.resting'], dataGaps: { overdueMeasurements: ['body.mass'], lowCoverageDomains: [] } }, { restDay: false });
    expect(r.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    expect(r.recommendations.every((x) => x.optional === true)).toBe(true);
    expect(r.recommendations.every((x) => x.basis.source && x.id.startsWith('rec:100:'))).toBe(true);
  });

  it('rejects inputs carrying ML data (only approved outputs may drive recommendations)', () => {
    expect(() => recommend({ ...base, ml: { status: 'alarm' } } as unknown as ApprovedOutputs, { restDay: false })).toThrow();
  });

  it('copy never guilts, pressures or makes clinical claims', () => {
    for (const t of Object.values(TEMPLATES)) expect(`${t.title} ${t.description}`).not.toMatch(FORBIDDEN_WORDING);
  });

  it('is deterministic', () => {
    const a = { ...base, decisionState: 'YES' as const, sustainedDomains: ['sleep' as const, 'mood' as const] };
    expect(recommend(a, { restDay: false })).toEqual(recommend(a, { restDay: false }));
  });
});
