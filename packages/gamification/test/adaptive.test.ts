import { describe, expect, it } from 'vitest';
import { ProgressState, type EngagementEvent, type Recommendation, type RecommendationKind } from '@orbital/contracts';
import { ADAPTIVE_COUNTS, DESTINATIONS, ROOMS, dailyMissions, evaluateProgress, type MissionContext } from '../src';

const ctx: MissionContext = { restDay: false, sleepBelowUsual: false, activityBelowUsual: false, measurementDay: false };
const opts = { prescribedExerciseMin: 90, contextForDay: () => ctx };
let n = 0;
const ev = (day: number, kind: EngagementEvent['kind'], extra: Partial<EngagementEvent> = {}): EngagementEvent => ({ id: `t${n++}`, subjectId: 'CM-01', missionDay: day, kind, amount: 1, source: 'user', ...extra });
const rec = (kind: RecommendationKind): Recommendation => ({ id: `rec:5:${kind}`, kind, title: `T ${kind}`, description: 'd', category: 'recovery', basis: { source: 'statistical', domains: ['sleep'], signals: [] }, optional: true, priority: 1, nasaRiskIds: [] });

describe('adaptive missions (Phase 4)', () => {
  it('an approved recommendation REPLACES the rotating slot: same number of missions, same bonus', () => {
    const plain = dailyMissions(5, ctx, []);
    const adaptive = dailyMissions(5, { ...ctx, recommendations: [rec('sleep-recovery-expedition')] }, []);
    expect(adaptive.length).toBe(plain.length);
    expect(adaptive.reduce((a, m) => a + m.bonusXp, 0)).toBe(plain.reduce((a, m) => a + m.bonusXp, 0));
    const m = adaptive.find((x) => x.adaptive)!;
    expect(m.recommendationId).toBe('rec:5:sleep-recovery-expedition');
    expect(m.reason).toMatch(/^Optional/);
  });

  it('deterioration is never rewarded: max achievable XP is identical with or without recommendations', () => {
    const everything = (day: number) => (['checkin.completed', 'exercise.session', 'recovery.session', 'mindfulness.session', 'cognitive-game.played', 'crew-activity.joined', 'journal.written', 'movement.break', 'companion.chat', 'recreation.session', 'measurement.completed', 'help.requested', 'rest.day'] as const).map((k) => ev(day, k, k === 'exercise.session' ? { amount: 90 } : {}));
    const events = Array.from({ length: 20 }, (_, d) => everything(d)).flat();
    const kinds = Object.keys(ADAPTIVE_COUNTS) as RecommendationKind[];
    const base = evaluateProgress('CM-01', events, 19, opts).xp;
    for (const k of kinds) {
      const withRec = evaluateProgress('CM-01', events, 19, { ...opts, contextForDay: () => ({ ...ctx, recommendations: [rec(k)] }) }).xp;
      expect(withRec, k).toBe(base);
    }
  });

  it('XP never depends on biology: the reward engine does not read health records at all', () => {
    expect(evaluateProgress.length).toBe(4); // (subject, events, day, opts) — no records parameter
  });

  it('rest, recovery and asking for support complete adaptive missions and earn XP', () => {
    const m = dailyMissions(5, { ...ctx, recommendations: [rec('human-support')] }, [ev(5, 'help.requested')]);
    expect(m.find((x) => x.adaptive)!.completed).toBe(true);
    const rest = dailyMissions(5, { ...ctx, recommendations: [rec('cognitive-rest')] }, [ev(5, 'rest.day')]);
    expect(rest.find((x) => x.adaptive)!.completed).toBe(true);
    const p = evaluateProgress('CM-01', [ev(1, 'help.requested'), ev(2, 'rest.day')], 3, opts);
    expect(p.xpByKind['help.requested']).toBeGreaterThan(0);
    expect(p.xpByKind['rest.day']).toBeGreaterThan(0);
  });

  it('missing activities never remove rewards (XP and unlocks are monotonic)', () => {
    const events = [ev(1, 'journal.written'), ev(2, 'companion.chat'), ev(3, 'movement.break')];
    let prev = -1;
    let prevUnlocked = 0;
    for (let d = 0; d < 40; d++) {
      const p = evaluateProgress('CM-01', events, d, opts);
      expect(p.xp).toBeGreaterThanOrEqual(prev);
      const unlocked = p.achievements.filter((a) => a.unlocked).length + p.companion.items.filter((i) => i.unlocked).length;
      expect(unlocked).toBeGreaterThanOrEqual(prevUnlocked);
      prev = p.xp;
      prevUnlocked = unlocked;
    }
  });
});

describe('exploration, habitat and companion progression', () => {
  const lots = (days: number) =>
    Array.from({ length: days }, (_, d) => [ev(d, 'cognitive-game.played'), ev(d, 'recovery.session'), ev(d, 'exercise.session', { amount: 60 }), ev(d, 'journal.written'), ev(d, 'companion.chat'), ev(d, 'companion.played')]).flat();

  it('solar-system route: balanced activity reaches destinations, records the day, unlocks environments and decorations', () => {
    const p = evaluateProgress('CM-01', lots(40), 40, opts);
    expect(p.exploration.length).toBe(DESTINATIONS.length);
    expect(p.explorationHistory.map((h) => h.destinationId).slice(0, 2)).toEqual(['moon', 'mars']);
    expect(p.explorationHistory.every((h, i, a) => i === 0 || h.day >= a[i - 1]!.day)).toBe(true);
    expect(p.environments.find((e) => e.id === 'env-mars')!.unlocked).toBe(true);
    expect(p.habitat.decorations.find((d) => d.id === 'mars-globe')!.unlocked).toBe(true);
  });

  it('connection points (journal, crew, companion, support) are required — training alone cannot finish the route', () => {
    const noConnection = Array.from({ length: 60 }, (_, d) => [ev(d, 'cognitive-game.played'), ev(d, 'recovery.session'), ev(d, 'exercise.session', { amount: 60 })]).flat();
    const ex = evaluateProgress('CM-01', noConnection, 60, opts).exploration;
    expect(ex[0]!.reached).toBe(true); // the Moon needs no connection points
    expect(ex[1]!.reached).toBe(false); // Mars and beyond do
  });

  it('habitat has all required rooms', () => {
    const names = ROOMS.map((r) => r.name);
    for (const n of ['Sleeping quarters', 'Gym', 'Recreation room', 'Hydroponic garden', 'Research laboratory', 'Pet living space']) expect(names).toContain(n);
  });

  it('the pet home can be unlocked without the companion (rest days), so the game works with the companion hidden', () => {
    const rests = [6, 13, 20, 27].map((d) => ev(d, 'rest.day'));
    expect(evaluateProgress('CM-01', rests, 30, opts).habitat.rooms.find((r) => r.id === 'pet-home')!.unlocked).toBe(true);
  });

  it('companion items unlock via companion achievements and can only be equipped once unlocked', () => {
    const p = evaluateProgress('CM-01', lots(12), 12, { ...opts, companionEquipped: { toy: 'star-ball', accessory: 'orbit-scarf', environment: 'env-europa' } });
    expect(p.companion.achievements.find((a) => a.id === 'pet:friend')!.unlocked).toBe(true);
    expect(p.companion.equipped.toy).toBe('star-ball');
    expect(p.companion.equipped.accessory).toBe('orbit-scarf');
    expect(p.companion.equipped.environment).toBeNull(); // Europa not reached yet
  });

  it('crew puzzle and team expedition expose crew totals only', () => {
    const crew = ['CM-01', 'CM-02', 'CM-03'].flatMap((s) => [ev(1, 'crew-puzzle.contributed', { subjectId: s }), ev(2, 'recreation.session', { subjectId: s })]);
    const p = evaluateProgress('CM-01', [], 3, { ...opts, crewEvents: crew });
    expect(p.crewPuzzle.pieces).toBe(3);
    expect(Object.keys(p.crewPuzzle).sort()).toEqual(['pieces', 'title', 'total', 'weekStartDay']);
    expect(p.teamExpedition.crewPoints).toBe(6);
    expect(JSON.stringify(p.teamExpedition)).not.toMatch(/CM-0/);
  });

  it('the full progress state validates against the contract', () => {
    expect(() => ProgressState.parse(evaluateProgress('CM-01', lots(30), 30, opts))).not.toThrow();
  });
});
