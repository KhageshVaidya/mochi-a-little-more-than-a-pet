import type { ReactNode } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssessmentState, AssessmentTimeline, BaselineStats, SeriesPoint, TelemetryDay } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { formatValue, unitLabel } from '../lib/format';
import { CLASSIFICATION_STYLE } from './ui';
import { cn } from '../lib/cn';

/**
 * ORBITAL chart primitives (dataviz method): 2px lines, one y-axis, recessive grid, hover tooltip,
 * personal-baseline band, data gaps shown as gaps, flagged (excluded) readings as hollow points.
 */

const AXIS_TICK = { fontSize: 11, fill: 'var(--o-ink-3)' };

/** Direct label at the end of a line (selective labelling: one label per series). */
export function endLabel(text: string, lastIndex: number) {
  return (p: { index?: number; x?: string | number; y?: string | number }) =>
    p.index === lastIndex && p.x != null && p.y != null ? (
      <text x={Number(p.x) + 6} y={Number(p.y) + 4} fontSize={11} fill="var(--o-ink-2)">
        {text}
      </text>
    ) : (
      <g />
    );
}
const MISSION_TICKS = [0, 30, 60, 90, 120, 150, 179];

function niceDomain(values: number[], baseline: BaselineStats | null): [number, number] {
  const vs = [...values];
  if (baseline) vs.push(baseline.mean - baseline.sd, baseline.mean + baseline.sd);
  if (!vs.length) return [0, 1];
  let lo = Math.min(...vs);
  let hi = Math.max(...vs);
  const pad = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.05);
  lo -= pad;
  hi += pad;
  return [Number(lo.toPrecision(3)), Number(hi.toPrecision(3))];
}

function TooltipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] leading-[17px] text-ink shadow-raised">{children}</div>
  );
}

interface TrendRow {
  day: number;
  /** Raw reliable value (daily signals: drawn faint). */
  v: number | null;
  /** 7-day rolling mean of reliable values (daily signals: the primary line). */
  r: number | null;
  /** Flagged / excluded reading. */
  f: number | null;
  p?: SeriesPoint;
}

export function TrendChart({
  signalId,
  points,
  baseline,
  day,
  height = 150,
  color = 'var(--o-accent)',
}: {
  signalId: string;
  points: readonly SeriesPoint[] | undefined;
  baseline: BaselineStats | null | undefined;
  day: number;
  height?: number;
  color?: string;
}) {
  const def = getSignal(signalId);
  if (!def) return null;
  const visible = (points ?? []).filter((p) => p.day <= day);
  const daily = ['daily', 'nightly', 'continuous'].includes(def.cadence);
  let rows: TrendRow[];
  if (daily) {
    const byDay = new Map(visible.map((p) => [p.day, p]));
    const reliable = visible.filter((p) => !p.flagged);
    rows = Array.from({ length: day + 1 }, (_, d) => {
      const p = byDay.get(d);
      const w = reliable.filter((x) => x.day <= d && x.day > d - 7);
      return {
        day: d,
        v: p && !p.flagged ? p.value : null,
        r: w.length >= 3 ? w.reduce((a, x) => a + x.value, 0) / w.length : null,
        f: p && p.flagged ? p.value : null,
        p,
      };
    });
  } else {
    rows = visible.map((p) => ({ day: p.day, v: p.flagged ? null : p.value, r: null, f: p.flagged ? p.value : null, p }));
  }
  const cls = visible[0]?.classification ?? def.allowedClassifications[0]!;
  const style = CLASSIFICATION_STYLE[cls];
  const band = baseline?.kind === 'baseline' ? baseline : null;
  const domain = niceDomain(visible.filter((p) => !p.flagged).map((p) => p.value), band);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--o-line)" />
          <XAxis dataKey="day" type="number" domain={[0, 179]} ticks={MISSION_TICKS} tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis domain={domain} tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => formatValue(v, signalId)} />
          {band && (
            <ReferenceArea y1={band.mean - band.sd} y2={band.mean + band.sd} fill="var(--o-accent)" fillOpacity={0.08} stroke="none" ifOverflow="hidden" />
          )}
          {baseline && <ReferenceLine y={baseline.mean} stroke="var(--o-ink-3)" strokeDasharray="3 4" strokeWidth={1} ifOverflow="hidden" />}
          <ReferenceLine x={day} stroke="var(--o-ink-2)" strokeOpacity={0.3} strokeWidth={1} />
          {daily && (
            <Line dataKey="v" stroke={color} strokeOpacity={0.28} strokeWidth={1} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          )}
          <Line
            dataKey={daily ? 'r' : 'v'}
            stroke={color}
            strokeWidth={2}
            strokeDasharray={style.dash}
            strokeLinecap="round"
            dot={daily ? false : { r: 3.5, fill: style.hollow ? 'var(--o-surface)' : color, stroke: daily ? color : 'var(--o-surface)', strokeWidth: 2 }}
            activeDot={{ r: 4, stroke: 'var(--o-surface)', strokeWidth: 2 }}
            connectNulls={!daily}
            isAnimationActive={false}
          />
          <Scatter
            dataKey="f"
            isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number; payload?: TrendRow }) =>
              props.payload?.f == null || props.cx == null || props.cy == null ? <g /> : (
                <circle cx={props.cx} cy={props.cy} r={3} fill="var(--o-surface)" stroke="var(--o-ink-3)" strokeWidth={1.25} />
              )
            }
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: 'var(--o-line-strong)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as TrendRow | undefined;
              if (!active || !row) return null;
              const p = row.p;
              return (
                <TooltipBox>
                  <p className="font-semibold">Day {row.day}</p>
                  {p ? (
                    <>
                      <p className="tabular">
                        {formatValue(p.value, signalId)} {unitLabel(def.unit)}
                        {p.flagged && <span className="text-ink-3"> · excluded (quality)</span>}
                      </p>
                      {row.r !== null && (
                        <p className="tabular text-ink-2">
                          7-day mean {formatValue(row.r, signalId)} {unitLabel(def.unit)}
                        </p>
                      )}
                      <p className="text-ink-3">
                        {CLASSIFICATION_STYLE[p.classification].label} · quality {Math.round(p.quality * 100)}% · synthetic
                      </p>
                    </>
                  ) : (
                    <p className="text-ink-3">No reading</p>
                  )}
                  {baseline && (
                    <p className="text-ink-3">
                      Baseline {formatValue(baseline.mean, signalId)}
                      {baseline.kind === 'baseline' && ` ± ${formatValue(baseline.sd, signalId, { precise: true })}`}
                    </p>
                  )}
                </TooltipBox>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ points, day, color = 'var(--o-accent)', window = 30 }: { points: readonly SeriesPoint[] | undefined; day: number; color?: string; window?: number }) {
  const data = (points ?? []).filter((p) => !p.flagged && p.day <= day && p.day > day - window);
  if (data.length < 2) return <div className="h-9" />;
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <XAxis hide dataKey="day" type="number" domain={['dataMin', 'dataMax']} />
          <Line dataKey="value" stroke={color} strokeWidth={1.75} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Multi-series chart on a COMMON scale: standard deviations from each signal's own baseline. */
export function DeviationChart({
  series,
  day,
  height = 220,
}: {
  series: { id: string; label: string; color: string; rows: { day: number; z: number | null }[] }[];
  day: number;
  height?: number;
}) {
  const rows = Array.from({ length: day + 1 }, (_, d) => {
    const r: Record<string, number | null> & { day: number } = { day: d };
    for (const s of series) r[s.id] = s.rows[d]?.z ?? null;
    return r;
  });
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 64, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--o-line)" />
            <XAxis dataKey="day" type="number" domain={[0, 179]} ticks={MISSION_TICKS} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis domain={[-4, 4]} ticks={[-4, -2, 0, 2, 4]} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}σ`} />
            <ReferenceArea y1={-1} y2={1} fill="var(--o-accent)" fillOpacity={0.06} stroke="none" />
            <ReferenceLine y={0} stroke="var(--o-ink-3)" strokeDasharray="3 4" />
            <ReferenceLine x={day} stroke="var(--o-ink-2)" strokeOpacity={0.3} />
            {series.map((s) => (
              <Line
                key={s.id}
                dataKey={s.id}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
                label={endLabel(s.label, rows.length - 1)}
              />
            ))}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--o-line-strong)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox>
                    <p className="font-semibold">Day {label}</p>
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="tabular flex items-center gap-2">
                        <span className="inline-block h-0.5 w-3 rounded" style={{ background: String(p.color) }} />
                        {p.name}: {typeof p.value === 'number' ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)} SD` : '—'}
                      </p>
                    ))}
                  </TooltipBox>
                ) : null
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {series.map((s) => (
          <span key={s.id} className="t-caption inline-flex items-center gap-2 text-ink-2">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="t-caption text-ink-3">Band: within ±1 SD of personal baseline · 7-day rolling mean</span>
      </div>
    </div>
  );
}

export const STATE_META: Record<AssessmentState, { label: string; color: string; glyph: string }> = {
  YES: { label: 'Elevated signal', color: 'var(--o-state-yes)', glyph: '▲' },
  NO: { label: 'No elevated signal', color: 'var(--o-state-no)', glyph: '●' },
  INSUFFICIENT_DATA: { label: 'Insufficient data', color: 'var(--o-state-insufficient)', glyph: '◌' },
};

/** 180-day strip of Brain Health states. Future days are blank — the engine only sees data up to "today". */
export function StateTimeline({ timeline, day }: { timeline: AssessmentTimeline | null; day: number }) {
  return (
    <div>
      <div className="flex h-7 items-stretch gap-px" role="img" aria-label="Assessment state for each mission day">
        {Array.from({ length: 180 }, (_, d) => {
          const s = timeline?.[d]?.state;
          const future = d > day;
          return (
            <div
              key={d}
              title={future ? `Day ${d}` : `Day ${d}: ${s ? STATE_META[s].label : '—'}`}
              className={cn('flex-1 rounded-[1.5px]', d === day && 'ring-2 ring-ink ring-offset-1 ring-offset-surface')}
              style={{
                background: future || !s ? 'var(--o-surface-2)' : STATE_META[s].color,
                opacity: future ? 0.6 : s === 'INSUFFICIENT_DATA' ? 0.45 : 0.9,
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-4">
          {(Object.keys(STATE_META) as AssessmentState[]).map((s) => (
            <span key={s} className="t-caption inline-flex items-center gap-1.5 text-ink-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATE_META[s].color, opacity: s === 'INSUFFICIENT_DATA' ? 0.45 : 0.9 }} />
              {STATE_META[s].label}
            </span>
          ))}
        </div>
        <span className="t-caption tabular text-ink-3">Day 0 → 179</span>
      </div>
    </div>
  );
}

const PHASE_FILL = { sleep: 'var(--o-accent)', exercise: 'var(--o-ink-2)' } as const;

/** One telemetry trace for a mission day (x = minutes since 00:00), with phase shading and a playhead. */
export function TelemetryTrace({
  t,
  field,
  label,
  unit,
  color,
  playhead,
  domain,
}: {
  t: TelemetryDay;
  field: 'hr' | 'resp' | 'spo2' | 'skinTemp';
  label: string;
  unit: string;
  color: string;
  playhead: number;
  domain: [number, number];
}) {
  const visibleTo = playhead;
  const rows = t[field].map((v, i) => ({ m: i * t.stepMinutes, v: i * t.stepMinutes <= visibleTo ? v : null }));
  const segments: { from: number; to: number; phase: 'sleep' | 'exercise' }[] = [];
  t.phase.forEach((ph, i) => {
    if (ph === 'work') return;
    const m = i * t.stepMinutes;
    const last = segments.at(-1);
    if (last && last.phase === ph && last.to === m) last.to = m + t.stepMinutes;
    else segments.push({ from: m, to: m + t.stepMinutes, phase: ph });
  });
  return (
    <div className="h-[120px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--o-line)" />
          {segments.map((s, i) => (
            <ReferenceArea key={i} x1={s.from} x2={s.to} fill={PHASE_FILL[s.phase]} fillOpacity={0.07} stroke="none" />
          ))}
          <XAxis
            dataKey="m"
            type="number"
            domain={[0, 1440]}
            ticks={[0, 240, 480, 720, 960, 1200, 1440]}
            tickFormatter={(m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis domain={domain} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
          <ReferenceLine x={playhead} stroke="var(--o-ink-2)" strokeOpacity={0.45} />
          <Line dataKey="v" name={label} stroke={color} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: 'var(--o-line-strong)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as { m: number; v: number | null } | undefined;
              if (!active || !row) return null;
              const hh = String(Math.floor(row.m / 60)).padStart(2, '0');
              const mm = String(row.m % 60).padStart(2, '0');
              return (
                <TooltipBox>
                  <p className="font-semibold">
                    {hh}:{mm} · {t.phase[row.m / t.stepMinutes]}
                  </p>
                  <p className="tabular">{row.v === null ? 'No signal' : `${row.v} ${unit}`}</p>
                </TooltipBox>
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
