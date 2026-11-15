import { describe, expect, it } from 'vitest';
import type { EngagementEvent } from '@orbital/contracts';
import { ProgressState } from '@orbital/contracts';
import { generateMission } from '@orbital/simulation';
import { evaluateProgress, simulationEvents, dailyMissions, type MissionContext } from '../src';

const ctx: MissionContext = { restDay: false, sleepBelowUsual: false, activityBelowUsual: false, measurementDay: false };
const opts = { prescribedExerciseMin: 90, contextForDay: () => ctx };
const ev = (day: number, kind: EngagementEvent['kind'], amount = 1, extra: Partial<EngagementEvent> = {}): EngagementEvent => ({
  id: `t:${kind}:${day}:${amount}:${extra.ref ?? ''}`, subjectId: 'CM-01', missionDay: day, kind, amount, source: 'user', ...extra,
});

describe('gamification invariants', () => {
  it('XP never depends on reported values (changing mood/stress values changes nothing)', () => {
    const recs = generateMission('CM-04').records;
    const altered = recs.map((r) => (r.signalId === 'mood.vas' || r.signalId === 'stress.vas' ? { ...r, value: 10 - r.value } : r));
    const a = evaluateProgress('CM-04', simulationEvents('CM-04', recs), 120, opts);
    const b = evaluateProgress('CM-04', simulationEvents('CM-04', altered), 120, opts);
    expect(b.xp).toBe(a.xp);
  });

  it('overexertion earns nothing beyond the prescription', () => {
    const planned = evaluateProgress('CM-01', [ev(5, 'exercise.session', 90)], 5, opts);
    const double = evaluateProgress('CM-01', [ev(5, 'exercise.session', 180)], 5, opts);
    expect(double.xpByKind['exercise.session']).toBe(planned.xpByKind['exercise.session']);
  });

  it('rest, recovery and asking for help are rewarded', () => {
    const p = evaluateProgress('CM-01', [ev(6, 'rest.day'), ev(6, 'recovery.session'), ev(6, 'help.requested')], 6, opts);
    expect(p.xpByKind['rest.day']).toBeGreaterThan(0);
    expect(p.xpByKind['recovery.session']).toBeGreaterThan(0);
    expect(p.xpByKind['help.requested']).toBeGreaterThan(0);
    expect(p.achievements.find((a) => a.id === 'reaching-out')?.unlocked).toBe(true);
  });

  it('nothing is ever lost: XP is monotonic over the mission even with missed days', () => {
    const events = simulationEvents('CM-05', generateMission('CM-05').records); // many missed days
    let prev = -1;
    for (let d = 0; d < 180; d += 7) {
      const p = evaluateProgress('CM-05', events, d, opts);
      expect(p.xp).toBeGreaterThanOrEqual(prev);
      prev = p.xp;
    }
  });

  it('daily caps prevent grinding', () => {
    const many = Array.from({ length: 10 }, (_, k) => ev(3, 'cognitive-game.played', 1, { ref: `g${k}` }));
    const p = evaluateProgress('CM-01', many, 3, opts);
    expect(p.xpByKind['cognitive-game.played']).toBe(45); // 3 × 15
  });

  it('adaptive missions: context changes what is offered, not the reward', () => {
    const tired = dailyMissions(10, { ...ctx, sleepBelowUsual: true }, []);
    const rest = dailyMissions(13, { ...ctx, restDay: true }, []);
    expect(tired.some((m) => m.id.endsWith(':cosy') && m.reason)).toBe(true);
    expect(rest.some((m) => m.category === 'rest')).toBe(true);
    expect(tired.every((m) => m.bonusXp === 10)).toBe(true);
  });

  it('exploration needs a balanced mix — exercise alone cannot reach the Moon', () => {
    const onlyExercise = Array.from({ length: 50 }, (_, d) => ev(d, 'exercise.session', 60));
    const p = evaluateProgress('CM-01', onlyExercise, 60, opts);
    expect(p.exploration[0]!.reached).toBe(false);
  });

  it('cooperative missions expose crew totals only (no per-person fields)', () => {
    const crew = ['CM-01', 'CM-02'].flatMap((s) => [ev(1, 'cognitive-game.played', 1, { subjectId: s, id: `${s}:g` })]);
    const p = evaluateProgress('CM-01', [], 2, { ...opts, crewEvents: crew });
    expect(p.coop[0]!.crewTotal).toBe(2);
    expect(Object.keys(p.coop[0]!)).toEqual(['id', 'title', 'target', 'crewTotal', 'weekStartDay']);
  });

  it('synthetic history yields a valid, deterministic progress state for every crew member', () => {
    for (const id of ['CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05'] as const) {
      const events = simulationEvents(id, generateMission(id).records);
      const p = evaluateProgress(id, events, 90, opts);
      expect(ProgressState.safeParse(p).success).toBe(true);
      expect(evaluateProgress(id, events, 90, opts)).toEqual(p);
      expect(p.level).toBeGreaterThan(1);
    }
  });
});
