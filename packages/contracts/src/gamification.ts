import { z } from 'zod';
import { AstronautId } from './crew';

/**
 * Gamification contracts (docs/gamification-design.md).
 *
 * Invariants (tested in @orbital/gamification):
 *  - XP depends on completion/consistency, never on the *values* an astronaut reports or a body produces.
 *  - Exercise XP is capped at the prescribed volume — no reward for overexertion.
 *  - Rest and recovery are achievements. No XP is ever removed; there are no streak losses or decay.
 *  - Crew mechanics are cooperative only; no rankings, no per-person health scores.
 */

export const EngagementKind = z.enum([
  'checkin.completed',
  'measurement.completed',
  'exercise.session',
  'rest.day',
  'recovery.session',
  'mindfulness.session',
  'cognitive-game.played',
  'crew-activity.joined',
  'mission.completed',
  'help.requested',
  // Phase 4
  'movement.break',
  'journal.written',
  'companion.chat',
  'recreation.session',
  'crew-puzzle.contributed',
  'companion.played',
]);
export type EngagementKind = z.infer<typeof EngagementKind>;

export const EngagementEvent = z.object({
  id: z.string(),
  subjectId: z.string(),
  missionDay: z.number().int().min(0).max(179),
  kind: EngagementKind,
  /** Amount completed (minutes, sessions…). Exercise XP uses min(amount, prescribed). */
  amount: z.number().nonnegative(),
  /** 'simulation' = derived from the synthetic history; 'user' = done in the app. */
  source: z.enum(['simulation', 'user']),
  /** Optional detail: mission id, game id, activity id, personal-best flag. */
  ref: z.string().optional(),
  personalBest: z.boolean().optional(),
});
export type EngagementEvent = z.infer<typeof EngagementEvent>;

export const MissionCategory = z.enum(['check-in', 'measurement', 'exercise', 'rest', 'recovery', 'mindfulness', 'cognitive', 'crew', 'social']);
export type MissionCategory = z.infer<typeof MissionCategory>;

export const Mission = z.object({
  id: z.string(),
  cadence: z.enum(['daily', 'weekly']),
  title: z.string(),
  description: z.string(),
  category: MissionCategory,
  /** Completion counts, never body values. */
  target: z.number().positive(),
  progress: z.number().nonnegative(),
  completed: z.boolean(),
  bonusXp: z.number().int().nonnegative(),
  /** Why this mission was offered today (adaptive missions explain themselves). */
  reason: z.string().optional(),
  /** Event kinds that advance this mission. */
  counts: z.array(EngagementKind),
  /** Phase 4: offered by the recommendation engine (always optional; same bonus as any mission). */
  adaptive: z.boolean().optional(),
  recommendationId: z.string().optional(),
});
export type Mission = z.infer<typeof Mission>;

export const Achievement = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  unlocked: z.boolean(),
  unlockedDay: z.number().int().nullable(),
  category: MissionCategory,
});
export type Achievement = z.infer<typeof Achievement>;

export const HabitatRoom = z.object({
  id: z.string(),
  name: z.string(),
  unlocked: z.boolean(),
  /** Plain-language unlock condition, e.g. "5 rest days". */
  requirement: z.string(),
  progress: z.number().min(0).max(1),
  /** Decoration ids placed in this room's slots (null = empty slot). */
  slots: z.array(z.string().nullable()),
});
export type HabitatRoom = z.infer<typeof HabitatRoom>;

export const Decoration = z.object({ id: z.string(), name: z.string(), unlocked: z.boolean(), unlockedBy: z.string() });
export type Decoration = z.infer<typeof Decoration>;

const Points = z.object({ cognitive: z.number(), recovery: z.number(), exercise: z.number(), connection: z.number() });
export const Destination = z.object({
  id: z.string(),
  name: z.string(),
  fact: z.string(),
  kind: z.enum(['moon', 'planet', 'dwarf-planet']),
  /** Parent body for moons (map rendering). */
  parent: z.string().nullable(),
  /** Mean distance from the Sun in AU (map layout). */
  au: z.number(),
  /** Points needed per category so exploration needs a balanced mix (exercise alone cannot finish it). */
  needs: Points,
  have: Points,
  reached: z.boolean(),
  current: z.boolean(),
  /** Mission day the destination was first reached (personal exploration history). */
  reachedDay: z.number().int().nullable(),
  /** Environment unlocked on arrival (a theme for the habitat window and pet home). */
  environment: z.object({ id: z.string(), name: z.string() }),
});
export type Destination = z.infer<typeof Destination>;

export const CompanionItem = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['toy', 'accessory', 'decoration', 'environment']),
  description: z.string(),
  unlocked: z.boolean(),
  unlockedBy: z.string(),
});
export type CompanionItem = z.infer<typeof CompanionItem>;

export const CompanionProgress = z.object({
  items: z.array(CompanionItem),
  achievements: z.array(Achievement),
  equipped: z.object({ accessory: z.string().nullable(), toy: z.string().nullable(), environment: z.string().nullable() }),
});
export type CompanionProgress = z.infer<typeof CompanionProgress>;

export const CoopMission = z.object({
  id: z.string(),
  title: z.string(),
  target: z.number().int().positive(),
  /** Crew total only — never a per-person breakdown. */
  crewTotal: z.number().int().nonnegative(),
  weekStartDay: z.number().int(),
});
export type CoopMission = z.infer<typeof CoopMission>;

export const ProgressState = z.object({
  subjectId: z.string(),
  day: z.number().int(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  rankTitle: z.string(),
  xpIntoLevel: z.number().int().nonnegative(),
  xpForNextLevel: z.number().int().positive(),
  /** XP per category (for transparency: where did my XP come from?). */
  xpByKind: z.record(z.string(), z.number().int()),
  todayXp: z.number().int().nonnegative(),
  dailyMissions: z.array(Mission),
  weeklyMissions: z.array(Mission),
  achievements: z.array(Achievement),
  habitat: z.object({ rooms: z.array(HabitatRoom), decorations: z.array(Decoration) }),
  exploration: z.array(Destination),
  coop: z.array(CoopMission),
  goals: z.array(z.object({ id: z.string(), title: z.string(), target: z.number().int(), progress: z.number().int(), completed: z.boolean() })),
  // Phase 4
  explorationHistory: z.array(z.object({ destinationId: z.string(), name: z.string(), day: z.number().int() })),
  environments: z.array(z.object({ id: z.string(), name: z.string(), unlocked: z.boolean(), unlockedBy: z.string() })),
  companion: CompanionProgress,
  /** Weekly shared crew puzzle: pieces placed by the whole crew (never per person). */
  crewPuzzle: z.object({ title: z.string(), pieces: z.number().int(), total: z.number().int(), weekStartDay: z.number().int() }),
  /** Team expedition: the crew's combined exploration points move one shared ship. */
  teamExpedition: z.object({ crewPoints: z.number().int(), destination: z.string(), progress: z.number().min(0).max(1), reached: z.array(z.string()) }),
});
export type ProgressState = z.infer<typeof ProgressState>;

export const GameId = z.enum(['signal-catch', 'constellation-memory']);
export type GameId = z.infer<typeof GameId>;
export const GameDifficulty = z.enum(['easy', 'standard', 'hard']);
export type GameDifficulty = z.infer<typeof GameDifficulty>;

export const GameResult = z.object({
  astronautId: AstronautId,
  day: z.number().int().min(0).max(179),
  game: GameId,
  /** signal-catch: median reaction ms; constellation-memory: longest sequence recalled. */
  score: z.number().nonnegative(),
  trials: z.number().int().positive(),
  difficulty: GameDifficulty.default('standard'),
});
export type GameResult = z.infer<typeof GameResult>;

export const LogActivity = z.object({
  astronautId: AstronautId,
  day: z.number().int().min(0).max(179),
  kind: z.enum(['checkin.completed', 'measurement.completed', 'exercise.session', 'rest.day', 'recovery.session', 'mindfulness.session', 'help.requested', 'movement.break', 'recreation.session', 'crew-puzzle.contributed']),
  amount: z.number().positive().max(300).default(1),
});
export type LogActivity = z.infer<typeof LogActivity>;

export const GameHistoryEntry = z.object({ game: GameId, difficulty: GameDifficulty, day: z.number().int(), score: z.number(), personalBest: z.boolean() });
export type GameHistoryEntry = z.infer<typeof GameHistoryEntry>;
