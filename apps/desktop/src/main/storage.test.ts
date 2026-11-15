import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HealthRecord } from '@orbital/contracts';
import { Storage } from './storage';

const dirs: string[] = [];
function tempDb(): string {
  const d = mkdtempSync(join(tmpdir(), 'orbital-storage-'));
  dirs.push(d);
  return join(d, 'orbital.sqlite');
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const record = (day: number, value: number): HealthRecord => ({
  id: `CM-01:hr.resting:${day}`,
  subjectId: 'CM-01',
  signalId: 'hr.resting',
  timestamp: new Date(Date.UTC(2026, 0, 1 + day, 6)).toISOString(),
  missionDay: day,
  value,
  unit: 'bpm',
  aggregation: 'daily-mean',
  classification: 'measured',
  source: { kind: 'synthetic', adapterId: 'sim.v1', scenarioId: 'healthy-adaptation' },
  quality: { score: 0.9, flags: day === 3 ? ['motion-artifact'] : [] },
});

describe('Storage (node:sqlite)', () => {
  it('migrates to the latest schema and passes an integrity check', () => {
    const s = new Storage(tempDb());
    const info = s.info();
    expect(info.engine).toBe('node:sqlite');
    expect(info.schemaVersion).toBe(4);
    expect(info.ok).toBe(true);
    s.close();
  });

  it('persists key/value data across reopen', () => {
    const path = tempDb();
    const a = new Storage(path);
    a.setJSON('prefs', { theme: 'dark' });
    a.close();
    const b = new Storage(path);
    expect(b.getJSON('prefs')).toEqual({ theme: 'dark' });
    expect(b.info().schemaVersion).toBe(4); // migrations are idempotent
    b.close();
  });

  it('round-trips health records with full provenance', () => {
    const s = new Storage(tempDb());
    s.upsertRecords([record(1, 58), record(2, 59), record(3, 61), record(9, 60)]);
    const rows = s.queryRecords('CM-01', 'hr.resting', 1, 3);
    expect(rows.map((r) => r.missionDay)).toEqual([1, 2, 3]);
    expect(rows[2]).toEqual(record(3, 61));
    s.close();
  });

  it('upsert is idempotent on deterministic ids', () => {
    const s = new Storage(tempDb());
    s.upsertRecords([record(1, 58)]);
    s.upsertRecords([record(1, 57)]);
    expect(s.queryRecords('CM-01', 'hr.resting', 0, 10)).toHaveLength(1);
    expect(s.queryRecords('CM-01', 'hr.resting', 0, 10)[0]?.value).toBe(57);
    s.close();
  });

  it('writes 180 days × 30 signals quickly', () => {
    const s = new Storage(tempDb());
    const many: HealthRecord[] = [];
    for (let sig = 0; sig < 30; sig++)
      for (let d = 0; d < 180; d++) many.push({ ...record(d, 60), id: `s${sig}:${d}`, signalId: `sig.s${sig}` });
    const t0 = performance.now();
    s.upsertRecords(many);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(s.queryRecords('CM-01', 'sig.s7', 0, 179)).toHaveLength(180);
    s.close();
  });

  it('alert audit log is append-only (updates and deletes are refused)', () => {
    const s = new Storage(tempDb());
    s.appendAudit({ subjectId: 'CM-01', missionDay: 5, event: 'generated', alertId: 'a1', tier: 'monitor', ruleId: 'R', detail: {} });
    expect(s.audit('CM-01')).toHaveLength(1);
    expect(() => (s as unknown as { db: { exec(q: string): void } }).db.exec("DELETE FROM alert_audit")).toThrow(/append-only/);
    expect(() => (s as unknown as { db: { exec(q: string): void } }).db.exec("UPDATE alert_audit SET tier = 'x'")).toThrow(/append-only/);
    s.close();
  });

  it('keeps crew members separate and reloads them after reopen', () => {
    const path = tempDb();
    const a = new Storage(path);
    a.upsertRecords([record(1, 58), { ...record(1, 70), id: 'CM-02:hr.resting:1', subjectId: 'CM-02' }]);
    a.close();
    const b = new Storage(path);
    expect(b.subjectRecords('CM-01').map((r) => r.value)).toEqual([58]);
    expect(b.subjectRecords('CM-02').map((r) => r.value)).toEqual([70]);
    expect(b.countRecords()).toBe(2);
    b.close();
  });
});
