import { useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import type { AstronautProfile } from '@orbital/contracts';
import { useApp, useAstronaut } from '../stores/app';
import { cn } from '../lib/cn';

export const crewColor = (p: Pick<AstronautProfile, 'accent'>) => `var(--crew-${p.accent})`;

/** Original, abstract avatar: initials on the crew member's validated categorical colour. */
export function Avatar({ p, size = 36, ring = false }: { p: AstronautProfile; size?: number; ring?: boolean }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ring && 'ring-2 ring-surface ring-offset-2')}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(145deg, color-mix(in oklab, ${crewColor(p)} 88%, white), ${crewColor(p)})`,
        ['--tw-ring-offset-color' as string]: crewColor(p),
      }}
      aria-hidden
    >
      {p.initials}
    </span>
  );
}

/** Sidebar crew switcher — a natural part of the shell, not a debug panel. */
export function CrewSwitcher() {
  const crew = useApp((s) => s.crew);
  const missionCommand = useApp((s) => s.missionCommand);
  const current = useAstronaut();
  const [open, setOpen] = useState(false);
  if (!current) return null;
  return (
    <div className="no-drag relative">
      {open && (
        <div className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-[14px] border border-line bg-surface py-1.5 shadow-raised">
          <p className="t-eyebrow px-3.5 pt-1.5 pb-2 text-ink-3">Crew</p>
          {crew.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                void missionCommand({ type: 'select', astronautId: p.id });
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-surface-2"
            >
              <Avatar p={p} size={28} />
              <span className="min-w-0 flex-1">
                <span className="t-footnote block truncate font-semibold text-ink">{p.name}</span>
                <span className="t-caption block truncate text-ink-3">
                  {p.id} · {p.scenarioLabel}
                </span>
              </span>
              {p.id === current.id && <Check size={15} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface/70 p-3 text-left transition-colors hover:bg-surface"
      >
        <Avatar p={current} size={34} />
        <span className="min-w-0 flex-1">
          <span className="t-footnote block truncate font-semibold text-ink">{current.name}</span>
          <span className="t-caption block truncate text-ink-3">
            {current.id} · {current.role}
          </span>
        </span>
        <ChevronsUpDown size={15} className="text-ink-3" />
      </button>
      <p className="t-caption mt-2 px-1 text-ink-3">Fictional crew · synthetic data</p>
    </div>
  );
}
