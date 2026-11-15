import type { EngagementEvent, EngagementKind, HealthRecord, Mission, ProgressState, Recommendation, RecommendationKind } from '@orbital/contracts';
import { ACHIEVEMENTS, COMPANION_ACHIEVEMENTS, COMPANION_ITEMS, COOP, DECORATIONS, DESTINATIONS, GOAL_OPTIONS, PERSONAL_BEST_BONUS, POINT_KINDS, PUZZLE_KINDS, PUZZLE_PIECES, PUZZLES, RANKS, ROOMS, XP, xpToReach, type AchievementDef } from './catalogue';

/**
 * Pure, deterministic progress evaluation (docs/gamification-design.md).
 * XP comes only from completion facts; nothing here ever subtracts XP.
 */

/** Context used ONLY to choose which missions to offer — never to compute rewards. */
export interface MissionContext {
  restDay: boolean;
  sleepBelowUsual: boolean;
  activityBelowUsual: boolean;
  measurementDay: boolean;
  /**
   * Phase 4: approved recommendations offered on this day (from the recommendation engine, persisted
   * when offered). They change WHICH optional mission fills the rotating slot — never the reward.
   */
  recommendations?: readonly Recommendation[];
}

/** Which completion facts complete an adaptive mission of each recommendation kind. */
export const ADAPTIVE_COUNTS: Record<RecommendationKind, EngagementKind[]> = {
  'human-support': ['help.requested'],
  'sleep-recovery-expedition': ['recovery.session', 'mindfulness.session'],
  'wind-down': ['mindfulness.session', 'recovery.session'],
  'sleep-routine': ['recovery.session', 'rest.day'],
  'movement-short': ['movement.break', 'exercise.session'],
  'movement-exploration': ['movement.break'],
  'exercise-optional': ['exercise.session'],
  'cognitive-rest': ['rest.day', 'recovery.session', 'mindfulness.session'],
  'cognitive-light': ['cognitive-game.played'],
  journal: ['journal.written'],
  recreation: ['recreation.session', 'crew-activity.joined'],
  'companion-chat': ['companion.chat'],
  'measurement-reminder': ['measurement.completed', 'checkin.completed'],
};

export interface ProgressOptions {
  /** Prescribed exercise minutes per day — the XP cap. */
  prescribedExerciseMin: number;
  contextForDay: (day: number) => MissionContext;
  placements?: Record<string, (string | null)[]>;
  goalIds?: string[];
  /** All crew members' events (for cooperative missions). */
  crewEvents?: readonly EngagementEvent[];
  companionEquipped?: { accessory?: string | null; toy?: string | null; environment?: string | null };
}

/** Completion facts derived from the synthetic history. Only behaviours with a record count — nothing is invented. */
export function simulationEvents(subjectId: string, records: readonly HealthRecord[]): EngagementEvent[] {
  const byDay = new Map<number, HealthRecord[]>();
  for (const r of records) {
    const arr = byDay.get(r.missionDay) ?? [];
    arr.push(r);
    byDay.set(r.missionDay, arr);
  }
  const out: EngagementEvent[] = [];
  const ev = (day: number, kind: EngagementKind, amount: number, ref?: string): EngagementEvent => ({
    id: `sim:${subjectId}:${kind}:${day}${ref ? `:${ref}` : ''}`,
    subjectId,
    missionDay: day,
    kind,
    amount,
    source: 'simulation',
    ref,
  });
  for (let day = 0; day < 180; day++) {
    const recs = byDay.get(day) ?? [];
    const has = (id: string) => recs.some((r) => r.signalId === id);
    if (has('mood.vas')) out.push(ev(day, 'checkin.completed', 1));
    if (has('cog.rt.median')) out.push(ev(day, 'cognitive-game.played', 1, 'vigilance-task'));
    if (has('bp.systolic')) out.push(ev(day, 'measurement.completed', 1, 'weekly'));
    if (has('body.lean-mass')) out.push(ev(day, 'measurement.completed', 1, 'bioimpedance'));
    const minutes = recs.filter((r) => r.signalId === 'exercise.resistance' || r.signalId === 'exercise.aerobic').reduce((a, r) => a + r.value, 0);
    if (minutes > 0) out.push(ev(day, 'exercise.session', minutes));
    if (day % 7 === 6) out.push(ev(day, 'rest.day', 1, 'scheduled'));
  }
  return out;
}

const count = (events: readonly EngagementEvent[], kinds: readonly EngagementKind[]) => events.filter((e) => kinds.includes(e.kind)).length;

/** Daily missions, adapted to context. The context changes WHAT is offered, never the reward. */
export function dailyMissions(day: number, ctx: MissionContext, dayEvents: readonly EngagementEvent[]): Mission[] {
  const m = (id: string, title: string, description: string, category: Mission['category'], counts: EngagementKind[], target = 1, reason?: string): Mission => {
    const progress = Math.min(target, count(dayEvents, counts));
    return { id: `d${day}:${id}`, cadence: 'daily', title, description, category, counts, target, progress, completed: progress >= target, bonusXp: 10, reason };
  };
  const out: Mission[] = [m('checkin', 'Morning check-in', 'Two minutes to say how you are.', 'check-in', ['checkin.completed'])];
  if (ctx.restDay) out.push(m('rest', 'Enjoy your rest day', 'Planned rest is part of the training programme.', 'rest', ['rest.day'], 1, 'Scheduled rest day'));
  else if (ctx.sleepBelowUsual)
    out.push(m('cosy', 'A cosy evening', 'A recovery or mindfulness session — wind down your way.', 'recovery', ['recovery.session', 'mindfulness.session'], 1, 'Recent sleep has been shorter than your usual'));
  else out.push(m('exercise', 'Prescribed exercise', 'Your planned session. The plan is the goal — extra minutes earn nothing extra.', 'exercise', ['exercise.session']));
  const rotation = ctx.measurementDay
    ? m('measure', 'Scheduled measurements', 'Blood pressure, mass and the weekly fitness test.', 'measurement', ['measurement.completed'], 1, 'Weekly measurement day')
    : [
        m('game', 'A quick brain game', 'Signal Catch or Constellation Memory.', 'cognitive', ['cognitive-game.played']),
        m('mindful', 'Five mindful minutes', 'Breathing, stretching or looking out of the window.', 'mindfulness', ['mindfulness.session']),
        m('crew', 'Share some time', 'Join or suggest a crew activity — only if you feel like it.', 'crew', ['crew-activity.joined']),
      ][day % 3]!;
  // Adaptive slot: the top approved recommendation REPLACES the rotating mission (same bonus), so a
  // detected change never increases the XP on offer — deterioration is never rewarded.
  const rec = ctx.recommendations?.[0];
  if (rec) {
    const counts = ADAPTIVE_COUNTS[rec.kind];
    const progress = Math.min(1, count(dayEvents, counts));
    out.push({ id: `d${day}:adaptive:${rec.kind}`, cadence: 'daily', title: rec.title, description: rec.description, category: rec.category, counts, target: 1, progress, completed: progress >= 1, bonusXp: 10, reason: `Optional — offered because: ${reasonText(rec)}`, adaptive: true, recommendationId: rec.id });
  } else out.push(rotation);
  return out;
}

function reasonText(rec: Recommendation): string {
  switch (rec.basis.source) {
    case 'safety':
      return 'you asked to talk to someone';
    case 'decision':
      return 'the wellbeing monitor noticed a sustained change from your usual pattern';
    case 'trend':
      return 'your physical measurements have been trending away from your usual';
    case 'data-quality':
      return 'some measurements are due';
    default:
      return `recent ${rec.basis.domains.join(' and ')} data differ from your usual`;
  }
}

export function weeklyMissions(day: number, weekEvents: readonly EngagementEvent[]): Mission[] {
  const week = Math.floor(day / 7);
  const m = (id: string, title: string, description: string, category: Mission['category'], counts: EngagementKind[], target: number): Mission => {
    const progress = Math.min(target, count(weekEvents, counts));
    return { id: `w${week}:${id}`, cadence: 'weekly', title, description, category, counts, target, progress, completed: progress >= target, bonusXp: 40 };
  };
  return [
    m('checkins', 'Check in on 4 days', 'Consistency beats intensity.', 'check-in', ['checkin.completed'], 4),
    week % 2 === 0
      ? m('cognitive', 'Two cognitive challenges', 'Any brain game or task counts.', 'cognitive', ['cognitive-game.played'], 2)
      : m('recharge', 'Two recharge moments', 'Rest days, recovery or mindfulness all count.', 'recovery', ['rest.day', 'recovery.session', 'mindfulness.session'], 2),
  ];
}

export function evaluateProgress(subjectId: string, allEvents: readonly EngagementEvent[], asOfDay: number, opts: ProgressOptions): ProgressState {
  const events = allEvents.filter((e) => e.missionDay <= asOfDay).sort((a, b) => a.missionDay - b.missionDay || a.id.localeCompare(b.id));
  const xpByKind: Record<string, number> = {};
  let xp = 0;
  let todayXp = 0;
  const add = (kind: string, amount: number, day: number) => {
    if (amount <= 0) return;
    xpByKind[kind] = (xpByKind[kind] ?? 0) + amount;
    xp += amount;
    if (day === asOfDay) todayXp += amount;
  };

  // Per-day XP with caps.
  const awardedWeekly = new Set<string>();
  for (let day = 0; day <= asOfDay; day++) {
    const dayEv = events.filter((e) => e.missionDay === day);
    for (const kind of Object.keys(XP) as EngagementKind[]) {
      const evs = dayEv.filter((e) => e.kind === kind);
      if (!evs.length) continue;
      if (kind === 'exercise.session') {
        const minutes = evs.reduce((a, e) => a + e.amount, 0);
        add(kind, Math.min(minutes, opts.prescribedExerciseMin) * XP[kind].xp, day); // overexertion earns nothing
      } else {
        const capped = evs.slice(0, XP[kind].dailyCap);
        add(kind, capped.length * XP[kind].xp, day);
        if (kind === 'cognitive-game.played') add('personal-best', capped.filter((e) => e.personalBest).length * PERSONAL_BEST_BONUS, day);
      }
    }
    // Mission bonuses: daily missions on their day; weekly missions on the day they are first completed.
    for (const mis of dailyMissions(day, opts.contextForDay(day), dayEv)) if (mis.completed) add('missions', mis.bonusXp, day);
    const weekStart = day - (day % 7);
    for (const mis of weeklyMissions(day, events.filter((e) => e.missionDay >= weekStart && e.missionDay <= day))) {
      if (mis.completed && !awardedWeekly.has(mis.id)) {
        awardedWeekly.add(mis.id);
        add('missions', mis.bonusXp, day);
      }
    }
  }

  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  const rankTitle = [...RANKS].reverse().find((r) => level >= r.minLevel)!.title;

  const firstDayReaching = (kinds: readonly EngagementKind[], n: number): number | null => {
    let c = 0;
    for (const e of events) if (kinds.includes(e.kind) && ++c >= n) return e.missionDay;
    return null;
  };
  const achievements = ACHIEVEMENTS.map((a) => {
    let unlockedDay: number | null = null;
    if (a.day !== undefined) unlockedDay = asOfDay >= a.day ? a.day : null;
    else if (a.personalBest) unlockedDay = events.find((e) => e.personalBest)?.missionDay ?? null;
    else if (a.kinds && a.count) unlockedDay = firstDayReaching(a.kinds, a.count);
    return { id: a.id, title: a.title, description: a.description, category: a.category, unlocked: unlockedDay !== null, unlockedDay };
  });
  const unlocked = new Set(achievements.filter((a) => a.unlocked).map((a) => a.id));

  const restDays = count(events, ['rest.day']);
  const rooms = ROOMS.map((r) => {
    const have = count(events, r.kinds);
    const alt = r.id === 'greenhouse' ? restDays / 8 : r.id === 'pet-home' ? restDays / 4 : r.id === 'gym' ? count(events, ['movement.break']) / 6 : 0;
    const progress = Math.min(1, Math.max(have / r.count, alt));
    const slots = (opts.placements?.[r.id] ?? []).slice(0, r.slots);
    while (slots.length < r.slots) slots.push(null);
    return { id: r.id, name: r.name, unlocked: progress >= 1, requirement: r.requirement, progress, slots };
  });

  // Exploration: cumulative points per category, with the first day each destination was reached.
  type Pts = { cognitive: number; recovery: number; exercise: number; connection: number };
  const cats = Object.keys(POINT_KINDS) as (keyof Pts)[];
  const pts: Pts = { cognitive: 0, recovery: 0, exercise: 0, connection: 0 };
  const reachedDay = new Map<string, number>();
  for (const e of events) {
    const c = cats.find((k) => POINT_KINDS[k].includes(e.kind));
    if (!c) continue;
    pts[c]++;
    for (const d of DESTINATIONS) if (!reachedDay.has(d.id) && cats.every((k) => pts[k] >= d.needs[k])) reachedDay.set(d.id, e.missionDay);
  }
  let currentSet = false;
  const exploration = DESTINATIONS.map((d) => {
    const reached = reachedDay.has(d.id);
    const current = !reached && !currentSet;
    if (current) currentSet = true;
    return { ...d, have: { ...pts }, reached, current, reachedDay: reachedDay.get(d.id) ?? null };
  });
  const explorationHistory = DESTINATIONS.filter((d) => reachedDay.has(d.id)).map((d) => ({ destinationId: d.id, name: d.name, day: reachedDay.get(d.id)! }));
  const environments = DESTINATIONS.map((d) => ({ id: d.environment.id, name: d.environment.name, unlocked: reachedDay.has(d.id), unlockedBy: `Reach ${d.name}` }));
  const unlockedKeys = new Set([...unlocked, ...[...reachedDay.keys()].map((k) => `reach:${k}`)]);
  const decorations = DECORATIONS.map((d) => ({ ...d, unlocked: unlockedKeys.has(d.unlockedBy) }));

  // Companion progression (works identically whether or not the companion window is visible).
  const evalAch = (a: AchievementDef) => {
    const unlockedDay = a.kinds && a.count ? firstDayReaching(a.kinds, a.count) : null;
    return { id: a.id, title: a.title, description: a.description, category: a.category, unlocked: unlockedDay !== null, unlockedDay };
  };
  const companionAchievements = COMPANION_ACHIEVEMENTS.map(evalAch);
  for (const a of companionAchievements) if (a.unlocked) unlockedKeys.add(a.id);
  const items = COMPANION_ITEMS.map((i) => ({ ...i, unlocked: unlockedKeys.has(i.unlockedBy) }));
  const equippedOk = (id: string | null | undefined, kind: string) => (id && items.some((i) => i.id === id && i.kind === kind && i.unlocked) ? id : null);
  const companion = {
    items,
    achievements: companionAchievements,
    equipped: {
      accessory: equippedOk(opts.companionEquipped?.accessory, 'accessory'),
      toy: equippedOk(opts.companionEquipped?.toy, 'toy'),
      environment: equippedOk(opts.companionEquipped?.environment, 'environment'),
    },
  };

  const weekStart = asOfDay - (asOfDay % 7);
  const crewAll = (opts.crewEvents ?? []).filter((e) => e.missionDay <= asOfDay);
  const crewWeek = crewAll.filter((e) => e.missionDay >= weekStart);
  const coop = COOP.map((c) => ({ id: c.id, title: c.title, target: c.target, crewTotal: count(crewWeek, c.kinds), weekStartDay: weekStart }));
  const crewPuzzle = { title: PUZZLES[Math.floor(asOfDay / 7) % PUZZLES.length]!, pieces: Math.min(PUZZLE_PIECES, Math.floor(count(crewWeek, PUZZLE_KINDS) / 2)), total: PUZZLE_PIECES, weekStartDay: weekStart };
  // Team expedition: one shared ship; thresholds are the personal route × crew size. Crew totals only.
  const crewPoints = crewAll.filter((e) => cats.some((k) => POINT_KINDS[k].includes(e.kind))).length;
  const crewSize = Math.max(1, new Set(crewAll.map((e) => e.subjectId)).size);
  const shipNeed = (d: (typeof DESTINATIONS)[number]) => cats.reduce((a, k) => a + d.needs[k], 0) * crewSize;
  const shipReached = DESTINATIONS.filter((d) => crewPoints >= shipNeed(d)).map((d) => d.name);
  const next = DESTINATIONS.find((d) => crewPoints < shipNeed(d));
  const prevNeed = shipReached.length ? shipNeed(DESTINATIONS[shipReached.length - 1]!) : 0;
  const teamExpedition = next
    ? { crewPoints, destination: next.name, progress: Math.max(0, Math.min(1, (crewPoints - prevNeed) / (shipNeed(next) - prevNeed))), reached: shipReached }
    : { crewPoints, destination: 'Route complete', progress: 1, reached: shipReached };

  const goals = (opts.goalIds ?? [])
    .map((id) => GOAL_OPTIONS.find((g) => g.id === id))
    .filter((g): g is (typeof GOAL_OPTIONS)[number] => !!g)
    .map((g) => {
      const progress = Math.min(g.target, count(events, g.kinds));
      return { id: g.id, title: g.title, target: g.target, progress, completed: progress >= g.target };
    });

  const todayEvents = events.filter((e) => e.missionDay === asOfDay);
  return {
    subjectId,
    day: asOfDay,
    xp,
    level,
    rankTitle,
    xpIntoLevel: xp - xpToReach(level),
    xpForNextLevel: xpToReach(level + 1) - xpToReach(level),
    xpByKind,
    todayXp,
    dailyMissions: dailyMissions(asOfDay, opts.contextForDay(asOfDay), todayEvents),
    weeklyMissions: weeklyMissions(asOfDay, events.filter((e) => e.missionDay >= weekStart)),
    achievements,
    habitat: { rooms, decorations },
    exploration,
    coop,
    goals,
    explorationHistory,
    environments,
    companion,
    crewPuzzle,
    teamExpedition,
  };
}
