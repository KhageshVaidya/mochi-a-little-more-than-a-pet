import type { AlertItem, Assessment, MetricSnapshot, SignalDefinition } from '@orbital/contracts';

/**
 * Deterministic alert generation with explicit tiers (docs/privacy-and-crew-wellbeing.md §4).
 * Precedence: urgent > human-review > monitor > routine. Pure: same inputs ⇒ same alerts.
 * Urgent alerts carry fixed, serious wording. No language model participates.
 */

export interface AlertInputs {
  day: number;
  assessment: Assessment;
  metrics: Record<string, MetricSnapshot>;
  signals: readonly SignalDefinition[];
  completeness: number;
  measurementDue: boolean;
}

const PHYSICAL_DOMAINS = new Set(['cardiovascular', 'respiratory', 'thermal', 'sleep', 'activity', 'metabolic']);
const MIN_N_FOR_SIGMA = 10;

export function deriveAlerts(i: AlertInputs): AlertItem[] {
  const out: AlertItem[] = [];
  const a = i.assessment;

  if (a.escalation) {
    out.push({
      id: `urgent:${a.escalation.id}`,
      tier: 'urgent',
      ruleId: 'A-URGENT-SAFETY',
      title: 'Human support requested',
      detail: 'The human-support pathway is open. Crew-support contacts can reach you; contact them directly if you are in immediate danger.',
      day: i.day,
      reasons: [`Trigger: ${a.escalation.trigger === 'talk-request' ? 'request to talk to someone' : 'safety phrase'} at ${a.escalation.raisedAt}`],
      section: 'support',
    });
  }

  if (a.state === 'YES') {
    out.push({
      id: `review:${i.day}`,
      tier: 'human-review',
      ruleId: 'A-HUMAN-REVIEW',
      title: 'A private conversation is recommended',
      detail: 'The wellbeing monitor found sustained changes from your personal baseline. This is a pattern in data, not a diagnosis. You decide whether to share the report.',
      day: i.day,
      reasons: a.reasons.filter((r) => r.tier === 'DECISION').map((r) => `${r.ruleId}: ${r.text}`),
      section: 'brain',
      signalIds: [...new Set(a.contributors.map((c) => c.signalId))].sort(),
    });
  }

  for (const def of i.signals) {
    if (!PHYSICAL_DOMAINS.has(def.domain) || def.allowedClassifications.every((c) => c === 'self-reported' || c === 'inferred')) continue;
    const m = i.metrics[def.id];
    if (!m?.baseline || m.baseline.kind !== 'baseline' || m.baseline.n < MIN_N_FOR_SIGMA || m.mean7 === null) continue;
    const z = (m.mean7 - m.baseline.mean) / m.baseline.sd;
    const adverse = def.adverseDirection === 'up' ? z : def.adverseDirection === 'down' ? -z : Math.abs(z);
    if (adverse >= 2) {
      out.push({
        id: `monitor:${def.id}:${i.day}`,
        tier: 'monitor',
        ruleId: 'A-MONITOR-PHYSICAL',
        title: `${def.label} ${z >= 0 ? 'above' : 'below'} your baseline`,
        detail: `7-day mean is ${Math.abs(z).toFixed(1)} SD from your personal baseline (days ${m.baseline.startDay}–${m.baseline.endDay}).`,
        day: i.day,
        reasons: [`${def.id}: 7-day mean ${m.mean7.toFixed(1)} vs baseline ${m.baseline.mean.toFixed(1)} ± ${m.baseline.sd.toFixed(1)}`],
        section: 'physical',
        signalIds: [def.id],
      });
    }
  }

  if (i.completeness < 0.7) {
    out.push({
      id: `monitor:completeness:${i.day}`,
      tier: 'monitor',
      ruleId: 'A-MONITOR-DATA',
      title: 'Data are incomplete',
      detail: `${Math.round(i.completeness * 100)}% of expected readings in the last 14 days. Some assessments may be unavailable.`,
      day: i.day,
      reasons: ['Completeness below 70% over 14 days'],
      section: 'reports',
    });
  }

  if (i.measurementDue) {
    out.push({ id: `routine:measure:${i.day}`, tier: 'routine', ruleId: 'A-ROUTINE-MEASURE', title: 'Measurement day', detail: 'Blood pressure, mass and the weekly fitness test are scheduled today.', day: i.day, reasons: ['Weekly schedule'], section: 'challenges' });
  }
  const sleep = i.metrics['sleep.duration'];
  if (sleep?.baseline?.kind === 'baseline' && sleep.mean7 !== null && (sleep.mean7 - sleep.baseline.mean) / sleep.baseline.sd <= -1) {
    out.push({ id: `routine:sleep:${i.day}`, tier: 'routine', ruleId: 'A-ROUTINE-SLEEP', title: 'A cosy evening might help', detail: 'Recent sleep has been shorter than your usual.', day: i.day, reasons: ['sleep.duration 7-day mean ≥ 1 SD below baseline'], section: 'physical', signalIds: ['sleep.duration'] });
  }

  const order = { urgent: 0, 'human-review': 1, monitor: 2, routine: 3 } as const;
  return out.sort((x, y) => order[x.tier] - order[y.tier] || x.id.localeCompare(y.id));
}
