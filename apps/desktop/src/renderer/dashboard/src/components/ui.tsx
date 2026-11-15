import type { ReactNode } from 'react';
import type { Classification } from '@orbital/contracts';
import { cn } from '../lib/cn';

/**
 * ORBITAL UI primitives (Phase 0). Workstream A owns and extends these.
 * Accessible behaviour for overlays (dialogs, popovers, tooltips) will come from shadcn/Radix in Phase 1.
 */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn('rounded-card border border-line bg-surface shadow-card', className)}>{children}</section>
  );
}

export function CardHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-4 px-6 pt-5">
      <div>
        {eyebrow && <p className="t-eyebrow mb-1 text-ink-3">{eyebrow}</p>}
        <h2 className="t-headline text-ink">{title}</h2>
      </div>
      {action}
    </header>
  );
}

export function SectionHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="t-eyebrow mb-2 text-ink-3 tabular">{eyebrow}</p>}
      <h1 className="t-large text-ink">{title}</h1>
      {subtitle && <p className="t-body mt-1.5 max-w-2xl text-ink-2">{subtitle}</p>}
    </header>
  );
}

type Tone = 'neutral' | 'accent' | 'teal' | 'watch' | 'attention' | 'synthetic';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  teal: 'bg-teal-soft text-teal',
  watch: 'bg-watch-soft text-watch',
  attention: 'bg-attention-soft text-attention',
  synthetic: 'bg-synthetic-soft text-synthetic',
};

export function Pill({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('t-caption inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium', toneClass[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange(v: T): void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="no-drag inline-flex rounded-[10px] bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[8px] font-medium transition-[background,color,box-shadow] duration-200',
              size === 'sm' ? 't-caption px-2 py-1' : 't-footnote px-3 py-1.5',
              active ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-teal' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200',
          checked && 'translate-x-[18px]',
        )}
      />
    </button>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 border-t border-line px-6 py-4 first:border-t-0">
      <div>
        <p className="t-body font-medium text-ink">{title}</p>
        {description && <p className="t-footnote mt-0.5 max-w-xl text-ink-3">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Visual language for data classification — used in every chart legend and value chip. */
export const CLASSIFICATION_STYLE: Record<Classification, { label: string; dash: string; width: number; hollow?: boolean }> = {
  measured: { label: 'Measured', dash: '', width: 2.25 },
  derived: { label: 'Derived', dash: '', width: 1.25 },
  inferred: { label: 'Inferred', dash: '5 4', width: 1.75 },
  'self-reported': { label: 'Self-reported', dash: '1.5 3.5', width: 2, hollow: true },
  reference: { label: 'Reference', dash: '', width: 1 },
};

export function ClassificationGlyph({ kind, className }: { kind: Classification; className?: string }) {
  const s = CLASSIFICATION_STYLE[kind];
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" className={className} aria-hidden>
      {kind === 'reference' ? (
        <rect x="1" y="2" width="26" height="6" rx="3" fill="currentColor" opacity="0.18" />
      ) : (
        <line x1="1" y1="5" x2="27" y2="5" stroke="currentColor" strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" />
      )}
      {s.hollow && <circle cx="14" cy="5" r="2.6" fill="var(--o-surface)" stroke="currentColor" strokeWidth="1.4" />}
    </svg>
  );
}

export function ClassificationChip({ kind }: { kind: Classification }) {
  return (
    <span className="t-caption inline-flex items-center gap-1.5 text-ink-3">
      <ClassificationGlyph kind={kind} className="text-ink-2" />
      {CLASSIFICATION_STYLE[kind].label}
    </span>
  );
}

export function EmptyState({ icon, title, body, meta }: { icon: ReactNode; title: string; body: string; meta?: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-20 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">{icon}</div>
      <h2 className="t-title text-ink">{title}</h2>
      <p className="t-body mt-2 max-w-md text-ink-2">{body}</p>
      {meta && <p className="t-caption mt-4 text-ink-3">{meta}</p>}
    </div>
  );
}
