import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import type { AlertItem, Classification, MetricSnapshot, Snapshot, WellbeingPatterns } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { baselineStatus, formatSigned, formatValue, unitLabel } from '../lib/format';
import { cn } from '../lib/cn';
import { CLASSIFICATION_STYLE } from './ui';

/**
 * Human-readable body map (Phase 2 C3). Separate layers: physiological, cognitive, self-reports, inferred patterns.
 * Regions summarise MEASUREMENTS RELATIVE TO THE PERSON'S BASELINE. The head region shows cognitive TASK
 * performance — it is never a measurement of the brain. Self-reports are not mapped onto the body.
 */

type Layer = 'physiological' | 'cognitive' | 'self-report' | 'inferred';
interface Region {
  id: string;
  label: string;
  layer: Layer;
  signals: string[];
  note?: string;
}

const REGIONS: Region[] = [
  { id: 'heart', label: 'Heart & circulation', layer: 'physiological', signals: ['hr.resting', 'hrv.rmssd', 'bp.systolic', 'bp.diastolic'] },
  { id: 'lungs', label: 'Breathing & oxygen', layer: 'physiological', signals: ['spo2.nightly', 'resp.rate'] },
  { id: 'skin', label: 'Skin temperature', layer: 'physiological', signals: ['temp.skin'], note: 'Skin, not core temperature.' },
  { id: 'legs', label: 'Activity & muscles', layer: 'physiological', signals: ['activity.active-minutes', 'exercise.performance', 'body.segment.leg-left', 'body.segment.leg-right'] },
  { id: 'sleep', label: 'Sleep', layer: 'physiological', signals: ['sleep.duration', 'sleep.efficiency'] },
  { id: 'head', label: 'Cognitive task performance', layer: 'cognitive', signals: ['cog.rt.median', 'cog.rt.lapses', 'cog.memory.accuracy'], note: 'Results of short reaction-time and memory tasks — not a measurement of the brain.' },
  { id: 'reports', label: 'Your self-reports', layer: 'self-report', signals: ['mood.vas', 'stress.vas', 'fatigue.vas', 'motivation.vas', 'isolation.vas', 'sleep.quality', 'cog.concentration'], note: 'What you reported. Not mapped onto the body.' },
];

const TONE = {
  within: { fill: 'var(--o-teal-soft)', stroke: 'var(--o-teal)', label: 'Within baseline' },
  watch: { fill: 'var(--o-watch-soft)', stroke: 'var(--o-watch)', label: 'Watch' },
  attention: { fill: 'var(--o-attention-soft)', stroke: 'var(--o-attention)', label: 'Notable change' },
  none: { fill: 'var(--o-surface-2)', stroke: 'var(--o-line-strong)', label: 'No baseline / data' },
} as const;

function regionTone(r: Region, snap: Snapshot): keyof typeof TONE {
  let worst: keyof typeof TONE = 'none';
  for (const id of r.signals) {
    const st = baselineStatus(snap.metrics[id], getSignal(id)).tone;
    if (st === 'attention') return 'attention';
    if (st === 'watch') worst = 'watch';
    else if (st === 'within' && worst === 'none') worst = 'within';
  }
  return worst;
}

function MetricLine({ id, m }: { id: string; m: MetricSnapshot | undefined }) {
  const def = getSignal(id);
  if (!def) return null;
  const st = baselineStatus(m, def);
  const cls = (m?.classification ?? def.allowedClassifications[0]) as Classification;
  const lowCoverage = (m?.coverage14 ?? 0) < 0.7 && ['daily', 'nightly', 'continuous'].includes(def.cadence);
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-footnote text-ink">{def.label}</span>
        <span className="t-footnote tabular font-medium text-ink">
          {formatValue(m?.mean7 ?? m?.value, id)} <span className="t-caption text-ink-3">{unitLabel(def.unit)}</span>
        </span>
      </div>
      <p className="t-caption tabular text-ink-3">
        {m?.baseline ? `Baseline ${formatValue(m.baseline.mean, id)}${m.baseline.kind === 'baseline' ? ` ± ${formatValue(m.baseline.sd, id, { precise: true })}` : ' (first)'}` : 'No baseline yet'}
        {st.z !== null && ` · ${formatSigned(st.z)}σ`} · {st.label} · {CLASSIFICATION_STYLE[cls].label.toLowerCase()}
      </p>
      {lowCoverage && (
        <p className="t-caption mt-0.5 flex items-center gap-1 text-watch">
          <AlertTriangle size={11} /> Only {Math.round((m?.coverage14 ?? 0) * 100)}% of the last 14 days have reliable data — interpret with caution.
        </p>
      )}
    </div>
  );
}

export function BodyMap({ snap, patterns, alerts }: { snap: Snapshot; patterns: WellbeingPatterns | null; alerts: AlertItem[] }) {
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ physiological: true, cognitive: true, 'self-report': true, inferred: true });
  const [sel, setSel] = useState<string>('heart');
  const region = REGIONS.find((r) => r.id === sel)!;
  const show = (r: Region) => layers[r.layer];
  const t = (id: string) => TONE[regionTone(REGIONS.find((r) => r.id === id)!, snap)];
  const patternSignals = new Set((patterns?.changes ?? []).map((c) => c.signalId));
  const inferredOn = (r: Region) => layers.inferred && r.signals.some((s) => patternSignals.has(s));
  const relatedAlerts = alerts.filter((a) => a.reasons.some((x) => region.signals.some((s) => x.includes(s))) || (region.layer !== 'physiological' && a.tier === 'human-review'));
  const regionProps = (id: string) => {
    const r = REGIONS.find((x) => x.id === id)!;
    return {
      onClick: () => setSel(id),
      style: { cursor: 'pointer', opacity: show(r) ? 1 : 0.12 },
      fill: t(id).fill,
      stroke: sel === id ? 'var(--o-ink)' : t(id).stroke,
      strokeWidth: sel === id ? 2.5 : 1.5,
      strokeDasharray: inferredOn(r) ? '5 3' : undefined,
      role: 'button',
      'aria-label': `${r.label}: ${t(id).label}`,
    };
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Layers">
        {(
          [
            ['physiological', 'Physiological'],
            ['cognitive', 'Cognitive tasks'],
            ['self-report', 'Self-reports'],
            ['inferred', 'Inferred patterns'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} aria-pressed={layers[k]} onClick={() => setLayers({ ...layers, [k]: !layers[k] })} className={cn('t-caption rounded-full border px-2.5 py-1 font-medium', layers[k] ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3')}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[260px_1fr] gap-6">
        <div>
          <svg viewBox="0 0 220 360" className="w-full" aria-label="Body map of indicators relative to personal baseline">
            {/* Original stylised figure; regions are summaries of measurements, not anatomy findings. */}
            <rect x="74" y="78" width="72" height="140" rx="30" {...regionProps('skin')} />
            <circle cx="110" cy="44" r="28" {...regionProps('head')} />
            <ellipse cx="96" cy="118" rx="16" ry="20" {...regionProps('lungs')} />
            <ellipse cx="126" cy="118" rx="16" ry="20" {...regionProps('lungs')} />
            <path d="M110 150 c-8 -10 -22 -6 -20 6 c2 10 20 22 20 22 s18 -12 20 -22 c2 -12 -12 -16 -20 -6 z" {...regionProps('heart')} />
            <rect x="78" y="224" width="28" height="122" rx="14" {...regionProps('legs')} />
            <rect x="114" y="224" width="28" height="122" rx="14" {...regionProps('legs')} />
            <g {...regionProps('sleep')}>
              <path d="M178 40 a16 16 0 1 0 14 24 a13 13 0 1 1 -14 -24 z" />
            </g>
            <text x="110" y="48" textAnchor="middle" fontSize="9" fill="var(--o-ink-2)" pointerEvents="none">tasks</text>
          </svg>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {Object.entries(TONE).map(([k, v]) => (
              <span key={k} className="t-caption inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: v.fill, borderColor: v.stroke }} />
                {v.label}
              </span>
            ))}
            <span className="t-caption col-span-2 inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2.5 w-4 rounded-sm border border-dashed border-ink-2" /> Part of an inferred statistical pattern
            </span>
          </div>
          <button onClick={() => setSel('reports')} className={cn('mt-3 w-full rounded-[12px] border px-3 py-2 text-left', sel === 'reports' ? 'border-ink' : 'border-line')} style={{ background: t('reports').fill, opacity: layers['self-report'] ? 1 : 0.3 }}>
            <p className="t-footnote font-semibold text-ink">Your self-reports</p>
            <p className="t-caption text-ink-3">Mood, stress, fatigue, motivation, isolation — {t('reports').label.toLowerCase()}</p>
          </button>
        </div>
        <div>
          <p className="t-eyebrow text-ink-3">{region.layer === 'cognitive' ? 'Cognitive layer' : region.layer === 'self-report' ? 'Self-report layer' : 'Physiological layer'}</p>
          <h3 className="t-title text-ink">{region.label}</h3>
          <p className="t-caption mt-1 text-ink-3">
            Last 7 days compared with your personal baseline (mission days 10–37). Day {snap.day}.
            {region.note && <span className="text-ink-2"> {region.note}</span>}
          </p>
          <div className="mt-3">{region.signals.map((id) => <MetricLine key={id} id={id} m={snap.metrics[id]} />)}</div>
          {inferredOn(region) && (
            <div className="mt-3 rounded-[12px] border border-dashed border-line-strong px-3 py-2">
              <p className="t-caption font-semibold text-ink-3">Inferred statistical pattern</p>
              <p className="t-footnote text-ink-2">{patterns?.summary}</p>
              <p className="t-caption mt-1 text-ink-3">A pattern in the data, not a finding about the body or a diagnosis.</p>
            </div>
          )}
          {relatedAlerts.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {relatedAlerts.map((a) => (
                <div key={a.id} className="rounded-[12px] bg-surface-2/70 px-3 py-2">
                  <p className="t-caption flex items-center gap-1 font-semibold text-ink">
                    <Info size={12} /> Why an alert was generated ({a.tier.replace('-', ' ')})
                  </p>
                  <p className="t-caption text-ink-2">{a.reasons.join(' · ')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
