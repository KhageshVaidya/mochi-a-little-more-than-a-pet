import { useState } from 'react';
import { HeartHandshake, ShieldCheck } from 'lucide-react';
import { ASSESSMENT_COPY, type ActionId, type Contributor } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { useApp, useAstronaut } from '../stores/app';
import { useAlerts, useAssessment, usePatterns, useSeries, useSnapshot, useTimeline } from '../lib/data';
import { BodyMap } from '../components/bodymap';
import { AlertList } from '../components/alerts';
import { IntelligencePanel } from '../components/intelligence';
import { formatSigned } from '../lib/format';
import { Card, CardHeader, SectionHeader, Pill } from '../components/ui';
import { MetricDetailCard } from '../components/metric';
import { STATE_META, StateTimeline } from '../components/charts';

const ACTION_TEXT: Record<ActionId, string> = {
  'routine-checkins': 'Keep your routine check-ins. Talk to your crew-support contact any time.',
  'complete-checkins': 'Complete check-ins on the next few days so an assessment becomes possible.',
  'review-sleep-workload': 'Review your sleep schedule and workload; consider a conversation with your crew-support contact.',
  'private-conference': 'Consider a private conference with your crew-support contact (e.g. flight surgeon or behavioural-health team).',
  'human-support-now': 'The human-support pathway is open. A crew-support contact will be in touch.',
};

const CHARTS: { id: string; group: string }[] = [
  { id: 'mood.vas', group: 'Mood trajectory' },
  { id: 'stress.vas', group: 'Stress trajectory' },
  { id: 'sleep.duration', group: 'Sleep & fatigue' },
  { id: 'fatigue.vas', group: 'Sleep & fatigue' },
  { id: 'cog.rt.median', group: 'Cognition' },
  { id: 'cog.memory.accuracy', group: 'Cognition' },
  { id: 'isolation.vas', group: 'Social & motivation' },
  { id: 'motivation.vas', group: 'Social & motivation' },
  { id: 'sleep.quality', group: 'Sleep & fatigue' },
  { id: 'cog.concentration', group: 'Cognition' },
];

function ContributorsTable({ contributors }: { contributors: readonly Contributor[] }) {
  const bySignal = new Map<string, Partial<Record<Contributor['method'], Contributor>>>();
  for (const c of contributors) bySignal.set(c.signalId, { ...(bySignal.get(c.signalId) ?? {}), [c.method]: c });
  const rows = [...bySignal.entries()];
  if (!rows.length) return <p className="t-footnote px-6 pb-5 text-ink-3">No indicator shows a notable change from baseline in this window.</p>;
  return (
    <table className="w-full">
      <thead>
        <tr className="t-caption text-left text-ink-3">
          <th className="px-6 pb-2 font-medium">Indicator</th>
          <th className="pb-2 font-medium">Domain</th>
          <th className="pb-2 text-right font-medium">7-day z</th>
          <th className="pb-2 text-right font-medium">Days ≥1.5σ (of 7)</th>
          <th className="pb-2 text-right font-medium">EWMA / limit</th>
          <th className="pb-2 text-right font-medium">CUSUM / h</th>
          <th className="px-6 pb-2 text-right font-medium">Since</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, m]) => {
          const def = getSignal(id);
          const sustained = !!m['change-point'];
          return (
            <tr key={id} className="t-footnote border-t border-line">
              <td className="px-6 py-2.5 text-ink">
                <span className="inline-flex items-center gap-2">
                  {def?.label ?? id}
                  {sustained && <Pill tone="attention">Sustained</Pill>}
                </span>
              </td>
              <td className="py-2.5 text-ink-3 capitalize">{def?.domain}</td>
              <td className="py-2.5 text-right tabular text-ink-2">{m['z-score'] ? `${formatSigned(m['z-score'].statistic)}σ ${m['z-score'].direction === 'up' ? '↑' : '↓'}` : '—'}</td>
              <td className="py-2.5 text-right tabular text-ink-2">{m.persistence?.statistic ?? '—'}</td>
              <td className="py-2.5 text-right tabular text-ink-2">{m.ewma ? `${m.ewma.statistic.toFixed(2)} / ${m.ewma.threshold.toFixed(2)}` : '—'}</td>
              <td className="py-2.5 text-right tabular text-ink-2">{m.cusum ? `${m.cusum.statistic.toFixed(1)} / ${m.cusum.threshold}` : '—'}</td>
              <td className="px-6 py-2.5 text-right tabular text-ink-2">{m['change-point']?.sinceDay != null ? `day ${m['change-point'].sinceDay}` : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function BrainHealth() {
  const day = useApp((s) => s.mission?.day ?? 0);
  const p = useAstronaut();
  const a = useAssessment();
  const timeline = useTimeline();
  const snap = useSnapshot();
  const series = useSeries(CHARTS.map((c) => c.id));
  const [support, setSupport] = useState(false);
  const [alertVersion, setAlertVersion] = useState(0);
  const patterns = usePatterns();
  const alerts = useAlerts(alertVersion);
  const meta = a ? STATE_META[a.state] : null;

  return (
    <>
      <SectionHeader
        eyebrow={p ? `${p.name} · ${p.id} · day ${day}` : undefined}
        title="Brain & Mental Health"
        subtitle="A deterministic early-warning monitor for sustained change from this crew member’s own baseline. It does not diagnose, and a “NO” is not proof of wellbeing."
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1fr]">
          <div className="p-7">
            <p className="t-eyebrow text-ink-3">Monitor result · day {day}</p>
            {a && meta ? (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <span className="font-display text-[34px] leading-none font-bold tracking-tight" style={{ color: meta.color }}>
                    <span aria-hidden className="mr-2 text-[24px]">{meta.glyph}</span>
                    {a.state === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : a.state}
                  </span>
                </div>
                <p className="t-title mt-3 text-ink">{ASSESSMENT_COPY[a.state].headline}</p>
                <p className="t-body mt-1 text-ink-2">{ASSESSMENT_COPY[a.state].subline}</p>
                <div className="mt-5 rounded-[14px] bg-surface-2/70 p-4">
                  <p className="t-caption font-semibold tracking-wide text-ink-3 uppercase">Suggested action</p>
                  <p className="t-body mt-1 text-ink">{ACTION_TEXT[a.suggestedAction]}</p>
                </div>
              </>
            ) : (
              <p className="t-body mt-3 text-ink-3">Assessing…</p>
            )}
            <button
              onClick={async () => {
                // Opens the deterministic human-support pathway (safety event → engine P0 → urgent alert).
                await window.orbital.invoke('companion:chat', { action: 'talk-to-someone' });
                setSupport(true);
                setAlertVersion((v) => v + 1);
              }}
              className="t-footnote mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-medium text-ink hover:bg-surface-2"
            >
              <HeartHandshake size={16} className="text-accent" /> I’d like to talk to someone
            </button>
            {support && (
              <div className="mt-3 rounded-[14px] border border-accent/30 bg-accent-soft/50 p-4">
                <p className="t-footnote font-semibold text-ink">Human support pathway</p>
                <p className="t-caption mt-1 text-ink-2">
                  The human-support pathway is open and recorded in your audit log. In operations this notifies your configured crew-support
                  contacts (crew medical officer, flight surgeon, behavioural-health team) — independent of any assessment result. In this
                  demonstration no message is actually sent.
                </p>
              </div>
            )}
          </div>
          <div className="border-l border-line p-7">
            <p className="t-eyebrow text-ink-3">Assessment details</p>
            {a && (
              <dl className="mt-3 space-y-2.5">
                {(
                  [
                    ['Time window', `Days ${Math.max(0, a.window.startDay)}–${a.window.endDay}`],
                    ['Personal baseline', `Days ${a.window.baselineStartDay}–${a.window.baselineEndDay}`],
                    ['Reliable domains', `${a.dataQuality.reliableDomains} of 7 (needs ${a.dataQuality.requiredDomains})`],
                    ['Data quality', a.dataQuality.issues[0] ?? 'No records excluded'],
                    ['Uncertainty', `${a.uncertainty.level}${a.uncertainty.drivers.length ? ` — ${a.uncertainty.drivers.join(' ')}` : ''}`],
                    ['Rules fired', a.trace.rulesFired.join(', ')],
                    ['Trace', `engine ${a.trace.engineVersion} · config ${a.trace.configHash} · input ${a.trace.inputHash}`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="t-caption text-ink-3">{k}</dt>
                    <dd className="t-footnote tabular text-ink-2 select-text">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="t-caption mt-4 inline-flex items-center gap-1.5 text-ink-3">
              <ShieldCheck size={13} /> Deterministic rules decide. ML may add insights but can never change this result.
            </p>
          </div>
        </div>
      </Card>

      {alerts && alerts.length > 0 && (
        <Card className="mt-5">
          <CardHeader eyebrow="Alerts" title="What needs attention, by tier" />
          <div className="px-6 pt-3 pb-5">
            <AlertList alerts={alerts} onChanged={() => setAlertVersion((v) => v + 1)} />
          </div>
        </Card>
      )}

      {patterns && (
        <Card className="mt-5">
          <CardHeader eyebrow="Observable patterns" title={patterns.summary ?? 'No notable combined changes in the last 7 days'} />
          <div className="space-y-2 px-6 pt-3 pb-5">
            {patterns.changes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {patterns.changes.map((c) => (
                  <Pill key={c.signalId}>
                    {c.phrase} · {c.z7 > 0 ? '+' : ''}
                    {c.z7.toFixed(1)}σ · {c.layer}
                  </Pill>
                ))}
              </div>
            )}
            {patterns.relationships.map((r) => (
              <p key={r.a + r.b} className="t-footnote text-ink-2">{r.statement}</p>
            ))}
            {patterns.checkinPattern.statement && <p className="t-footnote text-ink-2">{patterns.checkinPattern.statement}</p>}
            {patterns.repeatedDifficulties.statement && <p className="t-footnote text-ink-2">{patterns.repeatedDifficulties.statement}</p>}
            <p className="t-caption text-ink-3">{patterns.uncertainty}</p>
          </div>
        </Card>
      )}

      {snap && (
        <Card className="mt-5">
          <CardHeader eyebrow="Body map" title="Indicators by system and layer" />
          <div className="px-6 pt-3 pb-6">
            <BodyMap snap={snap} patterns={patterns} alerts={alerts ?? []} />
          </div>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader eyebrow="Why" title="Reasons behind the decision" />
        <ul className="space-y-2 px-6 pt-3 pb-5">
          {a?.reasons.map((r) => (
            <li key={r.ruleId + r.text} className="t-body flex gap-3 text-ink-2">
              <span className="t-caption mt-0.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink-3">{r.ruleId}</span>
              <span>
                <span className="t-caption mr-2 text-ink-3 uppercase">{r.tier.replace('_', ' ')}</span>
                {r.text}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5">
        <CardHeader eyebrow="Contributing indicators" title="Statistical evidence by indicator" />
        <div className="pt-3">{a && <ContributorsTable contributors={a.contributors} />}</div>
      </Card>

      <Card className="mt-5">
        <CardHeader eyebrow="Mission timeline" title="Monitor result for every day so far" />
        <div className="px-6 pt-4 pb-5">
          <StateTimeline timeline={timeline} day={day} />
        </div>
      </Card>

      <IntelligencePanel focus="brain" />

      <h2 className="t-title mt-10 mb-4 text-ink">Indicators vs personal baseline</h2>
      <div className="grid grid-cols-2 gap-5">
        {CHARTS.map((c) => (
          <MetricDetailCard key={c.id} signalId={c.id} m={snap?.metrics[c.id]} points={series?.[c.id]} day={day} note={c.group} />
        ))}
      </div>
    </>
  );
}
