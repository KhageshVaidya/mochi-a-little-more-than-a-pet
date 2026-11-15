import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Snapshot, Assessment, CrewSummary, TelemetryDay } from '@orbital/contracts';
import { Storage } from './storage';
import { DataService } from './data-service';

const dir = mkdtempSync(join(tmpdir(), 'orbital-data-'));
const path = join(dir, 'orbital.sqlite');
// Close the database before deleting its folder: Windows cannot delete open files.
afterAll(() => {
  second.close();
  rmSync(dir, { recursive: true, force: true });
});

const first = new Storage(path);
const generated = new DataService(first);
generated.init();
const snapGenerated = generated.snapshot('CM-04', 120);
const assessGenerated = generated.assess('CM-04', 120);
first.close();

const second = new Storage(path);
const loaded = new DataService(second);
loaded.init();

describe('DataService', () => {
  it('generates on first launch and reloads identical data from SQLite on the next', () => {
    expect(Object.values(generated.loadReport).every((v) => v === 'generated')).toBe(true);
    expect(Object.values(loaded.loadReport).every((v) => v === 'loaded-from-sqlite')).toBe(true);
    expect(loaded.snapshot('CM-04', 120)).toEqual(snapGenerated);
    expect(loaded.assess('CM-04', 120)).toEqual(assessGenerated);
  });

  it('read models satisfy their contracts', () => {
    expect(Snapshot.safeParse(loaded.snapshot('CM-02', 90)).success).toBe(true);
    expect(Assessment.safeParse(loaded.assess('CM-02', 90)).success).toBe(true);
    expect(TelemetryDay.safeParse(loaded.telemetry('CM-02', 90)).success).toBe(true);
    for (const s of loaded.crewSummary(90)) expect(CrewSummary.safeParse(s).success).toBe(true);
  });

  it('switching crew member changes values; switching day changes values', () => {
    const a = loaded.snapshot('CM-01', 90).metrics['hr.resting']!.value;
    const b = loaded.snapshot('CM-03', 90).metrics['hr.resting']!.value;
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
    const early = loaded.snapshot('CM-03', 40).metrics['activity.active-minutes']!.mean7!;
    const late = loaded.snapshot('CM-03', 170).metrics['activity.active-minutes']!.mean7!;
    expect(late).toBeLessThan(early * 0.75);
  });

  it('baseline comparisons appear only after the baseline window', () => {
    expect(loaded.snapshot('CM-01', 20).metrics['hr.resting']!.baseline).toBeNull();
    expect(loaded.snapshot('CM-01', 90).metrics['hr.resting']!.baseline?.kind).toBe('baseline');
  });

  it('completeness reflects data quality (CM-05 far below CM-01)', () => {
    const good = loaded.snapshot('CM-01', 120).completeness.overall;
    const poor = loaded.snapshot('CM-05', 120).completeness.overall;
    expect(good).toBeGreaterThan(0.85);
    expect(poor).toBeLessThan(good - 0.2);
  });

  it('series never contains physically implausible values and marks flagged points', () => {
    const s = loaded.series('CM-05', ['hr.resting'], 0, 179)['hr.resting']!;
    expect(s.every((p) => p.value >= 25 && p.value <= 200)).toBe(true);
    expect(s.some((p) => p.flagged)).toBe(true);
  });

  it('crew summary exposes physical indicators only — no wellbeing data', () => {
    const keys = Object.keys(loaded.crewSummary(100)[0]!.metrics);
    for (const k of keys) expect(k).not.toMatch(/mood|stress|isolation|motivation|fatigue|cog\./);
  });

  it('assessment timeline matches individual assessments', () => {
    const t = loaded.timeline('CM-04');
    expect(t).toHaveLength(180);
    expect(t[150]!.state).toBe(loaded.assess('CM-04', 150).state);
    expect(t[150]!.state).toBe('YES');
  });
});
