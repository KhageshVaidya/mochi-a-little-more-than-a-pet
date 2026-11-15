import { ArrowDownRight, ArrowUpRight, CircleCheck, CircleDashed, TriangleAlert, Eye } from 'lucide-react';
import type { BaselineStats, Classification, MetricSnapshot, SeriesPoint } from '@orbital/contracts';
import { getSignal } from '@orbital/signals';
import { baselineStatus, formatSigned, formatValue, unitLabel, type BaselineTone } from '../lib/format';
import { Card, ClassificationChip } from './ui';
import { Sparkline, TrendChart } from './charts';
import { cn } from '../lib/cn';

const TONE: Record<BaselineTone, { cls: string; icon: typeof CircleCheck }> = {
  within: { cls: 'bg-teal-soft text-teal', icon: CircleCheck },
  watch: { cls: 'bg-watch-soft text-watch', icon: Eye },
  attention: { cls: 'bg-attention-soft text-attention', icon: TriangleAlert },
  info: { cls: 'bg-surface-2 text-ink-2', icon: ArrowUpRight },
  none: { cls: 'bg-surface-2 text-ink-3', icon: CircleDashed },
};

/** Baseline status with icon + label (never colour alone). */
export function BaselineBadge({ m, signalId }: { m: MetricSnapshot | undefined; signalId: string }) {
  const def = getSignal(signalId);
  const st = baselineStatus(m, def);
  const t = TONE[st.tone];
  const down = st.z !== null ? st.z < 0 : st.label.startsWith('-');
  const Icon = st.tone === 'info' && down ? ArrowDownRight : t.icon;
  return (
    <span className={cn('t-caption inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium whitespace-nowrap', t.cls)}>
      <Icon size={12} strokeWidth={2.25} />
      {st.label}
      {st.z !== null && <span className="tabular opacity-80">{formatSigned(st.z)}σ</span>}
    </span>
  );
}

export function ValueBlock({ m, signalId, size = 'lg' }: { m: MetricSnapshot | undefined; signalId: string; size?: 'lg' | 'md' }) {
  const def = getSignal(signalId);
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={cn(
          'font-display tabular font-semibold tracking-tight text-ink',
          size === 'lg' ? 'text-[32px] leading-none' : 'text-[24px] leading-none',
          m?.value == null && 'text-ink-3/60',
        )}
      >
        {m?.classification === 'inferred' && m.value != null && <span className="mr-0.5 text-ink-3">≈</span>}
        {formatValue(m?.value, signalId)}
      </span>
      <span className="t-footnote text-ink-3">{def ? unitLabel(def.unit) : ''}</span>
    </div>
  );
}

function observedNote(m: MetricSnapshot | undefined, day: number): string {
  if (!m || m.observedDay === null) return 'No reliable reading in the lookback window';
  if (m.observedDay === day) return 'Today';
  return `Last reading day ${m.observedDay}`;
}

/** Compact tile: value, baseline status, sparkline, classification. */
export function MetricTile({
  signalId,
  title,
  icon: Icon,
  m,
  points,
  day,
}: {
  signalId: string;
  title?: string;
  icon?: typeof CircleCheck;
  m: MetricSnapshot | undefined;
  points: readonly SeriesPoint[] | undefined;
  day: number;
}) {
  const def = getSignal(signalId);
  if (!def) return null;
  const cls = (m?.classification ?? def.allowedClassifications[0]) as Classification;
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center gap-2 text-ink-2">
        {Icon && <Icon size={16} strokeWidth={1.75} />}
        <span className="t-footnote font-medium">{title ?? def.label}</span>
      </div>
      <div className="mt-4">
        <ValueBlock m={m} signalId={signalId} />
      </div>
      <div className="mt-2.5">
        <BaselineBadge m={m} signalId={signalId} />
      </div>
      <div className="mt-3">
        <Sparkline points={points} day={day} />
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
        <ClassificationChip kind={cls} />
        <span className="t-caption text-ink-3">{observedNote(m, day)}</span>
      </div>
    </Card>
  );
}

function BaselineLine({ b, signalId }: { b: BaselineStats | null | undefined; signalId: string }) {
  if (!b) return <span className="text-ink-3">Baseline forms after day 37</span>;
  return b.kind === 'baseline' ? (
    <>
      Baseline {formatValue(b.mean, signalId)} ± {formatValue(b.sd, signalId, { precise: true })} (days {b.startDay}–{b.endDay}, n={b.n})
    </>
  ) : (
    <>First measurement {formatValue(b.mean, signalId)} (day {b.startDay})</>
  );
}

/** Detailed card: value, baseline comparison, full-mission trend chart with baseline band. */
export function MetricDetailCard({
  signalId,
  m,
  points,
  day,
  note,
}: {
  signalId: string;
  m: MetricSnapshot | undefined;
  points: readonly SeriesPoint[] | undefined;
  day: number;
  note?: string;
}) {
  const def = getSignal(signalId);
  if (!def) return null;
  const cls = (m?.classification ?? def.allowedClassifications[0]) as Classification;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="t-footnote font-medium text-ink-2">{def.label}</p>
          <div className="mt-2">
            <ValueBlock m={m} signalId={signalId} size="md" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <BaselineBadge m={m} signalId={signalId} />
          <ClassificationChip kind={cls} />
        </div>
      </div>
      <div className="mt-3">
        <TrendChart signalId={signalId} points={points} baseline={m?.baseline} day={day} />
      </div>
      <div className="t-caption mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-ink-3">
        <span className="tabular">
          <BaselineLine b={m?.baseline} signalId={signalId} />
        </span>
        <span className="tabular">
          {m?.mean7 != null && `7-day mean ${formatValue(m.mean7, signalId)} · `}
          {def.cadence === 'daily' || def.cadence === 'nightly' || def.cadence === 'continuous'
            ? `${Math.round((m?.coverage14 ?? 0) * 100)}% of last 14 days`
            : observedNote(m, day)}
        </span>
      </div>
      {note && <p className="t-caption mt-2 text-ink-3">{note}</p>}
      {['daily', 'nightly', 'continuous'].includes(def.cadence) && (
        <p className="t-caption mt-1 text-ink-3">Line: 7-day mean · faint: daily values · hollow: excluded readings</p>
      )}
    </Card>
  );
}
