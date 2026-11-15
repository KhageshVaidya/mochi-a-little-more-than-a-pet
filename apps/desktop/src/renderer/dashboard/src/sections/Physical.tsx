import { IntelligencePanel } from '../components/intelligence';
import { useState } from 'react';
import { useApp, useAstronaut } from '../stores/app';
import { useSeries, useSnapshot } from '../lib/data';
import { Card, CardHeader, SectionHeader, SegmentedControl } from '../components/ui';
import { MetricDetailCard } from '../components/metric';
import { BODY_SIGNALS, CompositionSplit, CompositionTable, SegmentalFigure } from '../components/body';

type Group = 'cardio' | 'resp' | 'sleep' | 'activity' | 'hydration' | 'body';

const GROUPS: { id: Group; label: string; signals: string[]; notes?: Record<string, string> }[] = [
  {
    id: 'cardio',
    label: 'Cardiovascular',
    signals: ['hr.resting', 'hrv.rmssd', 'hr.sample', 'bp.systolic', 'bp.diastolic', 'glucose.capillary'],
    notes: { 'hr.sample': 'Daily mean of continuous heart rate (includes activity).', 'glucose.capillary': 'Weekly fasting fingerstick, entered manually.' },
  },
  {
    id: 'resp',
    label: 'Respiratory & temperature',
    signals: ['spo2.nightly', 'spo2.spot', 'resp.rate', 'temp.skin'],
    notes: { 'temp.skin': 'Skin temperature — not core body temperature.' },
  },
  { id: 'sleep', label: 'Sleep', signals: ['sleep.duration', 'sleep.efficiency', 'sleep.quality'] },
  {
    id: 'activity',
    label: 'Activity & exercise',
    signals: ['activity.active-minutes', 'exercise.performance', 'exercise.resistance', 'exercise.aerobic'],
    notes: { 'exercise.resistance': 'Prescribed ≈60 min; one scheduled rest day per week.', 'exercise.aerobic': 'Prescribed session length; rest days show as 0.' },
  },
  {
    id: 'hydration',
    label: 'Hydration & fatigue',
    signals: ['hydration.intake', 'hydration.index', 'fatigue.vas', 'fatigue.index'],
    notes: {
      'hydration.index': 'Model-inferred from intake logs — indicative only.',
      'fatigue.index': 'Model-inferred from sleep, HRV and resting HR — indicative only.',
    },
  },
  { id: 'body', label: 'Body composition', signals: [...BODY_SIGNALS, 'body.segment.arm-left', 'body.segment.arm-right', 'body.segment.trunk', 'body.segment.leg-left', 'body.segment.leg-right'] },
];

const ALL = [...new Set(GROUPS.flatMap((g) => g.signals))];

export function Physical() {
  const [group, setGroup] = useState<Group>('cardio');
  const day = useApp((s) => s.mission?.day ?? 0);
  const p = useAstronaut();
  const snap = useSnapshot();
  const series = useSeries(ALL);
  const g = GROUPS.find((x) => x.id === group)!;

  return (
    <>
      <SectionHeader
        eyebrow={p ? `${p.name} · ${p.id} · day ${day}` : undefined}
        title="Physical Health"
        subtitle="Each indicator compared with this crew member’s own baseline. The shaded band is baseline ±1 SD; the dashed line is the baseline mean."
      />
      <div className="mb-6">
        <SegmentedControl<Group> label="Physical health group" value={group} onChange={setGroup} options={GROUPS.map((x) => ({ value: x.id, label: x.label }))} />
      </div>

      {group !== 'body' ? (
        <div className="grid grid-cols-2 gap-5">
          {g.signals.map((id) => (
            <MetricDetailCard key={id} signalId={id} m={snap?.metrics[id]} points={series?.[id]} day={day} note={g.notes?.[id]} />
          ))}
        </div>
      ) : (
        snap && (
          <>
            <div className="grid grid-cols-5 gap-5">
              <Card className="col-span-3">
                <CardHeader eyebrow="Bioimpedance · monthly" title="Body composition" />
                <div className="px-6 pt-3 pb-5">
                  <CompositionTable snap={snap} />
                  <div className="mt-6">
                    <CompositionSplit snap={snap} />
                  </div>
                  <p className="t-caption mt-4 text-ink-3">
                    Body mass is measured weekly with an inertial device (scales do not work in microgravity). Composition values are
                    bioimpedance estimates, which headward fluid shift can bias — interpret trends, not single values.
                  </p>
                </div>
              </Card>
              <Card className="col-span-2">
                <CardHeader eyebrow="Segmental analysis" title="Lean mass by segment" />
                <div className="px-4 pt-4 pb-5">
                  <SegmentalFigure snap={snap} />
                </div>
              </Card>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-5">
              {['body.mass', 'body.lean-mass', 'body.fat-mass', 'body.skeletal-muscle'].map((id) => (
                <MetricDetailCard key={id} signalId={id} m={snap.metrics[id]} points={series?.[id]} day={day} />
              ))}
            </div>
          </>
        )
      )}
      <IntelligencePanel focus="physical" />
    </>
  );
}
