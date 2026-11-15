import { Printer } from 'lucide-react';
import { ASSESSMENT_COPY, type Classification } from '@orbital/contracts';
import { allSignals, getSignal } from '@orbital/signals';
import { useApp, useAstronaut } from '../stores/app';
import { useAssessment, useSeries, useSnapshot } from '../lib/data';
import { baselineStatus, formatSigned, formatValue, unitLabel } from '../lib/format';
import { metLabel } from '../lib/cn';
import { Card, CLASSIFICATION_STYLE, ClassificationGlyph, SectionHeader } from '../components/ui';
import { BaselineBadge } from '../components/metric';
import { TrendChart, STATE_META } from '../components/charts';
import { CompositionSplit, CompositionTable, SegmentalFigure } from '../components/body';
import { Avatar } from '../components/crew';

const TREND_SIGNALS = ['hr.resting', 'hrv.rmssd', 'sleep.duration', 'activity.active-minutes', 'exercise.performance', 'mood.vas', 'cog.rt.median', 'body.mass'];
const GROUPS: { title: string; domains: string[] }[] = [
  { title: 'Cardiovascular & respiratory', domains: ['cardiovascular', 'respiratory', 'thermal', 'metabolic'] },
  { title: 'Sleep, activity & fatigue', domains: ['sleep', 'activity', 'fatigue'] },
  { title: 'Body composition', domains: ['body-composition'] },
  { title: 'Wellbeing & cognition', domains: ['mood', 'stress', 'social', 'cognition'] },
];

function ReportSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="report-section mt-10 break-inside-avoid-page">
      <h2 className="t-title flex items-baseline gap-3 border-b border-line pb-2 text-ink">
        <span className="t-footnote tabular font-mono text-ink-3">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Reports() {
  const mission = useApp((s) => s.mission);
  const p = useAstronaut();
  const snap = useSnapshot();
  const a = useAssessment();
  const series = useSeries(TREND_SIGNALS);
  const day = mission?.day ?? 0;
  if (!p || !snap) return null;
  const signals = allSignals().filter((s) => snap.metrics[s.id] && !s.id.startsWith('body.segment'));
  const meta = a ? STATE_META[a.state] : null;
  const changed = signals
    .map((s) => ({ s, st: baselineStatus(snap.metrics[s.id], s) }))
    .filter((x) => x.st.tone === 'attention' || x.st.tone === 'watch')
    .sort((x, y) => Math.abs(y.st.z ?? 0) - Math.abs(x.st.z ?? 0));

  return (
    <>
      <div className="no-print flex items-start justify-between">
        <SectionHeader title="Health Reports" subtitle="A complete report for the selected crew member at the selected mission day." />
        <button
          onClick={() => window.print()}
          className="t-footnote inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-medium text-ink shadow-card hover:bg-surface-2"
        >
          <Printer size={15} /> Print / save as PDF
        </button>
      </div>

      <Card className="report p-10">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-line pb-6">
          <div className="flex items-center gap-4">
            <Avatar p={p} size={52} />
            <div>
              <p className="t-eyebrow text-ink-3">Dr G Zero health report</p>
              <h1 className="t-large text-ink">{p.name}</h1>
              <p className="t-footnote text-ink-2">
                {p.id} · {p.role} · Scenario: {p.scenarioLabel}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="t-footnote tabular text-ink">
              Mission day {day} · {metLabel(day)}
            </p>
            <p className="t-caption text-ink-3">Data window: days 0–{day}</p>
            <span className="t-caption mt-2 inline-block rounded-full bg-synthetic-soft px-2.5 py-1 font-semibold text-synthetic">SYNTHETIC DATA — NOT A MEDICAL RECORD</span>
          </div>
        </header>

        <ReportSection n={1} title="Summary">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="t-caption text-ink-3">Brain & Mental Health monitor</p>
              {a && meta && (
                <>
                  <p className="t-headline mt-1" style={{ color: meta.color }}>
                    <span aria-hidden>{meta.glyph}</span> {a.state.replace('_', ' ')}
                  </p>
                  <p className="t-caption mt-1 text-ink-2">{ASSESSMENT_COPY[a.state].headline}</p>
                  <p className="t-caption mt-1 text-ink-3">Uncertainty: {a.uncertainty.level}</p>
                </>
              )}
            </div>
            <div>
              <p className="t-caption text-ink-3">Data completeness (14 days)</p>
              <p className="t-headline tabular mt-1 text-ink">{Math.round(snap.completeness.overall * 100)}%</p>
              <p className="t-caption mt-1 text-ink-3">
                Sensors {Math.round(snap.completeness.sensor * 100)}% · check-ins {Math.round(snap.completeness.selfReport * 100)}% · low-quality{' '}
                {Math.round(snap.completeness.lowQualityShare * 100)}%
              </p>
            </div>
            <div>
              <p className="t-caption text-ink-3">Notable changes from baseline</p>
              {changed.length ? (
                <ul className="mt-1 space-y-0.5">
                  {changed.slice(0, 5).map(({ s, st }) => (
                    <li key={s.id} className="t-caption text-ink-2">
                      {s.label}: <span className="tabular">{formatSigned(st.z ?? 0)}σ</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-caption mt-1 text-ink-2">No indicator is more than 1 SD from baseline (7-day mean).</p>
              )}
            </div>
          </div>
          {a && (
            <ul className="mt-5 space-y-1">
              {a.reasons.map((r) => (
                <li key={r.ruleId + r.text} className="t-caption text-ink-2">
                  <span className="font-mono text-ink-3">{r.ruleId}</span> — {r.text}
                </li>
              ))}
            </ul>
          )}
        </ReportSection>

        <ReportSection n={2} title="Trends">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {TREND_SIGNALS.map((id) => (
              <div key={id}>
                <div className="flex items-center justify-between">
                  <p className="t-footnote font-medium text-ink">{getSignal(id)!.label}</p>
                  <BaselineBadge m={snap.metrics[id]} signalId={id} />
                </div>
                <TrendChart signalId={id} points={series?.[id]} baseline={snap.metrics[id]?.baseline} day={day} height={120} />
              </div>
            ))}
          </div>
        </ReportSection>

        <ReportSection n={3} title="Measurements">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-6 break-inside-avoid">
              <p className="t-footnote mb-2 font-semibold text-ink">{g.title}</p>
              <table className="w-full">
                <thead>
                  <tr className="t-caption text-left text-ink-3">
                    <th className="pb-1.5 font-medium">Indicator</th>
                    <th className="pb-1.5 text-right font-medium">Latest</th>
                    <th className="pb-1.5 text-right font-medium">7-day mean</th>
                    <th className="pb-1.5 text-right font-medium">Baseline (personal)</th>
                    <th className="pb-1.5 text-right font-medium">Δ</th>
                    <th className="pb-1.5 pl-4 font-medium">Source class</th>
                    <th className="pb-1.5 text-right font-medium">Coverage</th>
                    <th className="pb-1.5 text-right font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {signals
                    .filter((s) => g.domains.includes(s.domain))
                    .map((s) => {
                      const m = snap.metrics[s.id]!;
                      const cls = (m.classification ?? s.allowedClassifications[0]) as Classification;
                      return (
                        <tr key={s.id} className="t-caption border-t border-line">
                          <td className="py-1.5 text-ink">{s.label}</td>
                          <td className="py-1.5 text-right tabular text-ink">
                            {formatValue(m.value, s.id)} {unitLabel(s.unit)}
                            {m.observedDay !== null && m.observedDay !== day && <span className="text-ink-3"> (d{m.observedDay})</span>}
                          </td>
                          <td className="py-1.5 text-right tabular text-ink-2">{formatValue(m.mean7, s.id)}</td>
                          <td className="py-1.5 text-right tabular text-ink-2">
                            {m.baseline ? `${formatValue(m.baseline.mean, s.id)}${m.baseline.kind === 'baseline' ? ` ± ${formatValue(m.baseline.sd, s.id, { precise: true })}` : ' (first)'}` : '—'}
                          </td>
                          <td className="py-1.5 text-right tabular text-ink-2">{m.deltaPct !== null ? `${formatSigned(m.deltaPct)}%` : '—'}</td>
                          <td className="py-1.5 pl-4 text-ink-3">
                            <span className="inline-flex items-center gap-1.5">
                              <ClassificationGlyph kind={cls} className="text-ink-2" /> {CLASSIFICATION_STYLE[cls].label}
                            </span>
                          </td>
                          <td className="py-1.5 text-right tabular text-ink-2">{Math.round(m.coverage14 * 100)}%</td>
                          <td className="py-1.5 text-right tabular text-ink-2">{m.quality !== null ? `${Math.round(m.quality * 100)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ))}
        </ReportSection>

        <ReportSection n={4} title="Body composition & segmental analysis">
          <div className="grid grid-cols-5 gap-8">
            <div className="col-span-3">
              <CompositionTable snap={snap} />
              <div className="mt-5">
                <CompositionSplit snap={snap} />
              </div>
            </div>
            <div className="col-span-2">
              <SegmentalFigure snap={snap} />
            </div>
          </div>
        </ReportSection>

        <ReportSection n={5} title="Data quality">
          <div className="grid grid-cols-4 gap-6">
            {(
              [
                ['Overall completeness', snap.completeness.overall],
                ['Sensor data', snap.completeness.sensor],
                ['Check-ins', snap.completeness.selfReport],
                ['Low-quality / excluded', snap.completeness.lowQualityShare],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <p className="t-caption text-ink-3">{k}</p>
                <p className="t-headline tabular text-ink">{Math.round(v * 100)}%</p>
                <div className="mt-1.5 h-1 rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-ink-3" style={{ width: `${v * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {a && <p className="t-caption mt-4 text-ink-2">Assessment data-quality rules: {a.dataQuality.issues[0] ?? 'no records excluded'}. {a.dataQuality.reliableDomains} of 7 wellbeing domains had reliable data.</p>}
        </ReportSection>

        <ReportSection n={6} title="Source classifications & methods">
          <div className="grid grid-cols-5 gap-4">
            {(Object.keys(CLASSIFICATION_STYLE) as Classification[]).map((k) => (
              <div key={k}>
                <ClassificationGlyph kind={k} className="text-accent" />
                <p className="t-caption mt-1 font-semibold text-ink">{CLASSIFICATION_STYLE[k].label}</p>
              </div>
            ))}
          </div>
          <ul className="t-caption mt-5 list-disc space-y-1 pl-5 text-ink-2">
            <li>All values are generated by the Dr G Zero simulation (sim.v1) for a fictional crew member. They are not NASA astronaut measurements.</li>
            <li>Comparisons use this person’s own baseline (mission days 10–37 for daily signals; first measurement for monthly body composition). No population reference ranges are applied.</li>
            <li>The Brain & Mental Health monitor is deterministic: data-quality and sufficiency rules, then z-scores, EWMA and CUSUM detectors, then explicit rules. It is not a diagnosis.</li>
            <li>Bioimpedance and segmental values are inferred estimates; microgravity fluid shifts may bias them.</li>
          </ul>
        </ReportSection>
      </Card>
    </>
  );
}
