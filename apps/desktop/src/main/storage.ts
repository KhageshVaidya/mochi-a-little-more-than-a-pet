import { DatabaseSync } from 'node:sqlite';
import type { EngagementEvent, HealthRecord, JournalEntry, MemoryItem } from '@orbital/contracts';

/**
 * Local persistence on Node's built-in SQLite (`node:sqlite`).
 * Phase 0 spike result: available in Electron 45 (Node 24.22.2, SQLite 3.53.4) — no native module needed.
 *
 * All access is synchronous and happens in the main process only.
 */

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE records (
        id             TEXT PRIMARY KEY,
        signal_id      TEXT NOT NULL,
        mission_day    INTEGER NOT NULL,
        ts             TEXT NOT NULL,
        value          REAL NOT NULL,
        unit           TEXT NOT NULL,
        aggregation    TEXT NOT NULL,
        classification TEXT NOT NULL,
        source_kind    TEXT NOT NULL,
        scenario_id    TEXT,
        source_json    TEXT NOT NULL,
        quality_score  REAL NOT NULL,
        quality_flags  TEXT NOT NULL
      ) STRICT;
      CREATE INDEX records_signal_day ON records (signal_id, mission_day);
      CREATE INDEX records_scenario   ON records (scenario_id, mission_day);

      CREATE TABLE assessments (
        id          TEXT PRIMARY KEY,
        profile_id  TEXT NOT NULL,
        mission_day INTEGER NOT NULL,
        scenario_id TEXT,
        state       TEXT NOT NULL,
        json        TEXT NOT NULL
      ) STRICT;

      CREATE TABLE engagement_events (
        id          TEXT PRIMARY KEY,
        mission_day INTEGER NOT NULL,
        kind        TEXT NOT NULL,
        amount      REAL NOT NULL,
        ts          TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE records ADD COLUMN subject_id TEXT NOT NULL DEFAULT '';
      CREATE INDEX records_subject_signal_day ON records (subject_id, signal_id, mission_day);
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE engagement_events ADD COLUMN subject_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE engagement_events ADD COLUMN source TEXT NOT NULL DEFAULT 'user';
      ALTER TABLE engagement_events ADD COLUMN ref TEXT;
      ALTER TABLE engagement_events ADD COLUMN personal_best INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX engagement_subject_day ON engagement_events (subject_id, mission_day);
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE journal_entries (
        id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, mission_day INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX journal_subject ON journal_entries (subject_id, mission_day);
      CREATE TABLE memory_items (
        id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
        source TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      -- Append-only audit trail: alerts generated, acknowledged, share decisions, safety escalations.
      CREATE TABLE alert_audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, subject_id TEXT NOT NULL, mission_day INTEGER NOT NULL,
        ts TEXT NOT NULL, event TEXT NOT NULL, alert_id TEXT NOT NULL, tier TEXT NOT NULL, rule_id TEXT NOT NULL, json TEXT NOT NULL
      ) STRICT;
      CREATE TRIGGER alert_audit_no_update BEFORE UPDATE ON alert_audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
      CREATE TRIGGER alert_audit_no_delete BEFORE DELETE ON alert_audit BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
      CREATE TABLE safety_events (
        id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, mission_day INTEGER NOT NULL, trigger TEXT NOT NULL, at TEXT NOT NULL
      ) STRICT;
    `,
  },
];

export interface StorageInfo {
  engine: 'node:sqlite';
  sqliteVersion: string;
  path: string;
  schemaVersion: number;
  ok: boolean;
}

export class Storage {
  private readonly db: DatabaseSync;

  constructor(readonly path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 2000;');
    this.migrate();
  }

  private get userVersion(): number {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    return row.user_version;
  }

  private migrate(): void {
    for (const m of MIGRATIONS) {
      if (m.version <= this.userVersion) continue;
      this.db.exec('BEGIN');
      try {
        this.db.exec(m.sql);
        this.db.exec(`PRAGMA user_version = ${m.version}`);
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  // ── Key/value (prefs, mission state, pet state) ────────────────────────────
  getJSON<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  setJSON(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }

  // ── Health records (Workstream B writes, engine/UI read) ───────────────────
  upsertRecords(records: readonly HealthRecord[]): number {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO records
         (id, subject_id, signal_id, mission_day, ts, value, unit, aggregation, classification,
          source_kind, scenario_id, source_json, quality_score, quality_flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.exec('BEGIN');
    try {
      for (const r of records) {
        stmt.run(
          r.id,
          r.subjectId,
          r.signalId,
          r.missionDay,
          r.timestamp,
          r.value,
          r.unit,
          r.aggregation,
          r.classification,
          r.source.kind,
          r.source.scenarioId ?? null,
          JSON.stringify(r.source),
          r.quality.score,
          JSON.stringify(r.quality.flags),
        );
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return records.length;
  }

  queryRecords(subjectId: string, signalId: string, fromDay: number, toDay: number): HealthRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM records WHERE subject_id = ? AND signal_id = ? AND mission_day BETWEEN ? AND ?
         ORDER BY mission_day, ts`,
      )
      .all(subjectId, signalId, fromDay, toDay) as Array<Record<string, string | number | null>>;
    return rows.map(rowToRecord);
  }

  /** All records for one crew member, ordered by day. */
  subjectRecords(subjectId: string): HealthRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM records WHERE subject_id = ? ORDER BY mission_day, signal_id')
      .all(subjectId) as Array<Record<string, string | number | null>>;
    return rows.map(rowToRecord);
  }

  deleteSubjectRecords(subjectId: string): void {
    this.db.prepare('DELETE FROM records WHERE subject_id = ?').run(subjectId);
  }

  insertEngagement(e: EngagementEvent): void {
    this.db
      .prepare('INSERT OR REPLACE INTO engagement_events (id, subject_id, mission_day, kind, amount, ts, source, ref, personal_best) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.id, e.subjectId, e.missionDay, e.kind, e.amount, new Date().toISOString(), e.source, e.ref ?? null, e.personalBest ? 1 : 0);
  }

  engagementEvents(subjectId?: string): EngagementEvent[] {
    const rows = (subjectId
      ? this.db.prepare('SELECT * FROM engagement_events WHERE subject_id = ? ORDER BY mission_day, ts').all(subjectId)
      : this.db.prepare('SELECT * FROM engagement_events ORDER BY mission_day, ts').all()) as Array<Record<string, string | number | null>>;
    return rows.map((r) => ({
      id: String(r.id),
      subjectId: String(r.subject_id),
      missionDay: Number(r.mission_day),
      kind: r.kind as EngagementEvent['kind'],
      amount: Number(r.amount),
      source: r.source as EngagementEvent['source'],
      ...(r.ref !== null ? { ref: String(r.ref) } : {}),
      ...(Number(r.personal_best) ? { personalBest: true } : {}),
    }));
  }

  // ── Journal (private to the individual) ────────────────────────────────────
  saveJournal(e: JournalEntry): void {
    this.db
      .prepare('INSERT OR REPLACE INTO journal_entries (id, subject_id, mission_day, created_at, updated_at, json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(e.id, e.subjectId, e.missionDay, e.createdAt, e.updatedAt, JSON.stringify(e));
  }
  journal(subjectId: string): JournalEntry[] {
    const rows = this.db.prepare('SELECT json FROM journal_entries WHERE subject_id = ? ORDER BY mission_day DESC, created_at DESC').all(subjectId) as { json: string }[];
    return rows.map((r) => JSON.parse(r.json) as JournalEntry);
  }
  deleteJournal(subjectId: string, id: string): void {
    this.db.prepare('DELETE FROM journal_entries WHERE subject_id = ? AND id = ?').run(subjectId, id);
  }

  // ── Memory (inspectable, editable, deletable) ────────────────────────────
  saveMemory(m: MemoryItem): void {
    this.db
      .prepare('INSERT OR REPLACE INTO memory_items (id, subject_id, kind, text, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(m.id, m.subjectId, m.kind, m.text, m.source, m.createdAt);
  }
  memory(subjectId: string): MemoryItem[] {
    const rows = this.db.prepare('SELECT * FROM memory_items WHERE subject_id = ? ORDER BY created_at DESC').all(subjectId) as Array<Record<string, string>>;
    return rows.map((r) => ({ id: r.id!, subjectId: r.subject_id!, kind: r.kind as MemoryItem['kind'], text: r.text!, source: r.source as MemoryItem['source'], createdAt: r.created_at! }));
  }
  deleteMemory(subjectId: string, id: string): void {
    this.db.prepare('DELETE FROM memory_items WHERE subject_id = ? AND id = ?').run(subjectId, id);
  }

  // ── Audit & safety ─────────────────────────────────────────────────────────
  appendAudit(a: { subjectId: string; missionDay: number; event: string; alertId: string; tier: string; ruleId: string; detail: unknown }): void {
    this.db
      .prepare('INSERT INTO alert_audit (subject_id, mission_day, ts, event, alert_id, tier, rule_id, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(a.subjectId, a.missionDay, new Date().toISOString(), a.event, a.alertId, a.tier, a.ruleId, JSON.stringify(a.detail ?? null));
  }
  audit(subjectId: string): Array<{ seq: number; missionDay: number; ts: string; event: string; alertId: string; tier: string; ruleId: string; detail: unknown }> {
    const rows = this.db.prepare('SELECT * FROM alert_audit WHERE subject_id = ? ORDER BY seq DESC LIMIT 500').all(subjectId) as Array<Record<string, string | number>>;
    return rows.map((r) => ({ seq: Number(r.seq), missionDay: Number(r.mission_day), ts: String(r.ts), event: String(r.event), alertId: String(r.alert_id), tier: String(r.tier), ruleId: String(r.rule_id), detail: JSON.parse(String(r.json)) }));
  }
  hasAudit(subjectId: string, alertId: string, event: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM alert_audit WHERE subject_id = ? AND alert_id = ? AND event = ? LIMIT 1').get(subjectId, alertId, event);
  }
  addSafetyEvent(e: { id: string; subjectId: string; missionDay: number; trigger: 'talk-request' | 'safety-item'; at: string }): void {
    this.db.prepare('INSERT OR IGNORE INTO safety_events (id, subject_id, mission_day, trigger, at) VALUES (?, ?, ?, ?, ?)').run(e.id, e.subjectId, e.missionDay, e.trigger, e.at);
  }
  safetyEvents(subjectId: string): { day: number; trigger: 'talk-request' | 'safety-item'; at: string }[] {
    const rows = this.db.prepare('SELECT * FROM safety_events WHERE subject_id = ? ORDER BY mission_day, at').all(subjectId) as Array<Record<string, string | number>>;
    return rows.map((r) => ({ day: Number(r.mission_day), trigger: r.trigger as 'talk-request' | 'safety-item', at: String(r.at) }));
  }

  countRecords(): number {
    return (this.db.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n;
  }

  info(): StorageInfo {
    let sqliteVersion = 'unknown';
    let ok = false;
    try {
      sqliteVersion = (this.db.prepare('SELECT sqlite_version() AS v').get() as { v: string }).v;
      ok = (this.db.prepare('PRAGMA quick_check').get() as { quick_check: string }).quick_check === 'ok';
    } catch {
      ok = false;
    }
    return { engine: 'node:sqlite', sqliteVersion, path: this.path, schemaVersion: this.userVersion, ok };
  }

  close(): void {
    this.db.close();
  }
}

function rowToRecord(row: Record<string, string | number | null>): HealthRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    signalId: String(row.signal_id),
    missionDay: Number(row.mission_day),
    timestamp: String(row.ts),
    value: Number(row.value),
    unit: String(row.unit),
    aggregation: row.aggregation as HealthRecord['aggregation'],
    classification: row.classification as HealthRecord['classification'],
    source: JSON.parse(String(row.source_json)) as HealthRecord['source'],
    quality: { score: Number(row.quality_score), flags: JSON.parse(String(row.quality_flags)) },
  };
}
