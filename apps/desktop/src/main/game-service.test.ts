import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { CompanionEvent } from '@orbital/contracts';
import { Storage } from './storage';
import { DataService } from './data-service';
import { GameService } from './game-service';

const dir = mkdtempSync(join(tmpdir(), 'orbital-game-'));
// Close the database before deleting its folder: Windows cannot delete open files.
afterAll(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});
const storage = new Storage(join(dir, 'g.sqlite'));
const data = new DataService(storage);
data.init();
const emitted: CompanionEvent[] = [];
const game = new GameService(storage, data, (e) => emitted.push(e));

describe('GameService', () => {
  it('progress is derived from the synthetic history for every crew member', () => {
    for (const id of ['CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05'] as const) expect(game.progress(id, 90).xp).toBeGreaterThan(0);
    // Incomplete telemetry ⇒ fewer completed check-ins ⇒ less XP, but never punished below zero.
    expect(game.progress('CM-05', 90).xp).toBeLessThan(game.progress('CM-01', 90).xp);
  });

  it('logging rest emits a positive companion event and adds XP; the companion is only a listener', () => {
    const before = game.progress('CM-02', 100).xp;
    const after = game.log({ astronautId: 'CM-02', day: 100, kind: 'rest.day', amount: 1 });
    expect(emitted.some((e) => e.type === 'rest.logged')).toBe(true);
    expect(after.xp).toBeGreaterThanOrEqual(before); // capped at 1/day; may already be a scheduled rest day
  });

  it('cognitive games: XP, personal-best detection, and a user-sourced measurement (C1)', () => {
    game.play({ astronautId: 'CM-01', day: 95, game: 'signal-catch', score: 320, trials: 5 });
    const r = game.play({ astronautId: 'CM-01', day: 95, game: 'signal-catch', score: 280, trials: 5 });
    expect(r.personalBest).toBe(true);
    const rec = data.records('CM-01').filter((x) => x.signalId === 'cog.game.reaction');
    expect(rec.length).toBe(2);
    expect(rec.every((x) => x.source.kind === 'user')).toBe(true);
    expect(emitted.some((e) => e.type === 'cognitive.achievement')).toBe(true);
  });

  it('refuses to place locked decorations', () => {
    expect(() => game.placeDecoration('CM-05', 3, 'lounge', 0, 'photo-wall')).toThrow();
  });
});
