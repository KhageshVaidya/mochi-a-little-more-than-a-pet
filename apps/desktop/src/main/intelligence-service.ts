import type { ActivityRestrictions, AstronautId, IntelligenceReport, Recommendation, RecommendationSet } from '@orbital/contracts';
import { ActivityRestrictions as RestrictionsSchema } from '@orbital/contracts';
import { buildIntelligenceReport, extractDailyFeatures, mlAdvisoryBlock, trainModel, type DailyFeatures, type TrainedModel } from '@orbital/engine';
import { recommend } from '@orbital/recommendations';
import { allSignals } from '@orbital/signals';
import { generateVirtualMission, trainingCohortSpecs } from '@orbital/simulation';
import type { DataService } from './data-service';
import type { Storage } from './storage';

/**
 * Phase 4 integration (main process): intelligence engine → decision engine → recommendation engine.
 *
 *  - The Isolation Forest is trained once, deterministically, from the healthy synthetic training cohort
 *    (seeds 900_001–900_040; never the named crew). ~0.5 s. Its hash is reported with every result.
 *  - The deterministic Assessment comes from DataService unchanged; the ML block sits beside it.
 *  - Recommendations are computed ONLY from the report's ApprovedOutputs and are persisted per day
 *    when offered, so adaptive missions (and their progress) survive restarts.
 */
export class IntelligenceService {
  private model: TrainedModel | null = null;
  private readonly signals = allSignals();
  private readonly features = new Map<AstronautId, DailyFeatures>();
  private readonly reports = new Map<string, IntelligenceReport>();

  constructor(
    private readonly data: DataService,
    private readonly storage: Storage,
  ) {}

  /** Lazily train (deterministic). */
  ml(): TrainedModel {
    this.model ??= trainModel(trainingCohortSpecs().map((s) => ({ seed: s.seed, records: generateVirtualMission(s).records })), this.signals);
    return this.model;
  }

  /** Drop caches after new inputs (user records, safety events). */
  invalidate(id: AstronautId): void {
    this.features.delete(id);
    for (const k of [...this.reports.keys()]) if (k.startsWith(`${id}:`)) this.reports.delete(k);
  }

  report(id: AstronautId, day: number): IntelligenceReport {
    const key = `${id}:${day}`;
    const hit = this.reports.get(key);
    if (hit) return hit;
    const records = this.data.records(id);
    let feats = this.features.get(id);
    if (!feats) {
      feats = extractDailyFeatures(records, this.signals);
      this.features.set(id, feats);
    }
    const assessment = this.data.assess(id, day);
    const r = buildIntelligenceReport({ subjectId: id, records, signals: this.signals, asOfDay: day }, assessment, mlAdvisoryBlock(this.ml(), feats, day));
    this.reports.set(key, r);
    return r;
  }

  restrictions(id: AstronautId): ActivityRestrictions {
    return RestrictionsSchema.parse(this.storage.getJSON<ActivityRestrictions>(`restrictions.${id}`) ?? {});
  }
  setRestrictions(id: AstronautId, r: ActivityRestrictions): ActivityRestrictions {
    this.storage.setJSON(`restrictions.${id}`, RestrictionsSchema.parse(r));
    // Re-plan only today's and future offers; past offers (and their completed missions) are kept.
    return this.restrictions(id);
  }

  /** Today's recommendations (computed from approved outputs only), persisted as offered. */
  recommendations(id: AstronautId, day: number): RecommendationSet {
    const set = recommend(this.report(id, day).approved, { restDay: day % 7 === 6, restrictions: this.restrictions(id) });
    const offers = this.storage.getJSON<Record<string, Recommendation[]>>(`recs.${id}`) ?? {};
    if (JSON.stringify(offers[day] ?? null) !== JSON.stringify(set.recommendations)) {
      offers[day] = set.recommendations;
      this.storage.setJSON(`recs.${id}`, offers);
    }
    return set;
  }

  /** All persisted offers for one astronaut (day → recommendations). */
  offeredAll(id: AstronautId): Record<string, Recommendation[]> {
    return this.storage.getJSON<Record<string, Recommendation[]>>(`recs.${id}`) ?? {};
  }

  /** Recommendations previously offered on a day (empty if none were offered). */
  offered(id: AstronautId, day: number): Recommendation[] {
    return this.storage.getJSON<Record<string, Recommendation[]>>(`recs.${id}`)?.[day] ?? [];
  }
}
