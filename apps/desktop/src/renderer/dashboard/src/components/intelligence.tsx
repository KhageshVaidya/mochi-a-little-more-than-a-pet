import { BrainCircuit, Cpu, Database, Library } from 'lucide-react';
import type { IntelligenceReport, StatisticalFinding } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { useApp } from '../stores/app';
import { useIntelligence } from '../lib/data';
import { cn } from '../lib/cn';
import { Card, CardHeader, Pill } from './ui';

/**
 * Phase 4 hybrid intelligence panel. Three clearly separated blocks:
 *  1. Deterministic decision + statistical findings (these drive recommendations),
 *  2. ML advisory (Isolation Forest; advisory only, cannot change the decision),
 *  3. Data quality & uncertainty.
 */
const BRAIN = new Set(['mood', 'stress', 'social', 'fatigue', 'sleep', 'cognition']);
const KIND_LABEL: Record<StatisticalFinding['kind'], string> = { 'sustained-change': 'Sustained change', 'longitudinal-trend': 'Longitudinal trend', 'notable-deviation': 'Notable deviation' };
const fmt = (x: number | null | undefined, dp = 1) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(dp));

function FindingRow({ f }: { f: StatisticalFinding }) {
  const def = getSignal(f.signalId);
  return (
    <tr className="border-t border-line align-top" data-finding={f.kind}>
      <td className="t-caption py-1.5 pr-3 font-medium text-ink">{def?.label ?? f.signalId}</td>
      <td className="py-1.5 pr-3">
        <Pill tone={f.kind === 'sustained-change' ? 'watch' : f.kind === 'longitudinal-trend' ? 'accent' : 'neutral'} className="py-0">
          {KIND_LABEL[f.kind]}
        </Pill>
      </td>
      <td className="t-caption py-1.5 pr-3 text-ink-2">{f.method}</td>
      <td className="t-caption tabular py-1.5 pr-3 text-ink-2">
        d{f.window.startDay}–{f.window.endDay}
        {f.sinceDay !== undefined && ` · since d${f.sinceDay}`}
      </td>
      <td className="t-caption tabular py-1.5 text-ink-2">
        {f.baseline ? `baseline ${fmt(f.baseline.mean)} ± ${fmt(f.baseline.sd)} (d${f.baseline.startDay}–${f.baseline.endDay})` : 'no baseline'}
        {f.kind === 'longitudinal-trend' ? ` · slope ${fmt(f.slopePerWeek, 2)}/wk · p=${fmt(f.pValue, 4)}` : ` · recent ${fmt(f.recent.mean)}${f.recent.z !== null ? ` (z ${fmt(f.recent.z)})` : ''}`}
      </td>
    </tr>
  );
}

export function IntelligencePanel({ focus }: { focus: 'brain' | 'physical' }) {
  const r = useIntelligence();
  const openRisk = useApp((s) => s.openRisk);
  if (!r) return null;
  const findings = r.statistical.filter((f) => (focus === 'brain' ? BRAIN.has(f.domain) : !BRAIN.has(f.domain)));
  return (
    <Card className="mt-5">
      <CardHeader eyebrow={`Hybrid intelligence · day ${r.day} · engine ${r.trace.engineVersion}`} title={focus === 'brain' ? 'How the decision was reached' : 'Physical trends and deviations'} />
      <div className="grid grid-cols-3 gap-5 px-6 pt-4 pb-5" data-testid={`intelligence-${focus}`}>
        <div className="col-span-2">
          <p className="t-caption mb-2 flex items-center gap-1.5 font-semibold text-ink-2">
            <BrainCircuit size={13} /> Statistical engine {focus === 'brain' && <>· deterministic decision <Pill className="py-0">{r.decision.state.replace('_', ' ')}</Pill></>}
          </p>
          {focus === 'brain' && <p className="t-caption mb-2 text-ink-3">Rules: {r.decision.rulesFired.join(' → ')}</p>}
          {findings.length ? (
            <table className="w-full text-left">
              <tbody>{findings.map((f) => <FindingRow key={f.id} f={f} />)}</tbody>
            </table>
          ) : (
            <p className="t-footnote text-ink-3">No {focus === 'brain' ? 'wellbeing' : 'physical'} findings in the reliable data today.</p>
          )}
          {r.nasaRiskIds.length > 0 && (
            <p className="t-caption mt-3 flex flex-wrap items-center gap-1.5 text-ink-3">
              <Library size={12} /> Related NASA research areas:
              {r.nasaRiskIds.map((id) => (
                <button key={id} onClick={() => openRisk(id)} className="font-medium text-accent hover:underline">
                  {id}
                </button>
              ))}
              <span>— context only, not a diagnosis.</span>
            </p>
          )}
        </div>
        <div className="space-y-4">
          <div className={cn('rounded-[12px] border border-dashed p-3', r.ml.status === 'alarm' ? 'border-watch' : 'border-line')} data-testid="ml-advisory" data-ml-status={r.ml.status}>
            <p className="t-caption flex items-center gap-1.5 font-semibold text-ink-2">
              <Cpu size={13} /> ML advisory (Isolation Forest)
            </p>
            <p className="t-footnote mt-1 text-ink">
              {r.ml.status === 'alarm' ? 'Unusual multivariate pattern' : r.ml.status === 'no-alarm' ? 'No multivariate anomaly' : r.ml.status === 'withheld' ? 'Not scored today' : 'Model unavailable'}
            </p>
            <p className="t-caption tabular text-ink-3">
              score {fmt(r.ml.score, 3)} · threshold {fmt(r.ml.threshold, 3)} · above on {r.ml.daysAboveThreshold}/{r.ml.windowDays} days · features {Math.round(r.ml.featuresPresent * 100)}%
            </p>
            {r.ml.topFeatures.length > 0 && <p className="t-caption text-ink-3">Largest deviations: {r.ml.topFeatures.map((f) => `${getSignal(f.signalId)?.label ?? f.signalId} (z ${f.z})`).join(', ')}</p>}
            <p className="t-caption mt-1 text-ink-3">{r.ml.note}</p>
            <p className="t-caption text-ink-3">model {r.ml.modelHash}</p>
          </div>
          <div className="rounded-[12px] border border-line p-3">
            <p className="t-caption flex items-center gap-1.5 font-semibold text-ink-2">
              <Database size={13} /> Data quality & uncertainty
            </p>
            <p className="t-caption tabular text-ink-3">
              Daily-signal coverage (14 d): {Math.round(r.dataQuality.overallCoverage * 100)}% · uncertainty <b>{r.uncertainty.level}</b>
            </p>
            {r.dataQuality.signals.filter((q) => !q.reliable).length > 0 && (
              <p className="t-caption text-ink-3">Low coverage: {r.dataQuality.signals.filter((q) => !q.reliable).map((q) => getSignal(q.signalId)?.label ?? q.signalId).slice(0, 6).join(', ')}</p>
            )}
            {r.uncertainty.drivers.map((d) => (
              <p key={d} className="t-caption text-ink-3">
                · {d}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export type { IntelligenceReport };
