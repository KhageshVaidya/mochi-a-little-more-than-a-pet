import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AstronautId, SeriesResponse } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { useApp } from '../stores/app';
import { useCrewSummary } from '../lib/data';
import { formatValue, unitLabel } from '../lib/format';
import { cn } from '../lib/cn';
import { Card, CardHeader, SectionHeader, SegmentedControl } from '../components/ui';
import { Avatar, crewColor } from '../components/crew';
import { endLabel } from '../components/charts';
import { CrewWellbeing } from './CrewWellbeing';

/**
 * Crew selection & comparison. Physical indicators and data completeness only —
 * individual wellbeing results are never shown at crew level.
 */

const COMPARE = ['hr.resting', 'hrv.rmssd', 'sleep.duration', 'activity.active-minutes', 'exercise.performance', 'body.mass'] as const;
type CompareId = (typeof COMPARE)[number];
const SHORT: Record<CompareId, string> = {
  'hr.resting': 'Resting HR',
  'hrv.rmssd': 'HRV',
  'sleep.duration': 'Sleep',
  'activity.active-minutes': 'Activity',
  'exercise.performance': 'Exercise capacity',
  'body.mass': 'Body mass',
};

function useCrewSeries(signalId: string): Partial<Record<AstronautId, SeriesResponse[string]>> {
  const crew = useApp((s) => s.crew);
  const [data, setData] = useState<Partial<Record<AstronautId, SeriesResponse[string]>>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(
      crew.map((p) => window.orbital.invoke('data:series', { astronautId: p.id, signalIds: [signalId], fromDay: 0, toDay: 179 }).then((r) => [p.id, r[signalId] ?? []] as const)),
    ).then((pairs) => alive && setData(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [crew, signalId]);
  return data;
}

function CompareChart({ signalId, day }: { signalId: CompareId; day: number }) {
  const crew = useApp((s) => s.crew);
  const data = useCrewSeries(signalId);
  const def = getSignal(signalId)!;
  const daily = ['daily', 'nightly'].includes(def.cadence);
  const smooth = (pts: SeriesResponse[string] | undefined, d: number) => {
    const w = (pts ?? []).filter((p) => !p.flagged && p.day <= d && p.day > d - (daily ? 7 : 1));
    return w.length ? w.reduce((a, p) => a + p.value, 0) / w.length : null;
  };
  const days = daily
    ? Array.from({ length: day + 1 }, (_, d) => d)
    : [...new Set(crew.flatMap((p) => (data[p.id] ?? []).filter((x) => x.day <= day).map((x) => x.day)))].sort((a, b) => a - b);
  const rows = days.map((d) => {
    const r: Record<string, number | null> = { day: d };
    for (const p of crew) r[p.id] = daily ? smooth(data[p.id], d) : ((data[p.id] ?? []).find((x) => x.day === d && !x.flagged)?.value ?? null);
    return r;
  });
  return (
    <div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 96, bottom: 0, left: -4 }}>
            <CartesianGrid vertical={false} stroke="var(--o-line)" />
            <XAxis dataKey="day" type="number" domain={[0, 179]} ticks={[0, 30, 60, 90, 120, 150, 179]} tick={{ fontSize: 11, fill: 'var(--o-ink-3)' }} axisLine={false} tickLine={false} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'var(--o-ink-3)' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => formatValue(v, signalId)} />
            <ReferenceLine x={day} stroke="var(--o-ink-2)" strokeOpacity={0.3} />
            {crew.map((p) => (
              <Line
                key={p.id}
                dataKey={p.id}
                name={p.name}
                stroke={crewColor(p)}
                strokeWidth={2}
                dot={daily ? false : { r: 3, strokeWidth: 2, stroke: 'var(--o-surface)', fill: crewColor(p) }}
                connectNulls
                isAnimationActive={false}
                label={endLabel(p.name.split(' ')[0]!, rows.length - 1)}
              />
            ))}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--o-line-strong)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] leading-[18px] text-ink shadow-raised">
                    <p className="font-semibold">Day {label}</p>
                    {payload.map((x) => (
                      <p key={String(x.dataKey)} className="tabular flex items-center gap-2">
                        <span className="inline-block h-0.5 w-3 rounded" style={{ background: String(x.color) }} />
                        {x.name}: {typeof x.value === 'number' ? `${formatValue(x.value, signalId)} ${unitLabel(def.unit)}` : '—'}
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {crew.map((p) => (
          <span key={p.id} className="t-caption inline-flex items-center gap-2 text-ink-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: crewColor(p) }} />
            {p.name} ({p.id})
          </span>
        ))}
        <span className="t-caption text-ink-3">{daily ? '7-day rolling mean' : 'Scheduled measurements'} · {unitLabel(def.unit)}</span>
      </div>
    </div>
  );
}

export function Crew() {
  const crew = useApp((s) => s.crew);
  const mission = useApp((s) => s.mission);
  const missionCommand = useApp((s) => s.missionCommand);
  const navigate = useApp((s) => s.navigate);
  const summary = useCrewSummary();
  const [metric, setMetric] = useState<CompareId>('hr.resting');
  const day = mission?.day ?? 0;

  return (
    <>
      <SectionHeader
        eyebrow={`Mission day ${day}`}
        title="Crew"
        subtitle="Five fictional crew members, each with a reproducible 180-day synthetic health history. Select a crew member to view their data across ORBITAL."
      />
      <div className="grid grid-cols-5 gap-4">
        {crew.map((p) => {
          const s = summary?.find((x) => x.astronautId === p.id);
          const active = p.id === mission?.astronautId;
          const comp = s?.completeness ?? 0;
          return (
            <Card key={p.id} className={cn('flex flex-col p-5 transition-[box-shadow,border-color]', active && 'border-accent ring-4 ring-accent-soft')}>
              <div className="flex flex-col items-center text-center">
                <Avatar p={p} size={56} />
                <p className="t-headline mt-3 text-ink">{p.name}</p>
                <p className="t-caption text-ink-3">
                  {p.id} · {p.role}
                </p>
                <span className="t-caption mt-2 rounded-full bg-surface-2 px-2.5 py-0.5 font-medium whitespace-nowrap text-ink-2">{p.scenarioLabel}</span>
              </div>
              <dl className="mt-4 space-y-1.5">
                {(['hr.resting', 'hrv.rmssd', 'sleep.duration'] as const).map((id) => (
                  <div key={id} className="flex justify-between">
                    <dt className="t-caption text-ink-3">{SHORT[id]}</dt>
                    <dd className="t-caption tabular font-medium text-ink">
                      {s?.metrics[id]?.value != null ? `${formatValue(s.metrics[id]!.value, id)} ${unitLabel(getSignal(id)!.unit)}` : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <div className="t-caption mb-1 flex justify-between text-ink-3">
                  <span>Data completeness</span>
                  <span className="tabular">{Math.round(comp * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn('h-full rounded-full', comp >= 0.85 ? 'bg-teal' : comp >= 0.7 ? 'bg-watch' : 'bg-attention')} style={{ width: `${comp * 100}%` }} />
                </div>
              </div>
              <p className="t-caption mt-3 text-ink-3">Day {day} of 180</p>
              <button
                onClick={() => {
                  void missionCommand({ type: 'select', astronautId: p.id });
                  if (active) navigate('overview');
                }}
                className={cn(
                  't-footnote mt-4 rounded-full py-1.5 font-medium transition-colors',
                  active ? 'bg-accent text-bg' : 'border border-line text-ink hover:bg-surface-2',
                )}
              >
                {active ? 'Open overview' : 'Select'}
              </button>
            </Card>
          );
        })}
      </div>

      <CrewWellbeing />

      <Card className="mt-8">
        <CardHeader eyebrow="Crew comparison" title={`${SHORT[metric]} across the crew`} />
        <div className="px-6 pt-4">
          <SegmentedControl<CompareId> size="sm" label="Comparison metric" value={metric} onChange={setMetric} options={COMPARE.map((c) => ({ value: c, label: SHORT[c] }))} />
        </div>
        <div className="px-6 pt-5 pb-6">
          <CompareChart signalId={metric} day={day} />
        </div>
      </Card>

      <Card className="mt-5">
        <CardHeader eyebrow={`Day ${day}`} title="Comparison table" />
        <div className="overflow-x-auto px-6 pt-3 pb-5">
          <table className="w-full">
            <thead>
              <tr className="t-caption text-left text-ink-3">
                <th className="pb-2 font-medium">Crew member</th>
                {COMPARE.map((c) => (
                  <th key={c} className="pb-2 text-right font-medium">
                    {SHORT[c]} <span className="font-normal">({unitLabel(getSignal(c)!.unit)})</span>
                  </th>
                ))}
                <th className="pb-2 text-right font-medium">Completeness</th>
              </tr>
            </thead>
            <tbody>
              {crew.map((p) => {
                const s = summary?.find((x) => x.astronautId === p.id);
                return (
                  <tr key={p.id} className="t-footnote border-t border-line">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <Avatar p={p} size={22} /> <span className="font-medium text-ink">{p.name}</span>
                      </span>
                    </td>
                    {COMPARE.map((c) => {
                      const m = s?.metrics[c];
                      return (
                        <td key={c} className="py-2.5 text-right tabular text-ink-2">
                          {formatValue(m?.value, c)}
                          {m?.z != null && <span className="t-caption ml-1 text-ink-3">({m.z > 0 ? '+' : ''}{m.z.toFixed(1)}σ)</span>}
                        </td>
                      );
                    })}
                    <td className="py-2.5 text-right tabular text-ink-2">{s ? `${Math.round(s.completeness * 100)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="t-caption mt-3 text-ink-3">σ = deviation from that crew member’s own baseline (not a comparison between people).</p>
        </div>
      </Card>

      <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-line bg-surface-2/50 px-5 py-4">
        <Lock size={16} className="mt-0.5 shrink-0 text-ink-3" />
        <p className="t-footnote text-ink-2">
          <span className="font-semibold text-ink">Wellbeing results are private.</span> Brain & Mental Health assessments, mood, stress and
          other self-reports are never shown in crew-level views or rankings. They are visible only in an individual crew member’s own
          profile — in operations, to that person and their authorised medical team. This is a simulation for authorised demonstration.
        </p>
      </div>
    </>
  );
}
