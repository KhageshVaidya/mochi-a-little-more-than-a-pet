import { describe, expect, it } from 'vitest';
import { HrpRiskId, RISK_LINK_CAVEAT, type AlertItem, type HrpRegistry } from '@orbital/contracts';
import { allSignals } from '@orbital/signals';
import {
  HRP_REGISTRY_RAW,
  attachRiskContext,
  createNasaHrpSource,
  findSource,
  loadHrpKnowledge,
  risksForSignal,
  sourceUrlFor,
  validateHrpRegistry,
} from '../src';

const signals = allSignals();
const state = loadHrpKnowledge(signals);
const reg = (state.status === 'ok' ? state.registry : null) as HrpRegistry;
const clone = (): HrpRegistry => structuredClone(HRP_REGISTRY_RAW) as HrpRegistry;
const risk = (r: HrpRegistry, id: string) => r.risks.find((x) => x.id === id)!;

describe('NASA HRP registry — validation', () => {
  it('the bundled registry validates against the schema, cross-references and the signal registry', () => {
    expect(state.status === 'unavailable' ? state.errors : []).toEqual([]);
    expect(reg.schemaVersion).toBe(1);
    expect(reg.registryVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('covers every NASA HRP risk id exactly once', () => {
    expect(reg.risks.map((r) => r.id).sort()).toEqual([...HrpRiskId.options].sort());
  });

  it('rejects a registry with a schema error, reporting the path', () => {
    const bad = clone() as unknown as { schemaVersion: number };
    bad.schemaVersion = 2;
    const s = validateHrpRegistry(bad);
    expect(s.status).toBe('unavailable');
    expect(s.status === 'unavailable' && s.errors.join()).toMatch(/schemaVersion/);
  });

  it('rejects non-NASA source URLs', () => {
    const bad = clone();
    bad.sources[1]!.url = 'https://example.com/fake-risk';
    expect(validateHrpRegistry(bad).status).toBe('unavailable');
  });

  it('rejects a missing risk (all 17 must be present)', () => {
    const bad = clone();
    bad.risks = bad.risks.filter((r) => r.id !== 'sans');
    const s = validateHrpRegistry(bad);
    expect(s.status === 'unavailable' && s.errors).toContain('risk sans missing from registry');
  });

  it('rejects an NASA-classed claim without a source, but allows an unsourced ORBITAL hypothesis', () => {
    const bad = clone();
    delete risk(bad, 'cardiovascular').signalLinks[0]!.sourceId;
    expect(validateHrpRegistry(bad).status).toBe('unavailable');
    const ok = clone();
    const hyp = risk(ok, 'cardiovascular').signalLinks.find((l) => l.evidence === 'orbital-hypothesis')!;
    expect(hyp.sourceId).toBeUndefined();
    expect(validateHrpRegistry(ok, signals).status).toBe('ok');
  });

  it('flags a mismatch between the knowledge registry and the signal registry hrpRisks', () => {
    const bad = clone();
    risk(bad, 'teamwork').signalLinks = [];
    risk(bad, 'teamwork').indicators = risk(bad, 'teamwork').indicators.map((i) => ({ ...i, signalIds: [] }));
    risk(bad, 'teamwork').coverage = 'not-measured';
    const s = validateHrpRegistry(bad, signals);
    expect(s.status === 'unavailable' && s.errors.join()).toMatch(/isolation\.vas: signal registry hrpRisks/);
  });

  it('flags unknown signal ids and inconsistent coverage', () => {
    const bad = clone();
    risk(bad, 'immune').coverage = 'partial';
    risk(bad, 'hypoxia').signalLinks.push({ signalId: 'made.up', evidence: 'orbital-hypothesis', rationale: 'Not a real ORBITAL signal at all.' });
    const s = validateHrpRegistry(bad, signals);
    const errs = s.status === 'unavailable' ? s.errors.join('\n') : '';
    expect(errs).toMatch(/immune: coverage/);
    expect(errs).toMatch(/unknown signal made\.up/);
  });
});

describe('NASA HRP registry — source provenance', () => {
  it('every source is an official nasa.gov page with title, organisation and retrieval date', () => {
    for (const s of reg.sources) {
      expect(s.url).toMatch(/^https:\/\/www\.nasa\.gov\//);
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.organisation).toMatch(/Human Research Program|Humans in Space|Human Health and Performance/);
      expect(s.retrievedAt <= reg.snapshotDate).toBe(true);
    }
  });

  it('every risk cites its public NASA risk page and its Human System Risk Board page', () => {
    for (const r of reg.risks) {
      const kinds = r.sourceIds.map((id) => findSource(reg, id)!.kind).sort();
      expect(kinds, r.id).toEqual(['hsrb-risk-page', 'public-risk-page']);
    }
  });

  it('every statement and mitigation carries a verbatim quote from one of the risk’s own sources', () => {
    for (const r of reg.risks) {
      expect(r.statements.length, r.id).toBeGreaterThan(0);
      for (const q of [...r.statements, ...r.mitigations]) {
        expect(r.sourceIds).toContain(q.sourceId);
        expect(q.quote.length).toBeGreaterThan(10);
      }
    }
  });

  it('the DCS risk does not use the mis-linked behavioural-health page as a source', () => {
    const dcs = risk(reg, 'decompression-sickness');
    expect(dcs.sourceIds.every((id) => !findSource(reg, id)!.url.includes('behavioral'))).toBe(true);
  });
});

describe('NASA HRP registry — honesty constraints', () => {
  const allText = JSON.stringify(HRP_REGISTRY_RAW);

  it('contains no diagnostic labels applied to astronauts', () => {
    expect(allText).not.toMatch(/\byou (have|are experiencing)\b|\bdiagnos(ed|is of)\b(?! not)/i);
  });

  it('does not introduce numeric clinical thresholds in ORBITAL-authored text', () => {
    for (const r of reg.risks) {
      const authored = [r.description, ...r.signalLinks.map((l) => l.rationale), ...r.missingMeasurements].join(' ');
      expect(authored, r.id).not.toMatch(/\b\d+(\.\d+)?\s?(mmHg|bpm|%|ms|mg\/dL)\b/);
    }
  });

  it('records mitigations only with a NASA quote and source (never ORBITAL advice)', () => {
    for (const r of reg.risks) for (const m of r.mitigations) expect(findSource(reg, m.sourceId), `${r.id}: ${m.summary}`).not.toBeNull();
  });

  it('risks ORBITAL cannot measure say so, with missing measurements listed', () => {
    const bone = risk(reg, 'bone');
    expect(bone.coverage).toBe('countermeasure-only');
    expect(bone.indicators.find((i) => /bone mineral density/i.test(i.label))!.signalIds).toEqual([]);
    for (const id of ['sans', 'immune', 'radiation-cancer', 'sensorimotor-vestibular'] as const) {
      const r = risk(reg, id);
      expect(r.coverage).toBe('not-measured');
      expect(r.missingMeasurements.length).toBeGreaterThan(0);
    }
  });

  it('every food/nutrition signal link is labelled as an ORBITAL hypothesis (NASA pages do not name them)', () => {
    expect(risk(reg, 'food-nutrition').signalLinks.every((l) => l.evidence === 'orbital-hypothesis')).toBe(true);
  });
});

describe('risk-to-signal mappings', () => {
  it('every signal with hrpRisks resolves to registry links for exactly those risks', () => {
    for (const def of signals) {
      expect(risksForSignal(reg, def.id).map((l) => l.riskId).sort(), def.id).toEqual([...def.hrpRisks].sort());
    }
  });

  it('orders links by evidence strength and gives hypotheses the risk’s public page to read', () => {
    const links = risksForSignal(reg, 'hrv.rmssd');
    expect(links.every((l) => l.evidence === 'orbital-hypothesis')).toBe(true);
    for (const l of links) expect(findSource(reg, l.source!.id)!.kind).toBe('public-risk-page');
    const sleep = risksForSignal(reg, 'sleep.duration');
    expect(sleep[0]).toMatchObject({ riskId: 'sleep-schedules', evidence: 'nasa-stated' });
  });

  it('a signal with no NASA link returns no risks', () => {
    expect(risksForSignal(reg, 'temp.skin')).toEqual([]);
  });
});

describe('alert integration', () => {
  const base = { day: 90, reasons: ['x'], detail: 'd', title: 't' };
  const alerts: AlertItem[] = [
    { ...base, id: 'urgent:1', tier: 'urgent', ruleId: 'A-URGENT-SAFETY', section: 'support', signalIds: ['mood.vas'] },
    { ...base, id: 'monitor:bp', tier: 'monitor', ruleId: 'A-MONITOR-PHYSICAL', section: 'physical', signalIds: ['bp.systolic'] },
    { ...base, id: 'review:90', tier: 'human-review', ruleId: 'A-HUMAN-REVIEW', section: 'brain', signalIds: ['cog.rt.median', 'mood.vas', 'sleep.duration'] },
    { ...base, id: 'routine:measure', tier: 'routine', ruleId: 'A-ROUTINE-MEASURE', section: 'challenges' },
  ];
  const out = attachRiskContext(alerts, state);

  it('never attaches risk context to urgent safety alerts', () => {
    expect(out[0]!.riskContext).toBeUndefined();
  });

  it('links a physical monitor alert to its NASA risk with a source', () => {
    expect(out[1]!.riskContext).toEqual([
      expect.objectContaining({ riskId: 'cardiovascular', evidence: 'nasa-stated', source: expect.objectContaining({ url: expect.stringMatching(/^https:\/\/www\.nasa\.gov\//) }) }),
    ]);
  });

  it('deduplicates risks across contributing signals and caps the list', () => {
    const ids = out[2]!.riskContext!.map((l) => l.riskId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['sleep-schedules', 'behavioral-psychiatric']));
    expect(ids.length).toBeLessThanOrEqual(4);
  });

  it('ranks the risk most of the contributing signals relate to first', () => {
    const [a] = attachRiskContext([{ ...base, id: 'review:x', tier: 'human-review', ruleId: 'A-HUMAN-REVIEW', section: 'brain', signalIds: ['hr.resting', 'mood.vas', 'stress.vas', 'isolation.vas'] }], state);
    expect(a!.riskContext![0]!.riskId).toBe('behavioral-psychiatric');
  });

  it('never changes the alert itself', () => {
    out.forEach((a, i) => {
      const { riskContext: _rc, ...rest } = a;
      expect(rest).toEqual(alerts[i]);
    });
  });

  it('alerts without signals, or an unavailable registry, pass through unchanged', () => {
    expect(out[3]!.riskContext).toBeUndefined();
    expect(attachRiskContext(alerts, { status: 'unavailable', errors: ['x'] })).toEqual(alerts);
  });

  it('missing source: a link whose source is absent reports null instead of inventing one', () => {
    const r = clone();
    const cv = risk(r, 'cardiovascular');
    cv.signalLinks.find((l) => l.signalId === 'bp.systolic')!.sourceId = 'src:does-not-exist';
    const link = risksForSignal(r, 'bp.systolic').find((l) => l.riskId === 'cardiovascular')!;
    expect(link.source).toBeNull();
    expect(validateHrpRegistry(r).status).toBe('unavailable');
  });

  it('a fixed non-diagnostic caveat exists for display', () => {
    expect(RISK_LINK_CAVEAT).toMatch(/does not mean you are experiencing this risk/);
    expect(RISK_LINK_CAVEAT).toMatch(/not a diagnosis/);
  });
});

describe('offline availability & external-link allow-list', () => {
  it('the registry is bundled data: loading performs no network access', async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const src = createNasaHrpSource(signals);
      expect(src.online).toBe(false);
      const refs = await src.loadReferences();
      expect(refs).toHaveLength(17);
      expect(refs.every((x) => x.kind === 'hrp-risk' && x.url.startsWith('https://www.nasa.gov/'))).toBe(true);
      expect(src.describe().retrievedAt).toBe(reg.snapshotDate);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(called).toBe(false);
  });

  it('only registry source ids resolve to an openable URL', () => {
    expect(sourceUrlFor(state, 'src:pub-sleep')).toBe('https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/');
    expect(sourceUrlFor(state, 'https://evil.example')).toBeNull();
    expect(sourceUrlFor(state, 'src:unknown')).toBeNull();
    expect(sourceUrlFor({ status: 'unavailable', errors: [] }, 'src:pub-sleep')).toBeNull();
  });
});
