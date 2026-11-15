import type { SeriesPoint, Snapshot } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { baselineStatus } from './format';

/**
 * Deterministic, rule-based recommendations derived from the snapshot (alerts now come from the engine's
 * tiered deriveAlerts via the main process).
 * Copy is supportive and invitational — never shaming, never diagnostic.
 */

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
}

export function deriveRecommendations(snap: Snapshot | null): Recommendation[] {
  if (!snap) return [];
  const recs: Recommendation[] = [];
  const st = (id: string) => baselineStatus(snap.metrics[id], getSignal(id));
  const sleep = st('sleep.duration');
  if ((sleep.z ?? 0) <= -1) recs.push({ id: 'sleep', title: 'Protect tonight’s sleep window', detail: 'Recent sleep is shorter than your usual. Dim lights and screens an hour before your sleep period.' });
  const hrv = st('hrv.rmssd');
  if ((hrv.z ?? 0) <= -1) recs.push({ id: 'recovery', title: 'Make room for recovery', detail: 'HRV is lower than your baseline. A lighter session or a mindfulness break may help today.' });
  const hyd = snap.metrics['hydration.intake'];
  if (hyd?.mean7 != null && hyd.baseline && hyd.mean7 < hyd.baseline.mean * 0.92)
    recs.push({ id: 'hydration', title: 'Keep a drink within reach', detail: 'Logged fluid intake is below your usual. Thirst can be less noticeable in microgravity.' });
  const act = st('activity.active-minutes');
  if ((act.z ?? 0) <= -1) recs.push({ id: 'move', title: 'Fit in your scheduled exercise', detail: 'Activity has been lower than usual. Your prescribed session counts — there is no benefit in going beyond it.' });
  if (snap.completeness.selfReport < 0.75) recs.push({ id: 'checkin', title: 'Complete today’s check-in', detail: 'It takes about two minutes and keeps your personal baseline reliable.' });
  if (recs.length === 0) recs.push({ id: 'routine', title: 'Keep your routine', detail: 'Your indicators are close to your personal baseline. Rest days count too.' });
  return recs.slice(0, 4);
}

/** 7-day rolling mean, standardised against the snapshot's baseline, for each mission day up to `day`. */
export function rollingZ(points: readonly SeriesPoint[] | undefined, mean: number, sd: number, day: number, signFlip = false) {
  const reliable = (points ?? []).filter((p) => !p.flagged);
  return Array.from({ length: day + 1 }, (_, d) => {
    const w = reliable.filter((p) => p.day <= d && p.day > d - 7);
    if (w.length < 3 || d < 37) return { day: d, z: null };
    const m = w.reduce((a, p) => a + p.value, 0) / w.length;
    const z = (m - mean) / sd;
    return { day: d, z: Math.max(-4, Math.min(4, signFlip ? -z : z)) };
  });
}
