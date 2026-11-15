import type { MetricSnapshot, SignalDefinition } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';

/** Display unit for a registry (UCUM-style) unit string. */
export function unitLabel(unit: string): string {
  return (
    { 'mm[Hg]': 'mmHg', '{score}': '/ 10', Cel: '°C', '{count}': '', '/min': 'br/min' } as Record<string, string>
  )[unit] ?? unit;
}

const DP: Record<string, number> = { bpm: 0, ms: 0, '/min': 1, Cel: 1, h: 1, min: 0, W: 0, mL: 0, kg: 1, L: 1, 'mg/dL': 0, 'mm[Hg]': 0, '{count}': 1 };

export function formatValue(value: number | null | undefined, signalId: string, opts: { precise?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const def = getSignal(signalId);
  let dp = def ? (DP[def.unit] ?? 1) : 1;
  if (def?.unit === '%') dp = signalId.startsWith('spo2') ? 1 : 0;
  if (def?.unit === '{score}') dp = def.id.endsWith('.index') ? 0 : 1;
  if (opts.precise) dp += 1;
  return value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatSigned(n: number, dp = 1): string {
  const s = n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return n > 0 ? `+${s}` : s;
}

/** Minimum baseline observations before σ-based status is shown. */
export const MIN_N_FOR_SIGMA = 10;

export type BaselineTone = 'within' | 'watch' | 'attention' | 'info' | 'none';

/**
 * Baseline semantics (never population "normal/abnormal"):
 * 7-day mean vs the personal baseline, in SDs, in the signal's adverse direction.
 */
export function baselineStatus(m: MetricSnapshot | undefined, def: SignalDefinition | undefined): { tone: BaselineTone; label: string; z: number | null } {
  if (!m || !def || !m.baseline) return { tone: 'none', label: 'No baseline yet', z: null };
  const v = m.mean7 ?? m.value;
  if (v === null) return { tone: 'none', label: 'No recent data', z: null };
  // Sparse signals (weekly/monthly): too few baseline observations for a trustworthy SD — compare by % change only.
  if (m.baseline.kind !== 'baseline' || m.baseline.n < MIN_N_FOR_SIGMA) {
    const pct = ((v - m.baseline.mean) / Math.abs(m.baseline.mean)) * 100;
    if (Math.abs(pct) < 3) return { tone: 'within', label: 'Close to reference', z: null };
    return { tone: 'info', label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs ${m.baseline.kind === 'first' ? 'first' : 'baseline'}`, z: null };
  }
  const z = (v - m.baseline.mean) / m.baseline.sd;
  const adverse = def.adverseDirection === 'up' ? z : def.adverseDirection === 'down' ? -z : Math.abs(z);
  const dir = z >= 0 ? 'Above' : 'Below';
  if (adverse >= 2) return { tone: 'attention', label: `${dir} baseline`, z };
  if (adverse >= 1) return { tone: 'watch', label: `${dir} baseline`, z };
  if (Math.abs(z) >= 1) return { tone: 'info', label: `${dir} baseline`, z };
  return { tone: 'within', label: 'Within baseline', z };
}
