import { useEffect, useState } from 'react';
import type { CompanionManifest, GameDifficulty, GameHistoryEntry, GameId, ProgressState } from '@orbital/contracts';
import { cn } from '../lib/cn';

/**
 * Phase 4 game visuals: solar-system map, crew puzzle, pet home, game history.
 * Everything renders from ProgressState (computed in @orbital/gamification) — no numbers are invented here.
 */

const BODY_COLOR: Record<string, string> = {
  moon: '#b9b6ae', mars: '#d9673f', phobos: '#9b8574', ceres: '#a39a8c', europa: '#d8c9a6', titan: '#e0a548', uranus: '#8fd3d8', triton: '#c7d4e0', pluto: '#d9c2a5',
};

/** Log-scaled AU layout so the outer planets fit; moons sit beside their parent planet. */
export function SolarSystemMap({ p }: { p: ProgressState }) {
  const W = 760;
  const H = 190;
  const x = (au: number) => 70 + (Math.log10(au * 10) / Math.log10(400)) * (W - 110);
  const parents: Record<string, { name: string; au: number; r: number; color: string }> = {
    earth: { name: 'Earth', au: 1, r: 9, color: '#4f8fe6' },
    jupiter: { name: 'Jupiter', au: 5.2, r: 15, color: '#d6a77a' },
    saturn: { name: 'Saturn', au: 9.5, r: 13, color: '#e3c78b' },
    neptune: { name: 'Neptune', au: 30.1, r: 11, color: '#4b6fe0' },
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Solar-system map: ${p.explorationHistory.length} of ${p.exploration.length} destinations reached`}>
      <defs>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset="1" stopColor="#f2a33a" />
        </radialGradient>
      </defs>
      <circle cx={8} cy={H / 2} r={52} fill="url(#sun)" opacity={0.9} />
      <line x1={60} y1={H / 2} x2={W - 20} y2={H / 2} stroke="var(--o-line-strong)" strokeDasharray="2 6" />
      {Object.entries(parents).map(([id, b]) => (
        <g key={id}>
          <circle cx={x(b.au)} cy={H / 2} r={b.r} fill={b.color} opacity={0.85} />
          {id === 'saturn' && <ellipse cx={x(b.au)} cy={H / 2} rx={b.r + 8} ry={4} fill="none" stroke={b.color} strokeWidth={1.5} />}
          <text x={x(b.au)} y={H / 2 + b.r + 14} textAnchor="middle" className="fill-[var(--o-ink-3)] text-[10px]">
            {b.name}
          </text>
        </g>
      ))}
      {p.exploration.map((d, i) => {
        const cx = x(d.au) + (d.kind === 'moon' ? (d.parent === 'earth' ? 16 : 22) : 0);
        const cy = d.kind === 'moon' ? H / 2 - 30 - (i % 2) * 12 : H / 2;
        const r = d.kind === 'planet' ? 11 : d.kind === 'dwarf-planet' ? 6 : 5;
        return (
          <g key={d.id} data-destination={d.id} data-reached={d.reached}>
            <title>{`${d.name}${d.reached ? ` — reached day ${d.reachedDay}` : d.current ? ' — next stop' : ''}`}</title>
            {d.current && <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="var(--o-accent)" strokeWidth={2} className="animate-pulse" />}
            <circle cx={cx} cy={cy} r={r} fill={d.reached || d.current ? BODY_COLOR[d.id] ?? '#aaa' : 'var(--o-surface-3)'} stroke={d.reached ? 'var(--o-teal)' : 'var(--o-line-strong)'} strokeWidth={d.reached ? 2 : 1} />
            <text x={cx} y={cy - r - 5} textAnchor="middle" className={cn('text-[10px]', d.reached ? 'fill-[var(--o-ink)]' : 'fill-[var(--o-ink-3)]')}>
              {d.name.replace('The ', '')}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function CrewPuzzle({ p }: { p: ProgressState }) {
  const { pieces, total, title } = p.crewPuzzle;
  const cols = 6;
  return (
    <div>
      <div className="grid gap-[2px] overflow-hidden rounded-[12px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} role="img" aria-label={`Crew puzzle “${title}”: ${pieces} of ${total} pieces placed`}>
        {Array.from({ length: total }, (_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const hue = 210 + row * 18 + col * 6;
          return <div key={i} className="aspect-square" style={{ background: i < pieces ? `hsl(${hue} 55% ${40 + ((row + col) % 3) * 8}%)` : 'var(--o-surface-3)' }} />;
        })}
      </div>
      <p className="t-caption mt-2 text-ink-3">
        “{title}” · {pieces}/{total} pieces placed by the whole crew this week
      </p>
    </div>
  );
}

const assetUrl = (id: string, file: string) => `orbital-asset://pets/${id}/${encodeURI(file)}`;
const ENV_BG: Record<string, string> = {
  'env-lunar': 'linear-gradient(180deg,#1b2233,#5b5f6b)',
  'env-mars': 'linear-gradient(180deg,#3b2a4a,#d77a4a)',
  'env-europa': 'linear-gradient(180deg,#14213b,#a9c6dd)',
};

/** Pet living space. Items appear beside the companion; the companion's artwork itself is never altered. */
export function PetHome({ p, onEquip, onPlay }: { p: ProgressState; onEquip(slot: 'accessory' | 'toy' | 'environment', id: string | null): void; onPlay(toyId: string): void }) {
  const [manifest, setManifest] = useState<CompanionManifest | null>(null);
  const [bounce, setBounce] = useState(0);
  useEffect(() => {
    void window.orbital.invoke('companion:manifest').then(setManifest);
  }, []);
  const room = p.habitat.rooms.find((r) => r.id === 'pet-home');
  const c = p.companion;
  const item = (id: string | null) => c.items.find((i) => i.id === id);
  if (!room?.unlocked) {
    return (
      <div className="rounded-[14px] border border-dashed border-line-strong p-4">
        <p className="t-footnote font-semibold text-ink">Pet living space</p>
        <p className="t-caption text-ink-3">Unlocks with {room?.requirement ?? '…'} — works whether or not the companion window is shown.</p>
        <div className="mt-2 h-1 rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-teal" style={{ width: `${(room?.progress ?? 0) * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div data-testid="pet-home">
      <div className="relative flex h-44 items-end justify-center overflow-hidden rounded-[16px] border border-line" style={{ background: ENV_BG[c.equipped.environment ?? ''] ?? 'var(--o-surface-2)' }}>
        {manifest && (
          <img
            key={bounce}
            src={assetUrl(manifest.id, manifest.artwork.default)}
            alt={manifest.displayName}
            draggable={false}
            className={cn('h-36 w-auto object-contain', bounce > 0 && 'animate-bounce [animation-iteration-count:2]')}
          />
        )}
        {c.equipped.toy && <span className="t-caption absolute bottom-2 left-3 rounded-full bg-surface/90 px-2 py-0.5 text-ink">🧸 {item(c.equipped.toy)?.name}</span>}
        {c.equipped.accessory && <span className="t-caption absolute top-2 left-3 rounded-full bg-surface/90 px-2 py-0.5 text-ink">✦ {item(c.equipped.accessory)?.name}</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {c.items.map((i) => {
          const slot = i.kind === 'decoration' ? null : i.kind;
          const on = slot && c.equipped[slot] === i.id;
          return (
            <button
              key={i.id}
              disabled={!i.unlocked || !slot}
              onClick={() => slot && onEquip(slot, on ? null : i.id)}
              title={i.unlocked ? i.description : `Unlocks via ${i.unlockedBy}`}
              className={cn('t-caption rounded-full border px-2.5 py-1 font-medium disabled:opacity-40', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2')}
            >
              {i.unlocked ? i.name : `🔒 ${i.name}`}
            </button>
          );
        })}
      </div>
      {c.equipped.toy && (
        <button
          onClick={() => {
            setBounce((b) => b + 1);
            onPlay(c.equipped.toy!);
          }}
          className="t-footnote mt-3 rounded-full bg-accent px-3 py-1.5 font-medium text-bg"
        >
          Play with the {item(c.equipped.toy)?.name.toLowerCase()}
        </button>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {c.achievements.map((a) => (
          <div key={a.id} className={cn('rounded-[10px] border px-2 py-1.5', a.unlocked ? 'border-line' : 'border-dashed border-line opacity-60')}>
            <p className="t-caption font-semibold text-ink">{a.title}</p>
            <p className="t-caption text-ink-3">{a.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Personal score history for one game — a sparkline per difficulty. Never used for any health decision. */
export function GameHistory({ astronautId, game, version }: { astronautId: string; game: GameId; version: number }) {
  const [h, setH] = useState<GameHistoryEntry[]>([]);
  useEffect(() => {
    void window.orbital.invoke('game:history', { astronautId: astronautId as never, game }).then(setH);
  }, [astronautId, game, version]);
  if (!h.length) return <p className="t-caption text-ink-3">No games played yet — your personal history will appear here.</p>;
  const lowerBetter = game === 'signal-catch';
  const levels: GameDifficulty[] = ['easy', 'standard', 'hard'];
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="game-history">
      {levels.map((lv) => {
        const xs = h.filter((e) => e.difficulty === lv).map((e) => e.score);
        if (!xs.length) return <div key={lv} className="t-caption text-ink-3">{lv}: not played</div>;
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        const pts = xs.map((v, i) => `${(i / Math.max(1, xs.length - 1)) * 120},${36 - ((v - lo) / Math.max(1e-9, hi - lo)) * 32}`).join(' ');
        const best = lowerBetter ? lo : hi;
        return (
          <div key={lv}>
            <p className="t-caption font-semibold text-ink-2 capitalize">{lv}</p>
            <svg viewBox="0 0 124 40" className="h-10 w-full" aria-label={`${lv} history, ${xs.length} games`}>
              {xs.length > 1 ? <polyline points={pts} fill="none" stroke="var(--o-accent)" strokeWidth={2} strokeLinecap="round" /> : <circle cx={60} cy={20} r={4} fill="var(--o-accent)" />}
            </svg>
            <p className="t-caption tabular text-ink-3">
              {xs.length} games · best {best}
              {lowerBetter ? ' ms' : ' stars'} · last {xs.at(-1)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
