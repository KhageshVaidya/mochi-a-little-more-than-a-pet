import {
  type ActionId,
  type Assessment,
  type AssessmentState,
  type Baseline,
  type Contributor,
  type DailySeries,
  type Detector,
  type EngineInput,
  type MlAdvisor,
  type Reason,
  type SignalDefinition,
  type SignalDomain,
} from '@orbital/contracts';
import { DEFAULT_CONFIG, type EngineConfig } from './config';
import { DEFAULT_DETECTORS, type DetectorCfg } from './detectors';
import { computeBaseline, hashJson, rejectReason, toDailySeries, type Rejection } from './stats';

export const ENGINE_VERSION = '0.6.0';

/**
 * SCND-inspired deterministic wellbeing engine.
 *
 *   P0 SAFETY → P1 DATA QUALITY → P2 SUFFICIENCY (terminal) → P3 DETECTORS → P4 RULES → P5 ML ADVISORY → P6 ASSEMBLY
 *
 * Pure and synchronous: identical (input, config) ⇒ identical Assessment. No clock, no randomness, no I/O.
 * The state is fixed after P4 and frozen; ML advisors receive a frozen snapshot and can only return advisories.
 */
export function evaluate(
  input: EngineInput,
  config: EngineConfig = DEFAULT_CONFIG,
  opts: { detectors?: readonly Detector<DetectorCfg>[]; advisors?: readonly MlAdvisor[]; profileId?: string } = {},
): Assessment {
  const cfg = config;
  const detectors = opts.detectors ?? DEFAULT_DETECTORS;
  const profileId = opts.profileId ?? 'brain-wellbeing';
  const asOf = input.asOfDay;
  const windowStart = asOf - cfg.window.days + 1;
  const reasons: Reason[] = [];
  const rulesFired: string[] = [];
  const brainSignals = input.signals.filter((s) => s.brainProfile);
  const domainsInScope = [...cfg.coreDomains, ...cfg.supportingDomains];

  // ── P0 SAFETY (independent pathway) ─────────────────────────────────────────
  const safety = input.safety.filter((s) => s.day <= asOf && s.day >= windowStart);
  const latestSafety = safety.at(-1);
  const escalation = latestSafety
    ? { id: `esc-${latestSafety.day}-${latestSafety.trigger}`, raisedAt: latestSafety.at, trigger: latestSafety.trigger, pathway: 'human-support' as const }
    : undefined;
  if (escalation) {
    rulesFired.push('P0-SAFETY-ESCALATION');
    reasons.push({ ruleId: 'P0-SAFETY-ESCALATION', tier: 'SAFETY', text: 'A request for human support was made. The human-support pathway has been opened.' });
  }

  // ── P1 DATA QUALITY ─────────────────────────────────────────────────────────
  const rejections: Record<Rejection, number> = { implausible: 0, 'unit-mismatch': 0, 'low-quality': 0, flagged: 0, duplicate: 0 };
  const bySignal = new Map<string, DailySeries>();
  const seen = new Set<string>();
  for (const def of brainSignals) {
    const recs = input.records.filter((r) => r.signalId === def.id && r.missionDay <= asOf);
    const reliable = recs.filter((r) => {
      if (seen.has(r.id)) {
        rejections.duplicate++;
        return false;
      }
      seen.add(r.id);
      const why = rejectReason(r, def, cfg.quality);
      if (why) rejections[why]++;
      return why === null;
    });
    bySignal.set(def.id, toDailySeries(def, reliable));
  }
  const rejectedTotal = Object.values(rejections).reduce((a, b) => a + b, 0);
  const issues: string[] = [];
  if (rejectedTotal > 0) {
    rulesFired.push('P1-DQ-EXCLUSIONS');
    const parts = (Object.entries(rejections) as [Rejection, number][]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    issues.push(`Excluded ${rejectedTotal} record(s): ${parts.join(', ')}.`);
  }

  // ── P2 SUFFICIENCY ──────────────────────────────────────────────────────────
  const baselines = new Map<string, Baseline>();
  const coverage: Record<string, number> = {};
  for (const [id, series] of bySignal) {
    const b = computeBaseline(series, cfg.baseline.startDay, cfg.baseline.endDay);
    if (b && b.n >= series.signal.baseline.minObservations) baselines.set(id, b);
    const from = Math.max(windowStart, cfg.baseline.endDay + 1);
    const span = Math.max(1, asOf - from + 1);
    const inWindow = series.points.filter((p) => p.day >= from && p.day <= asOf).length;
    coverage[id] = Math.min(1, inWindow / span);
  }
  const reliableDomains = domainsInScope.filter((dom) =>
    brainSignals.some((s) => s.domain === dom && baselines.has(s.id) && (coverage[s.id] ?? 0) >= cfg.sufficiency.minCoverage),
  );
  const window = { startDay: windowStart, endDay: asOf, baselineStartDay: cfg.baseline.startDay, baselineEndDay: cfg.baseline.endDay };
  const configHash = hashJson(cfg);
  const inputHash = hashJson({
    asOf,
    records: input.records.filter((r) => r.missionDay <= asOf).map((r) => [r.id, r.value, r.quality.score]),
    safety,
  });
  const dataQuality = { coverage, reliableDomains: reliableDomains.length, requiredDomains: cfg.sufficiency.requiredDomains, issues };

  let insufficient: string | null = null;
  if (asOf < cfg.baseline.endDay + cfg.window.persistenceDays) {
    insufficient = `Personal baseline period (days ${cfg.baseline.startDay}–${cfg.baseline.endDay}) plus one week of follow-up is not complete yet.`;
  } else if (reliableDomains.length < cfg.sufficiency.requiredDomains) {
    const missing = domainsInScope.filter((d) => !reliableDomains.includes(d));
    insufficient = `Only ${reliableDomains.length} of ${domainsInScope.length} domains have reliable data (needs ${cfg.sufficiency.requiredDomains}). Insufficient: ${missing.join(', ')}.`;
  }
  if (insufficient) {
    rulesFired.push('P2-SUFFICIENCY');
    reasons.push({ ruleId: 'P2-SUFFICIENCY', tier: 'SUFFICIENCY', text: insufficient });
    if (issues.length) reasons.push({ ruleId: 'P1-DQ-EXCLUSIONS', tier: 'DATA_QUALITY', text: issues[0]! });
    return freeze({
      profileId,
      state: 'INSUFFICIENT_DATA',
      reasons,
      contributors: [],
      window,
      dataQuality,
      uncertainty: { level: 'high', drivers: ['Insufficient reliable data for assessment.'] },
      suggestedAction: escalation ? 'human-support-now' : 'complete-checkins',
      advisories: [],
      escalation,
      trace: { engineVersion: ENGINE_VERSION, configHash, inputHash, rulesFired },
    });
  }

  // ── P3 DETECTORS (only on signals that passed P1/P2 — no "illegal moves") ───
  /** Runs P3 + the P4 rule conditions as of `day`, using only data up to that day. */
  const decideAt = (day: number) => {
    const wStart = day - cfg.window.days + 1;
    const contributors: Contributor[] = [];
    const findings = new Map<string, Contributor[]>();
    for (const [id, series] of bySignal) {
      const b = baselines.get(id);
      if (!b) continue;
      const from = Math.max(wStart, cfg.baseline.endDay + 1);
      const span = Math.max(1, day - from + 1);
      const cov = Math.min(1, series.points.filter((p) => p.day >= from && p.day <= day).length / span);
      if (cov < cfg.sufficiency.minCoverage) continue;
      const out = detectors.filter((d) => d.appliesTo(series.signal)).flatMap((d) => d.run(series, b, { asOfDay: day, cfg }));
      findings.set(id, out);
    }
    const sustained = new Map<SignalDomain, string[]>();
    const strongSingle = new Set<SignalDomain>();
    for (const [id, fs] of findings) {
      const def = bySignal.get(id)!.signal;
      const get = (m: Contributor['method']) => fs.find((f) => f.method === m);
      const pers = get('persistence');
      const ewma = get('ewma');
      const cusum = get('cusum');
      const z = get('z-score');
      const ewmaAlarm = !!ewma && ewma.statistic > ewma.threshold;
      const cusumAlarm = !!cusum && cusum.statistic >= cusum.threshold;
      const persistent = !!pers && pers.statistic >= cfg.detectors.persistenceMin;
      // Sustained = persistent AND both control charts agree (reduces coincidental single-day alarms).
      if (persistent && ewmaAlarm && cusumAlarm) {
        sustained.set(def.domain, [...(sustained.get(def.domain) ?? []), id]);
        for (const f of fs) if (f.method !== 'persistence' || persistent) contributors.push(f);
      } else if (z && z.statistic >= cfg.detectors.zWatch) {
        contributors.push(z); // notable but not sustained — shown as context
      }
      // Strong single-domain evidence: CUSUM alarm and z ≥ attention on ≥ N of the last 14 days.
      if (cusumAlarm) {
        const b = baselines.get(id)!;
        const series = bySignal.get(id)!;
        const strongDays = series.points.filter(
          (p) => p.day >= wStart && p.day <= day && (def.adverseDirection === 'up' ? (p.value - b.mean) / b.sd : def.adverseDirection === 'down' ? (b.mean - p.value) / b.sd : Math.abs(p.value - b.mean) / b.sd) >= cfg.detectors.zAttention,
        ).length;
        if (strongDays >= cfg.rules.singleDomainStrongDays) strongSingle.add(def.domain);
      }
    }
    const coreSustained = [...sustained.keys()].filter((d) => cfg.coreDomains.includes(d));
    const supportSustained = [...sustained.keys()].filter((d) => cfg.supportingDomains.includes(d));
    const rule: 'R-BRAIN-01' | 'R-BRAIN-02' | null =
      coreSustained.length >= cfg.rules.multiDomainMin ? 'R-BRAIN-01' : coreSustained.some((d) => strongSingle.has(d)) ? 'R-BRAIN-02' : null;
    return { contributors, findings, coreSustained, supportSustained, strongSingle, rule };
  };

  const today = decideAt(asOf);
  const { contributors, findings, coreSustained, supportSustained, strongSingle } = today;

  // ── P4 DECISION RULES (explicit precedence) ─────────────────────────────────
  // Confirmation (Phase 4 audit): a YES rule must hold on `confirmDays` consecutive evaluation days.
  // On held-out healthy synthetic astronauts most false YES runs lasted 1–2 days; this removes that flicker.
  const firstDecidable = cfg.baseline.endDay + cfg.window.persistenceDays;
  const confirmed =
    today.rule !== null &&
    Array.from({ length: cfg.rules.confirmDays - 1 }, (_, i) => asOf - 1 - i).every((d) => d >= firstDecidable && decideAt(d).rule !== null);
  let state: AssessmentState;
  if (today.rule === 'R-BRAIN-01' && confirmed) {
    state = 'YES';
    rulesFired.push('R-BRAIN-01');
    reasons.push({ ruleId: 'R-BRAIN-01', tier: 'DECISION', text: `Sustained change from personal baseline in ${coreSustained.length} wellbeing domains: ${coreSustained.join(', ')}.` });
  } else if (today.rule === 'R-BRAIN-02' && confirmed) {
    state = 'YES';
    rulesFired.push('R-BRAIN-02');
    const d = coreSustained.find((x) => strongSingle.has(x))!;
    reasons.push({ ruleId: 'R-BRAIN-02', tier: 'DECISION', text: `Strong, persistent change in one domain (${d}) on at least ${cfg.rules.singleDomainStrongDays} of the last ${cfg.window.days} days.` });
  } else if (today.rule !== null) {
    state = 'NO';
    rulesFired.push('R-BRAIN-CONFIRM');
    reasons.push({
      ruleId: 'R-BRAIN-CONFIRM',
      tier: 'DECISION',
      text: `A pattern meeting ${today.rule} was found today but has not yet held on ${cfg.rules.confirmDays} consecutive days, so no elevated signal is raised yet.`,
    });
  } else {
    state = 'NO';
    rulesFired.push('R-BRAIN-03');
    reasons.push({
      ruleId: 'R-BRAIN-03',
      tier: 'DECISION',
      text:
        coreSustained.length === 1
          ? `A sustained change was found in one domain (${coreSustained[0]}), below the threshold for an elevated signal.`
          : 'No sustained change from personal baseline was found in the reliable data.',
    });
  }
  if (supportSustained.length) {
    reasons.push({ ruleId: 'CTX-SUPPORTING', tier: 'STATISTICAL', text: `Supporting context: sustained change in ${supportSustained.join(', ')} (does not by itself raise the signal).` });
  }
  if (issues.length) reasons.push({ ruleId: 'P1-DQ-EXCLUSIONS', tier: 'DATA_QUALITY', text: issues[0]! });

  // ── P6 ASSEMBLY ─────────────────────────────────────────────────────────────
  const drivers: string[] = [];
  const reliableCov = Object.entries(coverage).filter(([id]) => baselines.has(id));
  if (reliableCov.some(([, c]) => c < 0.85 && c >= cfg.sufficiency.minCoverage)) drivers.push('Some domains have 70–85% data coverage.');
  if ([...baselines.values()].some((b) => b.n < 20)) drivers.push('Some baselines rest on fewer than 20 observations.');
  const contribSignals = new Set(contributors.map((c) => c.signalId));
  if (state === 'YES' && [...contribSignals].every((id) => bySignal.get(id)?.signal.allowedClassifications.every((c) => c === 'self-reported'))) {
    drivers.push('Evidence is entirely self-reported.');
  }
  const disagreement = [...findings.values()].some((fs) => {
    const e = fs.find((f) => f.method === 'ewma');
    const c = fs.find((f) => f.method === 'cusum');
    return !!e && !!c && e.statistic > e.threshold !== c.statistic >= c.threshold;
  });
  if (disagreement) drivers.push('EWMA and CUSUM disagree for at least one signal.');
  const level = drivers.length === 0 ? 'low' : drivers.length === 1 ? 'moderate' : 'high';

  const action: ActionId = escalation
    ? 'human-support-now'
    : state === 'YES'
      ? coreSustained.every((d) => d === 'sleep' || d === 'fatigue')
        ? 'review-sleep-workload'
        : 'private-conference'
      : 'routine-checkins';

  const core = {
    profileId,
    state,
    reasons,
    contributors: contributors.sort((a, b) => a.signalId.localeCompare(b.signalId) || a.method.localeCompare(b.method)),
    window,
    dataQuality,
    uncertainty: { level, drivers } as Assessment['uncertainty'],
    suggestedAction: action,
    escalation,
    trace: { engineVersion: ENGINE_VERSION, configHash, inputHash, rulesFired },
  };

  // ── P5 ML ADVISORY — receives a frozen snapshot; can only add advisories ────
  const snapshot = deepFreeze(structuredClone(core));
  const advisories = (opts.advisors ?? []).flatMap((a) => a.advise(snapshot, [...bySignal.values()]));
  return freeze({ ...core, state: snapshot.state, advisories });
}

function freeze(a: Assessment): Assessment {
  return deepFreeze(a);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

export type { SignalDefinition };
