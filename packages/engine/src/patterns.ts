import type { HealthRecord, SignalDefinition, WellbeingPatterns } from '@orbital/contracts';
import { DEFAULT_CONFIG } from './config';
import { computeBaseline, rejectReason, toDailySeries } from './stats';

/**
 * Longitudinal wellbeing pattern analysis (Phase 2 C2). Reports OBSERVABLE patterns relative to the
 * person's own baseline, with uncertainty. It never infers a condition, and never reads journal text.
 */

const LAYER = (d: SignalDefinition): 'physiological' | 'cognitive' | 'self-report' =>
  d.allowedClassifications.every((c) => c === 'self-reported') ? 'self-report' : d.domain === 'cognition' ? 'cognitive' : 'physiological';

const PHRASE: Record<string, [string, string]> = {
  'sleep.quality': ['improved sleep quality', 'reduced sleep quality'],
  'sleep.duration': ['longer sleep', 'shorter sleep'],
  'sleep.efficiency': ['more efficient sleep', 'less efficient sleep'],
  'mood.vas': ['higher self-reported mood', 'lower self-reported mood'],
  'stress.vas': ['increased self-reported stress', 'lower self-reported stress'],
  'fatigue.vas': ['increased self-reported fatigue', 'lower self-reported fatigue'],
  'isolation.vas': ['increased perceived isolation', 'lower perceived isolation'],
  'motivation.vas': ['higher self-reported motivation', 'lower self-reported motivation'],
  'cog.rt.median': ['slower reaction times', 'faster reaction times'],
  'cog.rt.lapses': ['more attention lapses', 'fewer attention lapses'],
  'cog.memory.accuracy': ['higher memory accuracy', 'lower memory accuracy'],
  'cog.concentration': ['higher self-reported concentration', 'lower self-reported concentration'],
  'activity.active-minutes': ['more activity', 'less activity'],
};

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let k = 0; k < n; k++) {
    num += (a[k]! - ma) * (b[k]! - mb);
    da += (a[k]! - ma) ** 2;
    db += (b[k]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export function wellbeingPatterns(records: readonly HealthRecord[], signals: readonly SignalDefinition[], day: number, windowDays = 7): WellbeingPatterns {
  const brain = signals.filter((s) => s.brainProfile);
  const series = new Map(brain.map((def) => [def.id, toDailySeries(def, records.filter((r) => r.signalId === def.id && r.missionDay <= day && rejectReason(r, def, DEFAULT_CONFIG.quality) === null))]));
  const { startDay, endDay } = DEFAULT_CONFIG.baseline;
  const changes: WellbeingPatterns['changes'] = [];
  for (const def of brain) {
    const s = series.get(def.id)!;
    const b = computeBaseline(s, startDay, endDay);
    if (!b || b.n < def.baseline.minObservations || day <= endDay) continue;
    const recent = s.points.filter((p) => p.day > day - windowDays);
    if (recent.length < Math.ceil(windowDays * 0.6)) continue;
    const z7 = (recent.reduce((x, p) => x + p.value, 0) / recent.length - b.mean) / b.sd;
    const adverse = def.adverseDirection === 'up' ? z7 : def.adverseDirection === 'down' ? -z7 : Math.abs(z7);
    if (adverse >= 1.5 && PHRASE[def.id]) {
      // PHRASE[0] = "higher/up" wording, [1] = "lower/down" wording.
      changes.push({ signalId: def.id, label: def.label, phrase: z7 >= 0 ? PHRASE[def.id]![0] : PHRASE[def.id]![1], z7, layer: LAYER(def) });
    }
  }
  changes.sort((x, y) => Math.abs(y.z7) - Math.abs(x.z7));
  const list = changes.slice(0, 4).map((c) => c.phrase);
  const summary =
    list.length >= 2
      ? `Several changes have appeared together over the last ${windowDays} days: ${list.slice(0, -1).join(', ')} and ${list.at(-1)}.`
      : list.length === 1
        ? `One change stands out over the last ${windowDays} days: ${list[0]}.`
        : null;

  // Relationships over the last 28 days (paired days only), stated descriptively.
  const pairs: [string, string, string][] = [
    ['sleep.quality', 'mood.vas', 'sleep quality and mood'],
    ['stress.vas', 'fatigue.vas', 'stress and fatigue'],
    ['sleep.duration', 'cog.rt.median', 'sleep duration and reaction time'],
  ];
  const relationships: WellbeingPatterns['relationships'] = [];
  for (const [a, b, name] of pairs) {
    const sa = new Map(series.get(a)?.points.filter((p) => p.day > day - 28).map((p) => [p.day, p.value]));
    const sb = series.get(b)?.points.filter((p) => p.day > day - 28 && sa.has(p.day)) ?? [];
    if (sb.length < 14) continue;
    const r = pearson(sb.map((p) => sa.get(p.day)!), sb.map((p) => p.value));
    const strength = Math.abs(r) >= 0.5 ? 'moved together strongly' : Math.abs(r) >= 0.3 ? 'moved together moderately' : 'showed little consistent relationship';
    relationships.push({ a, b, r: +r.toFixed(2), n: sb.length, statement: `Over the last 28 days, ${name} ${strength} (r = ${r.toFixed(2)}, ${sb.length} paired days). Correlation is not causation.` });
  }

  // Voluntary check-in pattern: completion rate recently vs the baseline window (neutral wording).
  const mood = series.get('mood.vas')!;
  const rate = (from: number, to: number) => mood.points.filter((p) => p.day >= from && p.day <= to).length / Math.max(1, to - from + 1);
  const recentRate = rate(Math.max(0, day - 13), day);
  const baselineRate = rate(startDay, endDay);
  const checkinStatement =
    day > endDay && baselineRate - recentRate >= 0.25 ? `Fewer check-ins than earlier in the mission (${Math.round(recentRate * 100)}% of the last 14 days vs ${Math.round(baselineRate * 100)}%). This can have many ordinary reasons.` : null;

  // Repeated self-reported difficulty: days in the last 14 with stress ≥ baseline + 2 SD.
  const st = series.get('stress.vas')!;
  const sb = computeBaseline(st, startDay, endDay);
  const last14 = st.points.filter((p) => p.day > day - 14);
  const hard = sb ? last14.filter((p) => (p.value - sb.mean) / sb.sd >= 2).length : 0;
  const repeatedStatement = hard >= 5 ? `High self-reported stress on ${hard} of the last ${last14.length} reported days.` : null;

  return {
    day,
    windowDays,
    summary,
    changes,
    relationships,
    checkinPattern: { recentRate, baselineRate, statement: checkinStatement },
    repeatedDifficulties: { days: hard, of: last14.length, statement: repeatedStatement },
    uncertainty:
      'These are statistical observations relative to your own baseline (days 10–37), using thresholds that are not clinically validated. Several indicators are self-reported. They describe what changed, not why.',
  };
}
