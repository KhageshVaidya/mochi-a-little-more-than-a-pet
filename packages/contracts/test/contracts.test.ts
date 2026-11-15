import { describe, expect, it } from 'vitest';
import {
  ASSESSMENT_COPY,
  AssessmentState,
  DEFAULT_PREFS,
  HealthRecord,
  MissionCommand,
  Prefs,
  PrefsPatch,
  Source,
  channelsFor,
  eventChannels,
  invokeChannels,
} from '../src';

const baseRecord = {
  id: 'r1',
  subjectId: 'CM-01',
  signalId: 'hr.resting',
  timestamp: '2026-11-14T06:00:00.000Z',
  missionDay: 12,
  value: 58,
  unit: 'bpm',
  aggregation: 'daily-mean',
  classification: 'measured',
  quality: { score: 0.95, flags: [] },
} as const;

describe('provenance', () => {
  it('rejects synthetic records without a scenarioId', () => {
    expect(Source.safeParse({ kind: 'synthetic', adapterId: 'sim.v1' }).success).toBe(false);
    expect(Source.safeParse({ kind: 'synthetic', adapterId: 'sim.v1', scenarioId: 'healthy-adaptation' }).success).toBe(true);
  });

  it('rejects NASA records without a citation', () => {
    expect(Source.safeParse({ kind: 'nasa', adapterId: 'nasa.hrp' }).success).toBe(false);
    expect(
      Source.safeParse({ kind: 'nasa', adapterId: 'nasa.hrp', citation: 'https://www.nasa.gov/hrp/risks/' }).success,
    ).toBe(true);
  });

  it('validates a complete health record and rejects bad values', () => {
    const source = { kind: 'synthetic', adapterId: 'sim.v1', scenarioId: 'healthy-adaptation' };
    expect(HealthRecord.safeParse({ ...baseRecord, source }).success).toBe(true);
    expect(HealthRecord.safeParse({ ...baseRecord, source, value: Number.NaN }).success).toBe(false);
    expect(HealthRecord.safeParse({ ...baseRecord, source, quality: { score: 1.4, flags: [] } }).success).toBe(false);
    expect(HealthRecord.safeParse({ ...baseRecord, source, classification: 'guessed' }).success).toBe(false);
  });
});

describe('assessment', () => {
  it('has exactly three states, each with fixed non-diagnostic copy', () => {
    expect(AssessmentState.options).toEqual(['YES', 'NO', 'INSUFFICIENT_DATA']);
    for (const s of AssessmentState.options) expect(ASSESSMENT_COPY[s].headline.length).toBeGreaterThan(0);
    const allCopy = JSON.stringify(ASSESSMENT_COPY).toLowerCase();
    for (const banned of ['depress', 'disorder', 'diagnosed', 'you are healthy', 'mentally healthy']) {
      expect(allCopy).not.toContain(banned);
    }
  });
});

describe('prefs', () => {
  it('defaults are valid', () => {
    expect(Prefs.parse(DEFAULT_PREFS)).toEqual(DEFAULT_PREFS);
  });
  it('patch rejects unknown theme', () => {
    expect(PrefsPatch.safeParse({ theme: 'neon' }).success).toBe(false);
  });
});

describe('mission commands', () => {
  it('bounds seek to the mission length', () => {
    expect(MissionCommand.safeParse({ type: 'seek', day: 179 }).success).toBe(true);
    expect(MissionCommand.safeParse({ type: 'seek', day: 180 }).success).toBe(false);
  });
});

describe('IPC contract', () => {
  it('companion window cannot reach mission or system channels', () => {
    const { invoke } = channelsFor('companion');
    expect(invoke).not.toContain('mission:command');
    expect(invoke).not.toContain('system:info');
    expect(invoke).toContain('companion:move');
  });
  it('dashboard cannot drive companion movement', () => {
    expect(channelsFor('dashboard').invoke).not.toContain('companion:move');
  });
  it('channel names are namespaced', () => {
    for (const c of [...Object.keys(invokeChannels), ...Object.keys(eventChannels)]) {
      expect(c).toMatch(/^[a-z]+(:[a-z][a-zA-Z-]*)+$/);
    }
  });
  it('rejects oversize companion move deltas', () => {
    expect(invokeChannels['companion:move'].request.safeParse({ dx: 5000, dy: 0 }).success).toBe(false);
  });
});

describe('OllamaModelName', () => {
  it('accepts ordinary Ollama model references', async () => {
    const { OllamaModelName } = await import('../src/prefs');
    for (const m of ['qwen3:4b', 'qwen3:4b-instruct-2507-q4_K_M', 'llama3.2:3b', 'hf.co/someone/model:Q4_K_M']) expect(OllamaModelName.safeParse(m).success).toBe(true);
  });
  it('rejects empty, spaced or injected names', async () => {
    const { OllamaModelName } = await import('../src/prefs');
    for (const m of ['', ' qwen3', 'qwen3 4b', 'qwen3;rm -rf /', '../etc', 'a'.repeat(81), 'http://evil/x']) expect(OllamaModelName.safeParse(m).success).toBe(false);
  });
});
