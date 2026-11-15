import type {
  Assessment,
  AssessmentTimeline,
  AstronautId,
  AstronautProfile,
  BaselineStats,
  CrewSummary,
  HealthRecord,
  MetricSnapshot,
  SeriesResponse,
  SignalDefinition,
  Snapshot,
  TelemetryDay,
  WellbeingPatterns,
} from '@orbital/contracts';
import { allSignals, getSignal } from '@orbital/signals';
import { CREW_IDS, SIM_VERSION, crewProfiles, generateMission, generateTelemetry } from '@orbital/simulation';
import { DEFAULT_CONFIG, computeBaseline, evaluate, mean, rejectReason, toDailySeries, wellbeingPatterns } from '@orbital/engine';
import type { Storage } from './storage';

/**
 * Main-process data service (integration lead).
 *  - Generates each crew member's synthetic mission once, persists it to SQLite, and reloads it from
 *    SQLite on later launches (regenerating only when the simulation version changes).
 *  - Serves read models (snapshot, series, assessment, telemetry, crew summary) to the dashboard.
 *  - Every number the UI shows is computed here from stored records.
 */

const SPARSE_LOOKBACK: Record<SignalDefinition['cadence'], number> = {
  continuous: 2,
  daily: 2,
  nightly: 2,
  weekly: 10,
  intermittent: 45,
};

/** Physical indicators allowed in crew-level views. Wellbeing data is deliberately excluded. */
const CREW_SUMMARY_SIGNALS = ['hr.resting', 'hrv.rmssd', 'sleep.duration', 'activity.active-minutes', 'exercise.performance', 'body.mass'];

interface SubjectData {
  records: HealthRecord[];
  bySignal: Map<string, HealthRecord[]>;
}

export class DataService {
  private readonly signals = allSignals();
  private readonly data = new Map<AstronautId, SubjectData>();
  private readonly assessCache = new Map<string, Assessment>();
  private readonly timelineCache = new Map<AstronautId, AssessmentTimeline>();
  /** How the data were obtained at startup, for diagnostics and the smoke test. */
  readonly loadReport: Record<string, 'generated' | 'loaded-from-sqlite'> = {};

  constructor(private readonly storage: Storage) {}

  /** Generate-or-load all five crew members. Idempotent. */
  init(): void {
    for (const id of CREW_IDS) {
      const key = `sim.version.${id}`;
      let records: HealthRecord[];
      if (this.storage.getJSON<string>(key) === SIM_VERSION) {
        records = this.storage.subjectRecords(id);
        this.loadReport[id] = 'loaded-from-sqlite';
      } else {
        records = generateMission(id).records;
        this.storage.deleteSubjectRecords(id);
        this.storage.upsertRecords(records);
        this.storage.setJSON(key, SIM_VERSION);
        this.loadReport[id] = 'generated';
      }
      const bySignal = new Map<string, HealthRecord[]>();
      for (const r of records) {
        const arr = bySignal.get(r.signalId) ?? [];
        arr.push(r);
        bySignal.set(r.signalId, arr);
      }
      this.data.set(id, { records, bySignal });
    }
  }

  /** All records for one crew member (synthetic + user-entered). */
  records(id: AstronautId): readonly HealthRecord[] {
    return this.subject(id).records;
  }

  /** Persist user-entered records (e.g. cognitive game results) and index them in memory. */
  addRecords(recs: readonly HealthRecord[]): void {
    for (const id of new Set(recs.map((r) => r.subjectId))) this.invalidate(id as AstronautId);
    this.storage.upsertRecords(recs);
    for (const r of recs) {
      const subj = this.subject(r.subjectId as AstronautId);
      subj.records.push(r);
      const arr = subj.bySignal.get(r.signalId) ?? [];
      arr.push(r);
      subj.bySignal.set(r.signalId, arr);
    }
  }

  private profileOverlay: (p: AstronautProfile) => AstronautProfile = (p) => p;
  /** Display-only identity overlay (e.g. private local demo names). Data, scenarios and ids are unchanged. */
  setProfileOverlay(fn: (p: AstronautProfile) => AstronautProfile): void {
    this.profileOverlay = fn;
  }
  profiles(): AstronautProfile[] {
    return crewProfiles().map(this.profileOverlay);
  }

  private subject(id: AstronautId): SubjectData {
    const d = this.data.get(id);
    if (!d) throw new Error(`No data for ${id}`);
    return d;
  }

  private reliable(def: SignalDefinition, recs: readonly HealthRecord[]): HealthRecord[] {
    return recs.filter((r) => rejectReason(r, def, DEFAULT_CONFIG.quality) === null);
  }

  private baselineFor(def: SignalDefinition, reliable: readonly HealthRecord[]): BaselineStats | null {
    const series = toDailySeries(def, reliable);
    const sparse = def.cadence === 'weekly' || def.cadence === 'intermittent';
    const { startDay, endDay } = sparse ? { startDay: 0, endDay: DEFAULT_CONFIG.baseline.endDay } : DEFAULT_CONFIG.baseline;
    const b = computeBaseline(series, startDay, endDay);
    if (b && b.n >= def.baseline.minObservations) {
      return { kind: 'baseline', mean: b.mean, sd: b.sd, n: b.n, startDay, endDay };
    }
    const first = series.points[0];
    return first ? { kind: 'first', mean: first.value, sd: 0, n: 1, startDay: first.day, endDay: first.day } : null;
  }

  metric(id: AstronautId, signalId: string, day: number): MetricSnapshot | null {
    const def = getSignal(signalId);
    const all = this.subject(id).bySignal.get(signalId);
    if (!def || !all) return null;
    const upToDay = all.filter((r) => r.missionDay <= day);
    const reliable = this.reliable(def, upToDay);
    const lookback = SPARSE_LOOKBACK[def.cadence];
    const latest = [...reliable].reverse().find((r) => r.missionDay > day - lookback);
    const baseline = this.baselineFor(def, this.reliable(def, all));
    const value = latest?.value ?? null;
    const last7 = reliable.filter((r) => r.missionDay > day - 7).map((r) => r.value);
    let coverage14: number;
    if (def.cadence === 'weekly') coverage14 = Math.min(1, reliable.filter((r) => r.missionDay > day - 14).length / 2);
    else if (def.cadence === 'intermittent') coverage14 = latest ? 1 : 0;
    else {
      const span = Math.min(14, day + 1);
      coverage14 = new Set(reliable.filter((r) => r.missionDay > day - 14).map((r) => r.missionDay)).size / span;
    }
    // Baselines only become valid once their window has passed.
    const baselineReady = baseline && (baseline.kind === 'first' || day >= baseline.endDay);
    const ref = baselineReady ? baseline : null;
    return {
      signalId,
      value,
      observedDay: latest?.missionDay ?? null,
      classification: latest?.classification ?? null,
      quality: latest?.quality.score ?? null,
      flags: latest?.quality.flags ?? [],
      baseline: ref,
      z: value !== null && ref?.kind === 'baseline' ? (value - ref.mean) / ref.sd : null,
      deltaPct: value !== null && ref && ref.mean !== 0 ? ((value - ref.mean) / Math.abs(ref.mean)) * 100 : null,
      mean7: last7.length ? mean(last7) : null,
      coverage14: Math.max(0, Math.min(1, coverage14)),
    };
  }

  snapshot(id: AstronautId, day: number): Snapshot {
    const metrics: Record<string, MetricSnapshot> = {};
    for (const def of this.signals) {
      const m = this.metric(id, def.id, day);
      if (m) metrics[def.id] = m;
    }
    const daily = this.signals.filter((s) => ['daily', 'nightly', 'continuous'].includes(s.cadence) && metrics[s.id]);
    const sensor = daily.filter((s) => !s.allowedClassifications.includes('self-reported') && !s.allowedClassifications.every((c) => c === 'inferred'));
    const self = daily.filter((s) => s.allowedClassifications.every((c) => c === 'self-reported'));
    const avg = (defs: SignalDefinition[]) => (defs.length ? mean(defs.map((s) => metrics[s.id]!.coverage14)) : 0);
    const recent = this.subject(id).records.filter((r) => r.missionDay <= day && r.missionDay > day - 14);
    const lowQ = recent.filter((r) => {
      const def = getSignal(r.signalId);
      return def ? rejectReason(r, def, DEFAULT_CONFIG.quality) !== null : false;
    }).length;
    return {
      astronautId: id,
      day,
      metrics,
      completeness: {
        overall: avg(daily),
        sensor: avg(sensor),
        selfReport: avg(self),
        lowQualityShare: recent.length ? lowQ / recent.length : 0,
      },
    };
  }

  series(id: AstronautId, signalIds: readonly string[], fromDay: number, toDay: number): SeriesResponse {
    const out: SeriesResponse = {};
    for (const signalId of signalIds) {
      const def = getSignal(signalId);
      const recs = this.subject(id).bySignal.get(signalId) ?? [];
      if (!def) continue;
      out[signalId] = recs
        .filter((r) => r.missionDay >= fromDay && r.missionDay <= toDay)
        // Physically impossible values are never charted; flagged (artefact / low quality) points are marked.
        .filter((r) => r.unit === def.unit && r.value >= def.plausibleRange[0] && r.value <= def.plausibleRange[1])
        .map((r) => ({
          day: r.missionDay,
          value: r.value,
          quality: r.quality.score,
          classification: r.classification,
          flagged: rejectReason(r, def, DEFAULT_CONFIG.quality) !== null,
        }));
    }
    return out;
  }

  assess(id: AstronautId, day: number): Assessment {
    const key = `${id}:${day}`;
    const hit = this.assessCache.get(key);
    if (hit) return hit;
    // P0: recorded requests for human support feed the engine's safety pathway.
    const safety = this.storage.safetyEvents(id);
    const a = evaluate({ records: this.subject(id).records, signals: this.signals, asOfDay: day, safety });
    this.assessCache.set(key, a);
    return a;
  }

  timeline(id: AstronautId): AssessmentTimeline {
    const hit = this.timelineCache.get(id);
    if (hit) return hit;
    const t = Array.from({ length: 180 }, (_, day) => ({ day, state: this.assess(id, day).state }));
    this.timelineCache.set(id, t);
    return t;
  }

  /** Drop cached assessments after new inputs (user records, safety events). */
  private readonly invalidationListeners: ((id: AstronautId) => void)[] = [];
  /** Phase 4: dependent caches (intelligence reports, features) subscribe here. */
  onInvalidate(fn: (id: AstronautId) => void): void {
    this.invalidationListeners.push(fn);
  }

  invalidate(id: AstronautId): void {
    for (const fn of this.invalidationListeners) fn(id);
    for (const k of [...this.assessCache.keys()]) if (k.startsWith(`${id}:`)) this.assessCache.delete(k);
    this.timelineCache.delete(id);
  }

  patterns(id: AstronautId, day: number): WellbeingPatterns {
    return wellbeingPatterns(this.subject(id).records, this.signals, day);
  }

  telemetry(id: AstronautId, day: number): TelemetryDay {
    const recs = this.subject(id).records.filter((r) => r.missionDay === day);
    return generateTelemetry(id, day, recs);
  }

  crewSummary(day: number): CrewSummary[] {
    return CREW_IDS.map((id) => {
      const snap = this.snapshot(id, day);
      return {
        astronautId: id,
        day,
        completeness: snap.completeness.overall,
        metrics: Object.fromEntries(
          CREW_SUMMARY_SIGNALS.map((s) => [s, { value: snap.metrics[s]?.value ?? null, z: snap.metrics[s]?.z ?? null }]),
        ),
      };
    });
  }
}
