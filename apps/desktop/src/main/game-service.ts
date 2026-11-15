import type { AstronautId, CompanionEvent, EngagementEvent, EngagementKind, GameHistoryEntry, GameId, GameResult, HealthRecord, LogActivity, ProgressState, Recommendation, RecommendationSet } from '@orbital/contracts';
import { CREW, CREW_IDS, MISSION_START_UTC } from '@orbital/simulation';
import { evaluateProgress, simulationEvents, GOAL_OPTIONS, type MissionContext } from '@orbital/gamification';
import type { DataService } from './data-service';
import type { Storage } from './storage';

/**
 * Gamification integration (main process). Pure rules live in @orbital/gamification; this service
 * supplies events (synthetic history + things done in the app), mission context and persistence,
 * and emits companion events — the companion only listens; nothing depends on it.
 */
export class GameService {
  private readonly simEvents = new Map<AstronautId, EngagementEvent[]>();
  private readonly ctxCache = new Map<string, MissionContext>();

  /** Phase 4: approved recommendations (live for the requested day; persisted offers for past days). */
  private recSource: { recommendations(id: AstronautId, day: number): RecommendationSet; offeredAll(id: AstronautId): Record<string, Recommendation[]> } | null = null;

  constructor(
    private readonly storage: Storage,
    private readonly data: DataService,
    private readonly emit: (e: CompanionEvent) => void,
  ) {}

  setRecommendationSource(src: GameService['recSource']): void {
    this.recSource = src;
  }

  /** Completion facts for one crew member (synthetic history + in-app actions). */
  allEvents(id: AstronautId): EngagementEvent[] {
    return this.events(id);
  }

  private events(id: AstronautId): EngagementEvent[] {
    let sim = this.simEvents.get(id);
    if (!sim) {
      sim = simulationEvents(id, this.data.records(id));
      this.simEvents.set(id, sim);
    }
    return [...sim, ...this.storage.engagementEvents(id)];
  }

  private context(id: AstronautId, day: number): MissionContext {
    const key = `${id}:${day}`;
    const hit = this.ctxCache.get(key);
    if (hit) return hit;
    const below = (signal: string) => {
      const m = this.data.metric(id, signal, day);
      return !!(m?.baseline?.kind === 'baseline' && m.mean7 !== null && (m.mean7 - m.baseline.mean) / m.baseline.sd <= -1);
    };
    const seed = CREW[id].profile.seed;
    const ctx: MissionContext = {
      restDay: day % 7 === 6,
      sleepBelowUsual: below('sleep.duration'),
      activityBelowUsual: below('activity.active-minutes'),
      measurementDay: (day + (seed % 7)) % 7 === 0,
    };
    this.ctxCache.set(key, ctx);
    return ctx;
  }

  progress(id: AstronautId, day: number): ProgressState {
    const b = CREW[id].baselines;
    // Today's offer is computed live (and persisted); earlier days use what was actually offered then.
    const before = this.recSource?.offeredAll(id) ?? {};
    const today = this.recSource?.recommendations(id, day).recommendations ?? [];
    if (today.length && !before[day]?.length) this.emit({ type: 'mission.suggested', title: today[0]!.title.slice(0, 80) });
    const offers: Record<string, Recommendation[]> = { ...before, [day]: today };
    return evaluateProgress(id, this.events(id), day, {
      prescribedExerciseMin: b.resistMin + b.aerobicMin,
      contextForDay: (d) => ({ ...this.context(id, d), recommendations: offers[d] ?? [] }),
      placements: this.storage.getJSON<Record<string, (string | null)[]>>(`habitat.${id}`) ?? {},
      goalIds: this.storage.getJSON<string[]>(`goals.${id}`) ?? [],
      crewEvents: CREW_IDS.flatMap((c) => this.events(c)),
      companionEquipped: this.storage.getJSON<{ accessory?: string | null; toy?: string | null; environment?: string | null }>(`companion.${id}`) ?? {},
    });
  }

  /** Record a completion fact from elsewhere in the app (journal saved, companion chat…). Idempotent per day for daily facts. */
  record(id: AstronautId, day: number, kind: EngagementKind, ref?: string): void {
    const perDay: EngagementKind[] = ['companion.chat', 'journal.written'];
    this.storage.insertEngagement({
      id: perDay.includes(kind) ? `user:${id}:${kind}:${day}` : `user:${id}:${kind}:${day}:${Date.now()}`,
      subjectId: id,
      missionDay: day,
      kind,
      amount: 1,
      source: 'user',
      ...(ref ? { ref } : {}),
    });
  }

  /** Equip an unlocked companion item (shown in the pet home; never drawn onto the companion artwork). */
  equip(id: AstronautId, day: number, slot: 'accessory' | 'toy' | 'environment', itemId: string | null): ProgressState {
    if (itemId) {
      const item = this.progress(id, day).companion.items.find((i) => i.id === itemId);
      if (!item?.unlocked || item.kind !== slot) throw new Error('Item not unlocked for this slot');
    }
    const cur = this.storage.getJSON<Record<string, string | null>>(`companion.${id}`) ?? {};
    this.storage.setJSON(`companion.${id}`, { ...cur, [slot]: itemId });
    return this.progress(id, day);
  }

  /** Play with an unlocked toy: a participation fact (capped XP) and a happy companion animation. */
  playToy(id: AstronautId, day: number, toyId: string): ProgressState {
    const toy = this.progress(id, day).companion.items.find((i) => i.id === toyId && i.kind === 'toy');
    if (!toy?.unlocked) throw new Error('Toy not unlocked');
    this.record(id, day, 'companion.played', toyId);
    this.emit({ type: 'toy.played', title: toy.name });
    return this.progress(id, day);
  }

  /** Personal score history for one game (all difficulties). Scores are never used for health decisions. */
  history(id: AstronautId, game: GameId): GameHistoryEntry[] {
    return this.storage
      .engagementEvents(id)
      .filter((e) => e.kind === 'cognitive-game.played' && e.ref?.startsWith(`${game}:`))
      .map((e) => {
        const [, score, difficulty] = e.ref!.split(':');
        return { game, difficulty: (difficulty ?? 'standard') as GameHistoryEntry['difficulty'], day: e.missionDay, score: Number(score), personalBest: !!e.personalBest };
      });
  }

  /** Log something done in the app. Returns the new progress and emits positive companion events. */
  log(req: LogActivity): ProgressState {
    const id = req.astronautId as AstronautId;
    const before = this.progress(id, req.day);
    this.storage.insertEngagement({
      id: `user:${id}:${req.kind}:${req.day}:${Date.now()}`,
      subjectId: id,
      missionDay: req.day,
      kind: req.kind,
      amount: req.amount,
      source: 'user',
    });
    const after = this.progress(id, req.day);
    if (req.kind === 'rest.day') this.emit({ type: 'rest.logged' });
    else if (req.kind === 'recovery.session' || req.kind === 'mindfulness.session') this.emit({ type: 'recovery.completed', title: req.kind === 'recovery.session' ? 'Recovery session' : 'Mindful minutes' });
    this.announceNewlyCompleted(before, after);
    return after;
  }

  /** Record a cognitive game: an engagement event (XP) and a user-entered measurement (C1 signal). */
  play(r: GameResult): { progress: ProgressState; personalBest: boolean } {
    const id = r.astronautId as AstronautId;
    const difficulty = r.difficulty ?? 'standard';
    const scores = this.history(id, r.game).filter((h) => h.difficulty === difficulty).map((h) => h.score);
    const better = r.game === 'signal-catch' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b;
    const personalBest = scores.length > 0 && scores.every((s) => better(r.score, s));
    const before = this.progress(id, r.day);
    const stamp = Date.now();
    this.storage.insertEngagement({
      id: `user:${id}:game:${r.game}:${r.day}:${stamp}`,
      subjectId: id,
      missionDay: r.day,
      kind: 'cognitive-game.played',
      amount: 1,
      source: 'user',
      ref: `${r.game}:${r.score}:${difficulty}`,
      personalBest,
    });
    const signalId = r.game === 'signal-catch' ? 'cog.game.reaction' : 'cog.game.memory-span';
    const record: HealthRecord = {
      id: `${id}:${signalId}:${r.day}:${stamp}`,
      subjectId: id,
      signalId,
      timestamp: new Date(MISSION_START_UTC + r.day * 86_400_000 + 12 * 3_600_000).toISOString(),
      missionDay: r.day,
      value: r.score,
      unit: signalId === 'cog.game.reaction' ? 'ms' : '{count}',
      aggregation: 'spot',
      // Played by the person using ORBITAL — user-entered, never presented as the synthetic crew member's telemetry.
      source: { kind: 'user', adapterId: `game.${r.game}`, device: 'ORBITAL game' },
      classification: 'measured',
      quality: { score: 0.9, flags: [] },
    };
    this.data.addRecords([record]);
    const progress = this.progress(id, r.day);
    this.emit({ type: 'cognitive.achievement', title: personalBest ? 'New personal best' : 'Brain game complete' });
    this.announceNewlyCompleted(before, progress);
    return { progress, personalBest };
  }

  placeDecoration(id: AstronautId, day: number, roomId: string, slot: number, decorationId: string | null): ProgressState {
    const p = this.progress(id, day);
    const room = p.habitat.rooms.find((r) => r.id === roomId);
    if (!room?.unlocked) throw new Error('Room not unlocked');
    if (decorationId && !p.habitat.decorations.find((d) => d.id === decorationId)?.unlocked) throw new Error('Decoration not unlocked');
    const placements = this.storage.getJSON<Record<string, (string | null)[]>>(`habitat.${id}`) ?? {};
    const slots = [...(placements[roomId] ?? [null, null, null])];
    slots[slot] = decorationId;
    placements[roomId] = slots;
    this.storage.setJSON(`habitat.${id}`, placements);
    return this.progress(id, day);
  }

  setGoals(id: AstronautId, day: number, goalIds: string[]): ProgressState {
    this.storage.setJSON(`goals.${id}`, goalIds.filter((g) => GOAL_OPTIONS.some((o) => o.id === g)).slice(0, 3));
    return this.progress(id, day);
  }

  private announceNewlyCompleted(before: ProgressState, after: ProgressState): void {
    const done = (p: ProgressState) => new Set([...p.dailyMissions, ...p.weeklyMissions].filter((m) => m.completed).map((m) => m.id));
    const was = done(before);
    for (const m of [...after.dailyMissions, ...after.weeklyMissions]) if (m.completed && !was.has(m.id)) this.emit({ type: 'objective.completed', title: m.title });
  }
}
