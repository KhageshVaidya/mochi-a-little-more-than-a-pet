import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CrewBoard } from '@orbital/contracts';
import { Storage } from './storage';
import { DataService } from './data-service';
import { GameService } from './game-service';
import { CrewService } from './crew-service';

const dir = mkdtempSync(join(tmpdir(), 'orbital-crew-'));
// Close the database before deleting its folder: Windows cannot delete open files.
afterAll(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});
const storage = new Storage(join(dir, 'c.sqlite'));
const data = new DataService(storage);
data.init();
const game = new GameService(storage, data, () => {});
const crew = new CrewService(storage, game);

describe('CrewService (voluntary, consent-based)', () => {
  it('board satisfies its contract and contains no health or wellbeing data', () => {
    const b = crew.board('CM-01', 100);
    expect(CrewBoard.safeParse(b).success).toBe(true);
    expect(JSON.stringify(b)).not.toMatch(/mood|stress|assessment|journal|hrv|YES|INSUFFICIENT/i);
  });

  it('a "support" status is visible only to the chosen audience', () => {
    crew.setStatus('CM-02', 101, 'support', 'person', 'CM-03');
    const seenBy = (me: 'CM-01' | 'CM-03') => crew.board(me, 101).visibleStatuses.find((s) => s.subjectId === 'CM-02');
    expect(seenBy('CM-03')?.status).toBe('support'); // the chosen crewmate sees it
    expect(seenBy('CM-01')).toBeUndefined(); // nobody else does
    crew.setStatus('CM-02', 102, 'support', 'crew-support');
    expect(crew.board('CM-03', 102).visibleStatuses.find((s) => s.subjectId === 'CM-02')).toBeUndefined(); // crew-support only
    expect(crew.board('CM-02', 102).myStatus?.audience).toBe('crew-support');
  });

  it('people who asked for personal space are never invited or suggested', () => {
    // Find a day where some crewmate (simulated) chose "space".
    for (let d = 40; d < 120; d++) {
      const b = crew.board('CM-04', d);
      const spacer = b.visibleStatuses.find((s) => s.status === 'space' && s.subjectId !== 'CM-04');
      if (!spacer) continue;
      expect(b.suggestion?.invitee).not.toBe(spacer.subjectId);
      expect(() => crew.propose('CM-04', d, 'puzzle', [spacer.subjectId])).toThrow(/personal space/);
      return;
    }
    throw new Error('no day with a personal-space status found');
  });

  it('proposing an activity records responses, companion logistics messages, and crew XP', () => {
    for (let d = 60; d < 140; d++) {
      const b = crew.board('CM-01', d);
      const open = b.visibleStatuses.find((s) => s.subjectId !== 'CM-01' && s.status === 'activity');
      if (!open) continue;
      const after = crew.propose('CM-01', d, 'puzzle', [open.subjectId]);
      const act = after.activities.find((a) => a.proposedBy === 'CM-01' && a.day === d)!;
      expect(act.responses['CM-01']).toBe('accepted');
      for (const m of act.companionMessages) expect(m.text).not.toMatch(/mood|stress|journal|feel/i);
      expect(game.progress('CM-01', d).xpByKind['crew-activity.joined']).toBeGreaterThan(0);
      return;
    }
    throw new Error('no open crewmate found');
  });

  it('participation is team-level only (no per-person counts)', () => {
    const p = crew.board('CM-05', 120).participation;
    for (const w of p.weeks) expect(Object.keys(w).sort()).toEqual(['activities', 'checkins', 'weekStart']);
    if (p.suggestion) expect(p.suggestion).not.toMatch(/depress|conflict|withdraw|unstable/i);
  });
});
