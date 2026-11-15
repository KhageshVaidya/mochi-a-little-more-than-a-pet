import type { Advisory, Assessment, AssessmentState, Contributor } from './assessment';
import type { HealthRecord } from './records';
import type { SignalDefinition, SignalDomain } from './signals';

/**
 * Engine plugin interfaces (Workstream C implements; others only consume).
 * Design: docs/architecture-plan.md §4.
 */

export interface EngineInput {
  records: readonly HealthRecord[];
  signals: readonly SignalDefinition[];
  /** Mission day the assessment is computed for. The engine has no clock of its own. */
  asOfDay: number;
  /** Safety-pathway inputs (check-in talk request / safety item). */
  safety: readonly { day: number; trigger: 'talk-request' | 'safety-item'; at: string }[];
}

export interface Baseline {
  signalId: string;
  n: number;
  mean: number;
  sd: number;
  median: number;
  mad: number;
  startDay: number;
  endDay: number;
}

export interface DailySeries {
  signal: SignalDefinition;
  /** One reliable value per mission day (after P1 data-quality filtering). Missing days are absent, never imputed. */
  points: readonly { day: number; value: number }[];
}

/** P3 statistical detector — a "piece" that can be added without modifying the engine. */
export interface Detector<Cfg = unknown> {
  readonly id: string;
  appliesTo(signal: SignalDefinition): boolean;
  run(series: DailySeries, baseline: Baseline, cfg: Cfg): Contributor[];
}

/** P4 decision rule — declarative and ordered by precedence. */
export interface DecisionRule {
  readonly id: string;
  readonly precedence: number;
  readonly description: string;
  when(ctx: DecisionContext): boolean;
  readonly then: Exclude<AssessmentState, 'INSUFFICIENT_DATA'>;
}

export interface DecisionContext {
  readonly contributors: readonly Contributor[];
  readonly domainsWithSustainedFinding: readonly SignalDomain[];
}

/**
 * P5 ML advisory. It receives a frozen snapshot and can only return advisories.
 * Its type cannot express a state change.
 */
export interface MlAdvisor {
  readonly id: string;
  advise(snapshot: Readonly<Omit<Assessment, 'advisories'>>, series: readonly DailySeries[]): Advisory[];
}

export interface AssessmentProfile {
  id: string; // e.g. 'brain-wellbeing'
  label: string;
  domains: readonly SignalDomain[];
  requiredDomains: number;
  windowDays: number;
  rules: readonly DecisionRule[];
}

/** Optional natural-language explainer. Never in the critical decision path. */
export interface Explainer {
  readonly id: string;
  explain(assessment: Assessment): string;
}
