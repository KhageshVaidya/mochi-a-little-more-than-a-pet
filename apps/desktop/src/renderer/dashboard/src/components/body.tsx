import type { MetricSnapshot, Snapshot } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { formatSigned, formatValue } from '../lib/format';
import { cn } from '../lib/cn';

/**
 * Body composition views. All values are SYNTHETIC bioimpedance estimates (classification: inferred).
 * Changes are shown relative to the first (pre-/launch-day) measurement — not against population ranges.
 */

type SegKey = 'arm-right' | 'arm-left' | 'trunk' | 'leg-right' | 'leg-left';
const SEG_LABEL: Record<SegKey, string> = {
  'arm-right': 'Right arm',
  'arm-left': 'Left arm',
  trunk: 'Trunk',
  'leg-right': 'Right leg',
  'leg-left': 'Left leg',
};

function change(m: MetricSnapshot | undefined): number | null {
  return m?.value != null && m.baseline ? ((m.value - m.baseline.mean) / m.baseline.mean) * 100 : null;
}

function tone(pct: number | null): { fill: string; stroke: string; label: string } {
  if (pct === null) return { fill: 'var(--o-surface-2)', stroke: 'var(--o-line-strong)', label: 'No data' };
  if (pct <= -3) return { fill: 'var(--o-attention-soft)', stroke: 'var(--o-attention)', label: 'Marked decrease' };
  if (pct <= -1) return { fill: 'var(--o-watch-soft)', stroke: 'var(--o-watch)', label: 'Decrease' };
  if (pct >= 1) return { fill: 'var(--o-teal-soft)', stroke: 'var(--o-teal)', label: 'Increase' };
  return { fill: 'var(--o-surface-3)', stroke: 'var(--o-line-strong)', label: 'Stable' };
}

function Callout({ seg, snap, align }: { seg: SegKey; snap: Snapshot; align: 'left' | 'right' }) {
  const m = snap.metrics[`body.segment.${seg}`];
  const pct = change(m);
  const t = tone(pct);
  return (
    <div className={cn('py-1', align === 'right' ? 'text-right' : 'text-left')}>
      <p className="t-caption text-ink-3">{SEG_LABEL[seg]}</p>
      <p className="t-headline tabular text-ink">
        <span className="text-ink-3">≈</span>
        {formatValue(m?.value, `body.segment.${seg}`)} <span className="t-caption font-normal text-ink-3">kg</span>
      </p>
      <p className="t-caption tabular" style={{ color: pct !== null && Math.abs(pct) >= 1 ? t.stroke : 'var(--o-ink-3)' }}>
        {pct === null ? '—' : `${formatSigned(pct)}% · ${t.label}`}
      </p>
    </div>
  );
}

export function SegmentalFigure({ snap }: { snap: Snapshot }) {
  const t = (seg: SegKey) => tone(change(snap.metrics[`body.segment.${seg}`]));
  const seg = (k: SegKey) => ({ fill: t(k).fill, stroke: t(k).stroke, strokeWidth: 1.5 });
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col gap-14">
          <Callout seg="arm-right" snap={snap} align="right" />
          <Callout seg="leg-right" snap={snap} align="right" />
        </div>
        <svg viewBox="0 0 200 330" width="170" height="280" role="img" aria-label="Segmental lean mass change since first measurement (front view)">
          <circle cx="100" cy="30" r="20" fill="var(--o-surface-2)" stroke="var(--o-line-strong)" strokeWidth="1.5" />
          <rect x="88" y="50" width="24" height="12" rx="5" fill="var(--o-surface-2)" />
          <rect x="68" y="60" width="64" height="112" rx="22" {...seg('trunk')} />
          <rect x="40" y="64" width="22" height="108" rx="11" transform="rotate(7 51 64)" {...seg('arm-right')} />
          <rect x="138" y="64" width="22" height="108" rx="11" transform="rotate(-7 149 64)" {...seg('arm-left')} />
          <rect x="70" y="178" width="27" height="140" rx="13" {...seg('leg-right')} />
          <rect x="103" y="178" width="27" height="140" rx="13" {...seg('leg-left')} />
          <text x="100" y="122" textAnchor="middle" fontSize="11" fill="var(--o-ink-2)">
            {(() => {
              const pct = change(snap.metrics['body.segment.trunk']);
              return pct === null ? '—' : `${formatSigned(pct)}%`;
            })()}
          </text>
        </svg>
        <div className="flex flex-col gap-14">
          <Callout seg="arm-left" snap={snap} align="left" />
          <Callout seg="leg-left" snap={snap} align="left" />
        </div>
      </div>
      <div className="mt-2 text-center">
        <Callout seg="trunk" snap={snap} align="left" />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {[tone(0), tone(-2), tone(-4), tone(2)].map((x) => (
          <span key={x.label} className="t-caption inline-flex items-center gap-1.5 text-ink-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border" style={{ background: x.fill, borderColor: x.stroke }} />
            {x.label}
          </span>
        ))}
      </div>
      <p className="t-caption mt-3 text-center text-ink-3">
        Front view · change in lean mass since first measurement · segmental values are inferred, not measured.
      </p>
    </div>
  );
}

export const BODY_SIGNALS = ['body.mass', 'body.lean-mass', 'body.fat-mass', 'body.muscle-mass', 'body.skeletal-muscle', 'body.water'] as const;

export function CompositionTable({ snap }: { snap: Snapshot }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="t-caption text-left text-ink-3">
          <th className="pb-2 font-medium">Measure</th>
          <th className="pb-2 text-right font-medium">Current</th>
          <th className="pb-2 text-right font-medium">Reference</th>
          <th className="pb-2 text-right font-medium">Change</th>
          <th className="pb-2 pl-4 font-medium">Type</th>
        </tr>
      </thead>
      <tbody>
        {BODY_SIGNALS.map((id) => {
          const m = snap.metrics[id];
          const def = getSignal(id)!;
          const delta = m?.value != null && m.baseline ? m.value - m.baseline.mean : null;
          return (
            <tr key={id} className="t-footnote border-t border-line">
              <td className="py-2.5 text-ink">{def.label}</td>
              <td className="py-2.5 text-right tabular font-medium text-ink">
                {m?.classification === 'inferred' && m.value != null && <span className="text-ink-3">≈</span>}
                {formatValue(m?.value, id)} {def.unit}
              </td>
              <td className="py-2.5 text-right tabular text-ink-3">
                {formatValue(m?.baseline?.mean, id)} {m?.baseline ? `(d${m.baseline.startDay}${m.baseline.kind === 'baseline' ? `–${m.baseline.endDay}` : ''})` : ''}
              </td>
              <td className="py-2.5 text-right tabular text-ink-2">
                {delta === null ? '—' : `${formatSigned(delta)} ${def.unit} (${formatSigned((delta / m!.baseline!.mean) * 100)}%)`}
              </td>
              <td className="t-caption py-2.5 pl-4 text-ink-3 capitalize">{m?.classification ?? def.allowedClassifications[0]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Two-segment stacked bars (fat-free vs fat) at first measurement and now, with 2px surface gap. */
export function CompositionSplit({ snap }: { snap: Snapshot }) {
  const lean = snap.metrics['body.lean-mass'];
  const fat = snap.metrics['body.fat-mass'];
  const rows = [
    { label: `First (day ${lean?.baseline?.startDay ?? 0})`, lean: lean?.baseline?.mean, fat: fat?.baseline?.mean },
    { label: `Latest (day ${lean?.observedDay ?? '—'})`, lean: lean?.value ?? undefined, fat: fat?.value ?? undefined },
  ];
  const max = Math.max(...rows.map((r) => (r.lean ?? 0) + (r.fat ?? 0)), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="t-caption mb-1 flex justify-between text-ink-3">
            <span>{r.label}</span>
            <span className="tabular">
              {r.lean != null && r.fat != null ? `${formatValue(r.lean + r.fat, 'body.mass')} kg` : '—'}
            </span>
          </div>
          <div className="flex h-3.5 gap-[2px]" style={{ width: `${(((r.lean ?? 0) + (r.fat ?? 0)) / max) * 100}%` }}>
            <div className="rounded-l-[4px]" style={{ flex: r.lean ?? 0, background: 'var(--crew-blue)' }} title={`Fat-free ${formatValue(r.lean, 'body.lean-mass')} kg`} />
            <div className="rounded-r-[4px]" style={{ flex: r.fat ?? 0, background: 'var(--crew-orange)' }} title={`Fat ${formatValue(r.fat, 'body.fat-mass')} kg`} />
          </div>
        </div>
      ))}
      <div className="flex gap-4">
        <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--crew-blue)' }} /> Fat-free mass
        </span>
        <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--crew-orange)' }} /> Fat mass
        </span>
      </div>
    </div>
  );
}
