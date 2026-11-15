import { useEffect, useRef, useState } from 'react';
import type { GameDifficulty, GameId } from '@orbital/contracts';

/**
 * Two short, voluntary cognitive games. Results are recorded as user-entered measurements
 * (cog.game.*) and earn XP for playing — never for the score itself (a personal best adds a small bonus).
 */

export interface GameOutcome {
  game: GameId;
  score: number;
  trials: number;
  difficulty: GameDifficulty;
}

/** Difficulty settings (Phase 4). Easier levels are slower and shorter; nothing is ever penalised. */
export const SIGNAL_LEVELS: Record<GameDifficulty, { trials: number; minDelay: number; spread: number }> = {
  easy: { trials: 3, minDelay: 1500, spread: 1500 },
  standard: { trials: 5, minDelay: 1200, spread: 2300 },
  hard: { trials: 7, minDelay: 700, spread: 3300 },
};
export const MEMORY_LEVELS: Record<GameDifficulty, { start: number; stepMs: number; cells: number; max: number }> = {
  easy: { start: 2, stepMs: 850, cells: 9, max: 8 },
  standard: { start: 3, stepMs: 650, cells: 9, max: 9 },
  hard: { start: 4, stepMs: 480, cells: 16, max: 12 },
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

/** Signal Catch: click (or press Space/Enter) as soon as the star lights up. Early clicks simply retry (no penalty). */
export function SignalCatch({ onDone, difficulty = 'standard' }: { onDone(o: GameOutcome): void; difficulty?: GameDifficulty }) {
  const L = SIGNAL_LEVELS[difficulty];
  const [phase, setPhase] = useState<'ready' | 'wait' | 'go' | 'early' | 'done'>('ready');
  const [times, setTimes] = useState<number[]>([]);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const arm = () => {
    setPhase('wait');
    timer.current = setTimeout(() => {
      t0.current = performance.now();
      setPhase('go');
    }, L.minDelay + Math.random() * L.spread);
  };
  const click = () => {
    if (phase === 'ready' || phase === 'early') return arm();
    if (phase === 'wait') {
      clearTimeout(timer.current);
      return setPhase('early');
    }
    if (phase === 'go') {
      const next = [...times, Math.round(performance.now() - t0.current)];
      setTimes(next);
      if (next.length >= L.trials) {
        setPhase('done');
        onDone({ game: 'signal-catch', score: Math.round(median(next)), trials: next.length, difficulty });
      } else arm();
    }
  };
  return (
    <button
      data-testid="signal-catch"
      autoFocus
      aria-live="polite"
      aria-label="Signal Catch. Press Space or Enter, or click, when the star lights up."
      onClick={click}
      className="flex h-44 w-full flex-col items-center justify-center rounded-[16px] border border-line bg-surface-2/60 transition-colors"
      style={phase === 'go' ? { background: 'color-mix(in oklab, var(--crew-yellow) 22%, var(--o-surface))' } : undefined}
    >
      <span className="text-[40px] leading-none" aria-hidden>
        {phase === 'go' ? '★' : '☆'}
      </span>
      <span className="t-footnote mt-3 font-medium text-ink">
        {phase === 'ready' && 'Click or press Space to start · respond as soon as the star lights up'}
        {phase === 'wait' && 'Wait for it…'}
        {phase === 'go' && 'Now!'}
        {phase === 'early' && 'A little early — no problem. Click to try that one again.'}
        {phase === 'done' && `Median ${Math.round(median(times))} ms — nice!`}
      </span>
      <span className="t-caption mt-1 text-ink-3">
        Trial {Math.min(times.length + 1, L.trials)} of {L.trials} · {difficulty}
      </span>
    </button>
  );
}

/** Constellation Memory: watch the stars light up, then repeat the sequence (click, or number keys 1–9). Grows by one each round. */
export function ConstellationMemory({ onDone, difficulty = 'standard' }: { onDone(o: GameOutcome): void; difficulty?: GameDifficulty }) {
  const L = MEMORY_LEVELS[difficulty];
  const [seq, setSeq] = useState<number[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [input, setInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<'ready' | 'show' | 'input' | 'done'>('ready');
  const best = useRef(0);

  const play = (s: number[]) => {
    setPhase('show');
    setInput([]);
    s.forEach((cell, k) => {
      setTimeout(() => setShown(cell), L.stepMs * k + 300);
      setTimeout(() => setShown(null), L.stepMs * k + 300 + L.stepMs * 0.7);
    });
    setTimeout(() => setPhase('input'), L.stepMs * s.length + 400);
  };
  const start = () => {
    const s = Array.from({ length: L.start }, () => Math.floor(Math.random() * L.cells));
    setSeq(s);
    best.current = 0;
    play(s);
  };
  const tap = (cell: number) => {
    if (phase !== 'input') return;
    const next = [...input, cell];
    setInput(next);
    if (seq[next.length - 1] !== cell) {
      setPhase('done');
      onDone({ game: 'constellation-memory', score: best.current, trials: Math.max(1, seq.length - L.start + 1), difficulty });
      return;
    }
    if (next.length === seq.length) {
      best.current = seq.length;
      if (seq.length >= L.max) {
        setPhase('done');
        onDone({ game: 'constellation-memory', score: best.current, trials: Math.max(1, seq.length - L.start + 1), difficulty });
        return;
      }
      const s = [...seq, Math.floor(Math.random() * L.cells)];
      setSeq(s);
      setTimeout(() => play(s), 500);
    }
  };
  // Keyboard: number keys 1–9 tap stars (standard/easy 3×3 grid).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (phase === 'input' && n >= 1 && n <= Math.min(9, L.cells)) tap(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const cols = L.cells === 16 ? 'grid-cols-4' : 'grid-cols-3';
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-[16px] border border-line bg-surface-2/60 py-3">
      {phase === 'ready' ? (
        <button onClick={start} className="t-footnote rounded-full bg-accent px-4 py-2 font-medium text-bg">
          Start · remember the constellation
        </button>
      ) : (
        <>
          <div className={`grid ${cols} gap-2`} data-testid="constellation">
            {Array.from({ length: L.cells }, (_, k) => (
              <button
                key={k}
                onClick={() => tap(k)}
                aria-label={`Star ${k + 1}`}
                className="h-9 w-9 rounded-full border border-line text-[18px] leading-none transition-colors"
                style={{ background: shown === k ? 'var(--crew-yellow)' : 'var(--o-surface)' }}
              >
                {shown === k ? '★' : '·'}
              </button>
            ))}
          </div>
          <p className="t-caption mt-2 text-ink-3">
            {phase === 'show' && 'Watch…'}
            {phase === 'input' && `Your turn · ${input.length}/${seq.length}`}
            {phase === 'done' && `You recalled ${best.current} stars in a row. Lovely!`}
          </p>
        </>
      )}
    </div>
  );
}
