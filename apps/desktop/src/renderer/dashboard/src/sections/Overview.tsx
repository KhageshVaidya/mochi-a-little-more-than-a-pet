import { Activity, BedDouble, Brain, ChevronRight, Droplet, HeartPulse, Lightbulb, Smile, Timer, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ASSESSMENT_COPY } from '@orbital/contracts';
import { useApp, useAstronaut } from '../stores/app';
import { useAlerts, useAssessment, useCrewSummary, useSeries, useSnapshot, useTimeline } from '../lib/data';
import { AlertList } from '../components/alerts';
import { deriveRecommendations, rollingZ } from '../lib/insights';
import { useState } from 'react';
import { metLabel, cn } from '../lib/cn';
import { Card, CardHeader, SectionHeader } from '../components/ui';
import { MetricTile } from '../components/metric';
import { DeviationChart, STATE_META, StateTimeline } from '../components/charts';
import { Avatar } from '../components/crew';

const TILES: { signalId: string; icon: LucideIcon; title: string }[] = [
  { signalId: 'hr.resting', icon: HeartPulse, title: 'Resting heart rate' },
  { signalId: 'hrv.rmssd', icon: Waves, title: 'Heart rate variability' },
  { signalId: 'spo2.nightly', icon: Droplet, title: 'Blood oxygen' },
  { signalId: 'sleep.duration', icon: BedDouble, title: 'Sleep' },
  { signalId: 'activity.active-minutes', icon: Activity, title: 'Physical activity' },
  { signalId: 'mood.vas', icon: Smile, title: 'Mood' },
  { signalId: 'cog.rt.median', icon: Timer, title: 'Cognitive · reaction time' },
  { signalId: 'cog.memory.accuracy', icon: Brain, title: 'Cognitive · memory' },
];
const TILE_IDS = TILES.map((t) => t.signalId);
const TRAJECTORY = [
  { id: 'hr.resting', label: 'Resting HR', color: 'var(--crew-blue)' },
  { id: 'hrv.rmssd', label: 'HRV', color: 'var(--crew-orange)' },
  { id: 'sleep.duration', label: 'Sleep', color: 'var(--crew-aqua)' },
  { id: 'mood.vas', label: 'Mood', color: 'var(--crew-magenta)' },
];

function BrainMonitorCard() {
  const a = useAssessment();
  const timeline = useTimeline();
  const day = useApp((s) => s.mission?.day ?? 0);
  const navigate = useApp((s) => s.navigate);
  const meta = a ? STATE_META[a.state] : null;
  return (
    <Card className="col-span-2 overflow-hidden">
      <CardHeader
        eyebrow="Brain & Mental Health monitor"
        title={a ? ASSESSMENT_COPY[a.state].headline : 'Assessing…'}
        action={
          meta && (
            <span className="t-caption inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ color: meta.color, background: `color-mix(in oklab, ${meta.color} 14%, transparent)` }}>
              <span aria-hidden>{meta.glyph}</span>
              {a!.state.replace('_', ' ')}
            </span>
          )
        }
      />
      <div className="px-6 pt-2 pb-5">
        {a && (
          <>
            <ul className="space-y-1.5">
              {a.reasons
                .filter((r) => r.tier !== 'DATA_QUALITY')
                .slice(0, 3)
                .map((r) => (
                  <li key={r.ruleId} className="t-body flex gap-2 text-ink-2">
                    <span className="t-caption mt-0.5 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-ink-3">{r.ruleId}</span>
                    {r.text}
                  </li>
                ))}
            </ul>
            <div className="t-caption mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-ink-3">
              <span className="tabular">
                Window days {Math.max(0, a.window.startDay)}–{a.window.endDay} · baseline days {a.window.baselineStartDay}–{a.window.baselineEndDay}
              </span>
              <span>
                {a.dataQuality.reliableDomains}/{7} domains reliable · uncertainty {a.uncertainty.level}
              </span>
            </div>
            <div className="mt-5">
              <StateTimeline timeline={timeline} day={day} />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <p className="t-caption text-ink-3">{ASSESSMENT_COPY[a.state].subline}</p>
              <button onClick={() => navigate('brain')} className="t-footnote inline-flex items-center gap-1 font-medium text-accent">
                Details <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ProfileCard() {
  const mission = useApp((s) => s.mission);
  const p = useAstronaut();
  const snap = useSnapshot();
  if (!p || !mission) return <Card>{null}</Card>;
  const rows: [string, string][] = [
    ['Crew ID', p.id],
    ['Role', p.role],
    ['Mission', 'Orbital station · 180 days'],
    ['Elapsed', `${metLabel(mission.day)} · day ${mission.day}`],
    ['Scenario', p.scenarioLabel],
    ['Data completeness', snap ? `${Math.round(snap.completeness.overall * 100)}% (14 days)` : '—'],
  ];
  return (
    <Card>
      <div className="flex items-center gap-3.5 px-6 pt-5">
        <Avatar p={p} size={44} />
        <div>
          <p className="t-eyebrow text-ink-3">Astronaut</p>
          <h2 className="t-headline text-ink">{p.name}</h2>
        </div>
      </div>
      <dl className="px-6 pt-3 pb-4">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
            <dt className="t-footnote text-ink-3">{k}</dt>
            <dd className="t-footnote tabular text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function AlertsCard() {
  const [version, setVersion] = useState(0);
  const alerts = useAlerts(version);
  const visible = (alerts ?? []).filter((a) => a.tier !== 'routine');
  return (
    <Card>
      <CardHeader eyebrow="Current alerts" title={visible.length ? `${visible.length} item${visible.length > 1 ? 's' : ''} to review` : 'Nothing to review'} />
      <div className="px-4 pt-2 pb-4">
        {visible.length === 0 ? (
          <p className="t-footnote px-2 py-2 text-ink-3">All monitored indicators are close to the personal baseline.</p>
        ) : (
          <AlertList alerts={visible} compact onChanged={() => setVersion((v) => v + 1)} />
        )}
      </div>
    </Card>
  );
}

function RecommendationsCard() {
  const snap = useSnapshot();
  const recs = deriveRecommendations(snap);
  return (
    <Card className="col-span-2">
      <CardHeader eyebrow="Today" title="Recommendations" />
      <div className="grid grid-cols-2 gap-3 px-6 pt-3 pb-6">
        {recs.map((r) => (
          <div key={r.id} className="flex gap-3 rounded-[14px] bg-surface-2/60 p-4">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
            <div>
              <p className="t-footnote font-semibold text-ink">{r.title}</p>
              <p className="t-caption mt-0.5 text-ink-3">{r.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TrajectoryCard() {
  const day = useApp((s) => s.mission?.day ?? 0);
  const snap = useSnapshot();
  const series = useSeries(TRAJECTORY.map((t) => t.id));
  const lines = TRAJECTORY.flatMap((t) => {
    const b = snap?.metrics[t.id]?.baseline;
    if (!b || b.kind !== 'baseline' || !series) return [];
    return [{ id: t.id, label: t.label, color: t.color, rows: rollingZ(series[t.id], b.mean, b.sd, day) }];
  });
  return (
    <Card className="col-span-3">
      <CardHeader eyebrow="Historical health trajectory" title="Change from personal baseline" />
      <div className="px-6 pt-4 pb-5">
        {lines.length ? (
          <DeviationChart series={lines} day={day} />
        ) : (
          <p className="t-body py-16 text-center text-ink-3">The personal baseline forms over mission days 10–37.</p>
        )}
      </div>
    </Card>
  );
}

function CrewStrip() {
  const crew = useApp((s) => s.crew);
  const sel = useApp((s) => s.mission?.astronautId);
  const missionCommand = useApp((s) => s.missionCommand);
  const navigate = useApp((s) => s.navigate);
  const summary = useCrewSummary();
  return (
    <Card className="col-span-3">
      <CardHeader
        eyebrow="Crew overview"
        title="Five crew members · physical indicators and data completeness"
        action={
          <button onClick={() => navigate('crew')} className="t-footnote inline-flex items-center gap-1 font-medium text-accent">
            Compare crew <ChevronRight size={14} />
          </button>
        }
      />
      <div className="grid grid-cols-5 gap-3 px-6 pt-4 pb-6">
        {crew.map((p) => {
          const s = summary?.find((x) => x.astronautId === p.id);
          const active = p.id === sel;
          return (
            <button
              key={p.id}
              onClick={() => void missionCommand({ type: 'select', astronautId: p.id })}
              aria-pressed={active}
              className={cn('rounded-[14px] border p-3.5 text-left transition-colors', active ? 'border-accent bg-accent-soft/40' : 'border-line hover:bg-surface-2')}
            >
              <div className="flex items-center gap-2.5">
                <Avatar p={p} size={30} />
                <div className="min-w-0">
                  <p className="t-footnote truncate font-semibold text-ink">{p.name}</p>
                  <p className="t-caption text-ink-3">{p.id}</p>
                </div>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-teal" style={{ width: `${Math.round((s?.completeness ?? 0) * 100)}%` }} />
              </div>
              <p className="t-caption tabular mt-1.5 text-ink-3">{s ? `${Math.round(s.completeness * 100)}% complete` : '—'}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function Overview() {
  const mission = useApp((s) => s.mission);
  const p = useAstronaut();
  const snap = useSnapshot();
  const series = useSeries(TILE_IDS);
  const day = mission?.day ?? 0;
  return (
    <>
      <SectionHeader
        eyebrow={mission ? `Mission day ${mission.day} · ${metLabel(mission.day)}` : 'Mission'}
        title={p ? p.name : 'Mission Overview'}
        subtitle={p ? `${p.role} · ${p.scenarioSummary}` : undefined}
      />
      <div className="grid grid-cols-3 gap-5">
        <BrainMonitorCard />
        <ProfileCard />
      </div>
      <h2 className="t-title mt-10 mb-4 text-ink">Today</h2>
      <div className="grid grid-cols-4 gap-5">
        {TILES.map((t) => (
          <MetricTile key={t.signalId} signalId={t.signalId} title={t.title} icon={t.icon} m={snap?.metrics[t.signalId]} points={series?.[t.signalId]} day={day} />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-5">
        <RecommendationsCard />
        <AlertsCard />
        <TrajectoryCard />
        <CrewStrip />
      </div>
    </>
  );
}
