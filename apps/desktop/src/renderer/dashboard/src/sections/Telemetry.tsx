import { useEffect, useRef, useState } from 'react';
import { CirclePlay, Radio } from 'lucide-react';
import type { TelemetryDay } from '@orbital/contracts';
import { useApp, useAstronaut } from '../stores/app';
import { useTelemetry } from '../lib/data';
import { Card, SectionHeader, Pill } from '../components/ui';
import { TelemetryTrace } from '../components/charts';

const TRACES = [
  { field: 'hr', label: 'Heart rate', unit: 'bpm', color: 'var(--crew-blue)', device: 'Simulated chest-strap ECG' },
  { field: 'resp', label: 'Respiratory rate', unit: 'br/min', color: 'var(--crew-aqua)', device: 'Simulated respiratory band' },
  { field: 'spo2', label: 'Blood oxygen', unit: '%', color: 'var(--crew-orange)', device: 'Simulated pulse oximeter' },
  { field: 'skinTemp', label: 'Skin temperature', unit: '°C', color: 'var(--crew-magenta)', device: 'Simulated skin thermistor' },
] as const;

function domainOf(values: (number | null)[], pad: number): [number, number] {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return [0, 1];
  return [Math.floor(Math.min(...v) - pad), Math.ceil(Math.max(...v) + pad)];
}

function valueAt(t: TelemetryDay, field: (typeof TRACES)[number]['field'], minute: number): number | null {
  const i = Math.min(t[field].length - 1, Math.floor(minute / t.stepMinutes));
  for (let k = i; k >= Math.max(0, i - 5); k--) if (t[field][k] !== null) return t[field][k]!;
  return null;
}

/**
 * Playback of simulated intraday telemetry. While the mission plays, a playhead sweeps the day at the
 * mission clock's speed; when paused the full day is shown.
 */
export function Telemetry() {
  const mission = useApp((s) => s.mission);
  const p = useAstronaut();
  const t = useTelemetry();
  const [playhead, setPlayhead] = useState(1440);
  const raf = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!mission?.playing) {
      setPlayhead(1440);
      return;
    }
    const msPerDay = 60_000 / mission.speed;
    const start = performance.now();
    const tick = (now: number) => {
      setPlayhead(Math.min(1440, ((now - start) / msPerDay) * 1440));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [mission?.day, mission?.playing, mission?.speed]);

  const worn = t ? t.hr.some((v) => v !== null) : false;
  const coverage = t ? t.hr.filter((v) => v !== null).length / t.hr.length : 0;
  const phaseNow = t ? t.phase[Math.min(t.phase.length - 1, Math.floor(Math.min(playhead, 1439) / t.stepMinutes))] : undefined;
  const clock = `${String(Math.floor(Math.min(playhead, 1439) / 60)).padStart(2, '0')}:${String(Math.floor(Math.min(playhead, 1439) % 60)).padStart(2, '0')}`;

  return (
    <>
      <SectionHeader
        eyebrow={p && mission ? `${p.name} · ${p.id} · day ${mission.day}` : undefined}
        title="Live Telemetry"
        subtitle="Intraday sensor traces for the selected mission day, driven by the mission clock."
      />
      <div className="mb-5 flex items-center gap-3 rounded-[14px] border border-synthetic/30 bg-synthetic-soft px-4 py-3">
        <CirclePlay size={18} className="text-synthetic" />
        <p className="t-footnote text-ink">
          <span className="font-semibold">Simulation playback — not real-time sensor telemetry.</span>{' '}
          <span className="text-ink-2">These traces are generated deterministically from this crew member’s synthetic daily records.</span>
        </p>
      </div>

      {t && (
        <div className="mb-5 grid grid-cols-5 gap-4">
          <Card className="p-4">
            <p className="t-caption text-ink-3">Station time</p>
            <p className="font-display tabular text-[26px] font-semibold text-ink">{clock}</p>
            <p className="t-caption mt-1 inline-flex items-center gap-1.5 text-ink-3 capitalize">
              <Radio size={12} className={mission?.playing ? 'text-teal' : ''} /> {mission?.playing ? 'playing' : 'paused · full day'} · {phaseNow}
            </p>
          </Card>
          {TRACES.map((tr) => {
            const v = valueAt(t, tr.field, Math.min(playhead, 1439));
            return (
              <Card key={tr.field} className="p-4">
                <p className="t-caption inline-flex items-center gap-1.5 text-ink-3">
                  <span className="h-0.5 w-3 rounded" style={{ background: tr.color }} /> {tr.label}
                </p>
                <p className="font-display tabular text-[26px] font-semibold text-ink">
                  {v ?? '—'} <span className="t-footnote font-normal text-ink-3">{tr.unit}</span>
                </p>
                <p className="t-caption mt-1 text-ink-3">Measured · synthetic</p>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-4">
            <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent/25" /> Sleep period
            </span>
            <span className="t-caption inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-ink-2/20" /> Scheduled exercise
            </span>
            <span className="t-caption text-ink-3">Gaps = no sensor signal</span>
          </div>
          {t && <Pill tone={worn ? (coverage > 0.9 ? 'teal' : 'watch') : 'attention'}>{worn ? `${Math.round(coverage * 100)}% signal coverage` : 'Device not worn this day'}</Pill>}
        </div>
        {t &&
          (worn ? (
            <div className="space-y-4">
              {TRACES.map((tr) => (
                <div key={tr.field}>
                  <p className="t-footnote mb-1 font-medium text-ink-2">
                    {tr.label} <span className="t-caption font-normal text-ink-3">· {tr.unit} · {tr.device}</span>
                  </p>
                  <TelemetryTrace
                    t={t}
                    field={tr.field}
                    label={tr.label}
                    unit={tr.unit}
                    color={tr.color}
                    playhead={playhead}
                    domain={domainOf(t[tr.field], tr.field === 'skinTemp' ? 0.3 : tr.field === 'spo2' ? 1 : 4)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="t-body py-20 text-center text-ink-3">
              No wearable data were recorded for this crew member on day {mission?.day}. This is part of the incomplete-telemetry scenario.
            </p>
          ))}
      </Card>
    </>
  );
}
