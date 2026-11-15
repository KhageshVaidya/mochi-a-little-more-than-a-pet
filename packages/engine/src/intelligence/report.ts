import type {
  ApprovedOutputs,
  Assessment,
  HealthRecord,
  HrpRiskId,
  IntelligenceReport,
  MlAdvisoryBlock,
  SignalDefinition,
  SignalDomain,
  SignalQuality,
  StatisticalFinding,
} from '@orbital/contracts';
import { DEFAULT_CONFIG } from '../config';
import { ENGINE_VERSION } from '../evaluate';
import { computeBaseline, hashJson, rejectReason, toDailySeries } from '../stats';
import { TREND_SIGNALS, trendFinding } from './trend';

/**
 * Assembles the Phase 4 IntelligenceReport from: the deterministic Assessment (decision engine), the
 * statistical detectors' contributors, physical trend tests, per-signal data quality, and the ML advisory.
 *
 * Separation guarantees:
 *  - `decision` is copied from the Assessment unchanged.
 *  - `ml` is reported beside, never inside, the statistical findings.
 *  - `approved` (the recommendation engine's only input) is derived from the decision, statistical
 *    findings and data quality ONLY. Nothing from `ml` flows into it.
 */

const PHYSICAL_MONITOR = new Set(['hr.resting', 'hrv.rmssd', 'bp.systolic', 'bp.diastolic', 'spo2.nightly', 'resp.rate', 'activity.active-minutes', 'exercise.performance']);
const SCHEDULED = ['bp.systolic', 'body.mass', 'exercise.performance'];
const MEASUREMENT_OVERDUE_DAYS = 10;

export interface ReportInput {
  subjectId: string;
  records: readonly HealthRecord[];
  signals: readonly SignalDefinition[];
  asOfDay: number;
}

function reliableSeries(def: SignalDefinition, records: readonly HealthRecord[], asOf: number) {
  const recs = records.filter((r) => r.signalId === def.id && r.missionDay <= asOf);
  const reliable = recs.filter((r) => rejectReason(r, def, DEFAULT_CONFIG.quality) === null);
  return { recs, series: toDailySeries(def, reliable) };
}

export function signalQuality(def: SignalDefinition, records: readonly HealthRecord[], asOf: number): SignalQuality {
  const { recs, series } = reliableSeries(def, records, asOf);
  const from = asOf - 13;
  const recent = recs.filter((r) => r.missionDay >= from);
  const rejected = recent.length ? recent.filter((r) => rejectReason(r, def, DEFAULT_CONFIG.quality) !== null).length / recent.length : 0;
  const days = new Set(series.points.filter((p) => p.day >= from).map((p) => p.day));
  const expected = def.cadence === 'weekly' ? 2 : 14;
  const coverage = Math.min(1, days.size / expected);
  let gap = 0;
  let run = 0;
  const all = new Set(series.points.map((p) => p.day));
  for (let d = Math.max(0, asOf - 27); d <= asOf; d++) {
    run = all.has(d) ? 0 : run + 1;
    gap = Math.max(gap, run);
  }
  return { signalId: def.id, domain: def.domain, coverage: round(coverage), longestGapDays: def.cadence === 'weekly' ? Math.max(0, gap - 6) : gap, rejectedFraction: round(rejected), reliable: coverage >= DEFAULT_CONFIG.sufficiency.minCoverage };
}

const round = (x: number, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;

export function buildIntelligenceReport(input: ReportInput, assessment: Assessment, ml: MlAdvisoryBlock): IntelligenceReport {
  const { records, signals, asOfDay: asOf } = input;
  const byId = new Map(signals.map((s) => [s.id, s]));
  const findings: StatisticalFinding[] = [];
  const insufficient = assessment.state === 'INSUFFICIENT_DATA';

  // 1. Brain-profile detector output (from the Assessment's contributors).
  const bySignal = new Map<string, Assessment['contributors']>();
  for (const c of assessment.contributors) bySignal.set(c.signalId, [...(bySignal.get(c.signalId) ?? []), c]);
  for (const [signalId, cs] of bySignal) {
    const def = byId.get(signalId);
    if (!def) continue;
    const { series } = reliableSeries(def, records, asOf);
    const b = computeBaseline(series, DEFAULT_CONFIG.baseline.startDay, DEFAULT_CONFIG.baseline.endDay);
    const recent = series.points.filter((p) => p.day > asOf - 7);
    const mean7 = recent.length ? recent.reduce((a, p) => a + p.value, 0) / recent.length : null;
    const sustained = cs.some((c) => c.method === 'cusum') && cs.some((c) => c.method === 'ewma') && cs.some((c) => c.method === 'persistence');
    const cusum = cs.find((c) => c.method === 'cusum');
    const z = cs.find((c) => c.method === 'z-score');
    const main = sustained ? cusum! : z ?? cs[0]!;
    findings.push({
      id: `${sustained ? 'sustained' : 'notable'}:${signalId}:${asOf}`,
      kind: sustained ? 'sustained-change' : 'notable-deviation',
      domain: def.domain,
      signalId,
      method: sustained ? 'persistence + EWMA + CUSUM (all three agree)' : '7-day mean z-score vs personal baseline',
      window: { startDay: sustained ? assessment.window.startDay : asOf - 6, endDay: asOf },
      baseline: b ? { mean: b.mean, sd: b.sd, n: b.n, startDay: b.startDay, endDay: b.endDay } : null,
      recent: { mean: mean7, z: z?.statistic ?? null },
      statistic: main.statistic,
      threshold: main.threshold,
      direction: main.direction,
      adverse: true,
      ...(cs.find((c) => c.sinceDay !== undefined)?.sinceDay !== undefined ? { sinceDay: cs.find((c) => c.sinceDay !== undefined)!.sinceDay! } : {}),
    });
  }

  // 2. Physical monitoring (same rule as the monitor-tier alert: 7-day mean ≥ 2 SD adverse, n ≥ 10).
  for (const id of PHYSICAL_MONITOR) {
    const def = byId.get(id);
    if (!def || bySignal.has(id)) continue;
    const { series } = reliableSeries(def, records, asOf);
    const b = computeBaseline(series, DEFAULT_CONFIG.baseline.startDay, DEFAULT_CONFIG.baseline.endDay);
    if (!b || b.n < 10 || asOf <= b.endDay) continue;
    const recent = series.points.filter((p) => p.day > asOf - 7);
    if (!recent.length) continue;
    const m = recent.reduce((a, p) => a + p.value, 0) / recent.length;
    const zRaw = (m - b.mean) / b.sd;
    const adv = def.adverseDirection === 'up' ? zRaw : def.adverseDirection === 'down' ? -zRaw : Math.abs(zRaw);
    if (adv < 2) continue;
    findings.push({
      id: `notable:${id}:${asOf}`,
      kind: 'notable-deviation',
      domain: def.domain,
      signalId: id,
      method: '7-day mean z-score vs personal baseline',
      window: { startDay: asOf - 6, endDay: asOf },
      baseline: { mean: b.mean, sd: b.sd, n: b.n, startDay: b.startDay, endDay: b.endDay },
      recent: { mean: m, z: zRaw },
      statistic: adv,
      threshold: 2,
      direction: zRaw >= 0 ? 'up' : 'down',
      adverse: true,
    });
  }

  // 3. Longitudinal trends in physical signals.
  for (const id of TREND_SIGNALS) {
    const def = byId.get(id);
    if (!def) continue;
    const { series } = reliableSeries(def, records, asOf);
    const b = computeBaseline(series, DEFAULT_CONFIG.baseline.startDay, DEFAULT_CONFIG.baseline.endDay);
    if (!b || b.n < def.baseline.minObservations) continue;
    const f = trendFinding(series, b, asOf);
    if (f) findings.push(f);
  }

  // Data quality.
  const qualityIds = new Set([...signals.filter((s) => s.brainProfile).map((s) => s.id), ...TREND_SIGNALS, ...PHYSICAL_MONITOR, ...SCHEDULED]);
  const quality = [...qualityIds].map((id) => byId.get(id)).filter((d): d is SignalDefinition => !!d).map((d) => signalQuality(d, records, asOf));
  const daily = quality.filter((q) => byId.get(q.signalId)!.cadence !== 'weekly');
  const overallCoverage = round(daily.reduce((a, q) => a + q.coverage, 0) / Math.max(1, daily.length));

  // Approved outputs — decision, statistical findings and data quality only (never ML).
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const sustainedDomains = insufficient ? [] : uniq(findings.filter((f) => f.kind === 'sustained-change').map((f) => f.domain));
  const notableDomains = insufficient ? [] : uniq(findings.filter((f) => f.kind === 'notable-deviation').map((f) => f.domain)).filter((d) => !sustainedDomains.includes(d));
  const brainDomains = [...DEFAULT_CONFIG.coreDomains] as SignalDomain[];
  const lowCoverageDomains = brainDomains.filter((dom) => {
    const qs = quality.filter((q) => q.domain === dom);
    return qs.length > 0 && qs.every((q) => !q.reliable);
  });
  const overdueMeasurements = SCHEDULED.filter((id) => {
    const def = byId.get(id);
    if (!def || asOf < MEASUREMENT_OVERDUE_DAYS) return false;
    const { series } = reliableSeries(def, records, asOf);
    return !series.points.some((p) => p.day > asOf - MEASUREMENT_OVERDUE_DAYS);
  });
  const approved: ApprovedOutputs = {
    day: asOf,
    decisionState: assessment.state,
    escalation: !!assessment.escalation,
    sustainedDomains,
    domainOnsetDays: Object.fromEntries(
      sustainedDomains.map((d) => [d, Math.min(...findings.filter((f) => f.kind === 'sustained-change' && f.domain === d).map((f) => f.sinceDay ?? asOf))]),
    ),
    notableDomains,
    physicalTrendSignals: insufficient ? [] : uniq(findings.filter((f) => f.kind === 'longitudinal-trend').map((f) => f.signalId)),
    dataGaps: { overdueMeasurements, lowCoverageDomains },
  };

  // Uncertainty: the decision engine's drivers, plus transparency notes. The ML can add a note, never change state.
  const drivers = [...assessment.uncertainty.drivers];
  if (ml.status === 'alarm' && assessment.state === 'NO') drivers.push('Advisory note: the ML anomaly detector flags recent days although the deterministic rules found no sustained change.');
  if (ml.status === 'no-alarm' && assessment.state === 'YES') drivers.push('Advisory note: the ML anomaly detector does not flag the most recent days.');
  if (overallCoverage < 0.85) drivers.push(`Daily-signal coverage over the last 14 days is ${Math.round(overallCoverage * 100)}%.`);
  const level = assessment.state === 'INSUFFICIENT_DATA' ? 'high' : drivers.length === 0 ? 'low' : drivers.length <= 1 ? 'moderate' : 'high';

  const risks = uniq(findings.flatMap((f) => byId.get(f.signalId)?.hrpRisks ?? [])) as HrpRiskId[];
  return {
    subjectId: input.subjectId,
    day: asOf,
    decision: { state: assessment.state, rulesFired: [...assessment.trace.rulesFired], reasons: [...assessment.reasons], suggestedAction: assessment.suggestedAction },
    statistical: findings.sort((a, b) => order(a.kind) - order(b.kind) || a.signalId.localeCompare(b.signalId)),
    ml,
    dataQuality: { overallCoverage, signals: quality, issues: [...assessment.dataQuality.issues] },
    uncertainty: { level, drivers },
    nasaRiskIds: risks.sort(),
    approved,
    trace: { engineVersion: ENGINE_VERSION, configHash: hashJson(DEFAULT_CONFIG), modelHash: ml.modelHash },
  };
}

const order = (k: StatisticalFinding['kind']) => ({ 'sustained-change': 0, 'longitudinal-trend': 1, 'notable-deviation': 2 })[k];
