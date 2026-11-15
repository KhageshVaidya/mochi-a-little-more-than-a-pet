import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Storage } from './storage';
import { MissionClock, DEFAULT_DAY } from './mission-clock';
import { PrefsService } from './prefs';

const dir = mkdtempSync(join(tmpdir(), 'orbital-clock-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('MissionClock', () => {
  it('opens on day 90 with the first crew member', () => {
    const s = new Storage(join(dir, 'a.sqlite'));
    const c = new MissionClock(s);
    expect(c.get().day).toBe(DEFAULT_DAY);
    expect(c.get().astronautId).toBe('CM-01');
    c.dispose();
    s.close();
  });

  it('select keeps the day and sets the scenario; state persists across restart (never resumes playing)', () => {
    const path = join(dir, 'b.sqlite');
    const s = new Storage(path);
    const c = new MissionClock(s);
    c.command({ type: 'seek', day: 133 });
    const st = c.command({ type: 'select', astronautId: 'CM-04' });
    expect(st.day).toBe(133);
    expect(st.scenario).toBe('psych-deterioration');
    c.command({ type: 'play' });
    c.dispose();
    s.close();
    const s2 = new Storage(path);
    const c2 = new MissionClock(s2);
    expect(c2.get()).toMatchObject({ day: 133, astronautId: 'CM-04', playing: false });
    c2.dispose();
    s2.close();
  });

  it('moves backwards and forwards, and reset returns to day 0', () => {
    const s = new Storage(join(dir, 'c.sqlite'));
    const c = new MissionClock(s);
    expect(c.command({ type: 'seek', day: 150 }).day).toBe(150);
    expect(c.command({ type: 'seek', day: 12 }).day).toBe(12);
    expect(c.command({ type: 'reset' }).day).toBe(0);
    c.dispose();
    s.close();
  });
});

describe('PrefsService', () => {
  it('persists theme and companion preferences across restart', () => {
    const path = join(dir, 'p.sqlite');
    const s = new Storage(path);
    new PrefsService(s).set({ theme: 'dark', pet: { interactionsEnabled: false } });
    s.close();
    const s2 = new Storage(path);
    const p = new PrefsService(s2).get();
    expect(p.theme).toBe('dark');
    expect(p.pet.interactionsEnabled).toBe(false);
    expect(p.pet.companionId).toBe('mochi');
    expect(p.pet.visible).toBe(true); // untouched defaults survive partial patches
    s2.close();
  });
});
