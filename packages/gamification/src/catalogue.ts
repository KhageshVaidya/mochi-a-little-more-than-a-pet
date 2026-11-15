import type { EngagementKind, MissionCategory } from '@orbital/contracts';

/** Static game content. Facts are short, accurate, and need no network access. */

export const RANKS: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Cadet' },
  { minLevel: 3, title: 'Specialist' },
  { minLevel: 6, title: 'Navigator' },
  { minLevel: 10, title: 'Pilot' },
  { minLevel: 15, title: 'Mission Lead' },
  { minLevel: 21, title: 'Explorer' },
  { minLevel: 28, title: 'Pathfinder' },
];

/** Cumulative XP needed to *reach* level n (level 1 = 0). Gentle quadratic curve. */
export const xpToReach = (n: number) => 50 * (n - 1) * n;

/** XP per event and per-day caps. Exercise is per prescribed minute and capped at the prescription. */
export const XP: Record<EngagementKind, { xp: number; dailyCap: number }> = {
  'checkin.completed': { xp: 20, dailyCap: 1 },
  'measurement.completed': { xp: 15, dailyCap: 3 },
  'exercise.session': { xp: 1, dailyCap: Infinity }, // per minute, capped by prescription (see progress.ts)
  'rest.day': { xp: 30, dailyCap: 1 },
  'recovery.session': { xp: 25, dailyCap: 2 },
  'mindfulness.session': { xp: 25, dailyCap: 2 },
  'cognitive-game.played': { xp: 15, dailyCap: 3 },
  'crew-activity.joined': { xp: 25, dailyCap: 2 },
  'mission.completed': { xp: 0, dailyCap: 0 }, // bonuses come from the mission itself
  'help.requested': { xp: 20, dailyCap: 1 },
  // Phase 4 — participation only; amounts and body values never matter.
  'movement.break': { xp: 15, dailyCap: 2 },
  'journal.written': { xp: 20, dailyCap: 1 },
  'companion.chat': { xp: 10, dailyCap: 1 },
  'recreation.session': { xp: 20, dailyCap: 1 },
  'crew-puzzle.contributed': { xp: 10, dailyCap: 2 },
  'companion.played': { xp: 5, dailyCap: 3 },
};
export const PERSONAL_BEST_BONUS = 10;

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  /** Count of events of these kinds needed (or a mission-day milestone). */
  kinds?: EngagementKind[];
  count?: number;
  personalBest?: boolean;
  day?: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-checkin', title: 'First log entry', description: 'Completed your first daily check-in.', category: 'check-in', kinds: ['checkin.completed'], count: 1 },
  { id: 'steady-voice', title: 'Steady voice', description: '30 check-ins completed — your baseline thanks you.', category: 'check-in', kinds: ['checkin.completed'], count: 30 },
  { id: 'rest-skill', title: 'Rest is a skill', description: '5 rest days enjoyed. Recovery is part of the mission.', category: 'rest', kinds: ['rest.day'], count: 5 },
  { id: 'gentle-reset', title: 'Gentle reset', description: '3 recovery or mindfulness sessions.', category: 'recovery', kinds: ['recovery.session', 'mindfulness.session'], count: 3 },
  { id: 'prescription-pro', title: 'Prescription pro', description: '20 prescribed exercise sessions — no more, no less.', category: 'exercise', kinds: ['exercise.session'], count: 20 },
  { id: 'sharp-mind', title: 'Sharp mind', description: '10 cognitive challenges completed.', category: 'cognitive', kinds: ['cognitive-game.played'], count: 10 },
  { id: 'personal-best', title: 'Personal best', description: 'Beat your own best score in an ORBITAL game.', category: 'cognitive', personalBest: true },
  { id: 'better-together', title: 'Better together', description: 'Joined a crew activity.', category: 'crew', kinds: ['crew-activity.joined'], count: 1 },
  { id: 'reaching-out', title: 'Reaching out', description: 'Asked for support. That takes strength — and it is always welcome.', category: 'social', kinds: ['help.requested'], count: 1 },
  { id: 'careful-observer', title: 'Careful observer', description: '10 scheduled measurements completed.', category: 'measurement', kinds: ['measurement.completed'], count: 10 },
  { id: 'day-30', title: 'One month in orbit', description: 'Reached mission day 30.', category: 'social', day: 30 },
  { id: 'day-90', title: 'Halfway there', description: 'Reached mission day 90.', category: 'social', day: 90 },
  { id: 'day-150', title: 'Seasoned crew', description: 'Reached mission day 150.', category: 'social', day: 150 },
  // Phase 4
  { id: 'first-journal', title: 'Captain’s log', description: 'Wrote your first private journal entry.', category: 'mindfulness', kinds: ['journal.written'], count: 1 },
  { id: 'moving-gently', title: 'Moving gently', description: '5 short movement breaks.', category: 'exercise', kinds: ['movement.break'], count: 5 },
  { id: 'good-times', title: 'Good times', description: '3 recreational sessions — fun is part of the mission.', category: 'social', kinds: ['recreation.session', 'crew-activity.joined'], count: 3 },
  { id: 'puzzle-piece', title: 'Piece by piece', description: 'Added a piece to the crew puzzle.', category: 'crew', kinds: ['crew-puzzle.contributed'], count: 1 },
];

export interface RoomDef {
  id: string;
  name: string;
  requirement: string;
  kinds: EngagementKind[];
  count: number;
  slots: number;
}

/** Room ids are stable (persisted placements); names follow the Phase 4 habitat design. */
export const ROOMS: RoomDef[] = [
  { id: 'quarters', name: 'Sleeping quarters', requirement: '3 rest days', kinds: ['rest.day'], count: 3, slots: 3 },
  { id: 'galley', name: 'Galley', requirement: '10 check-ins', kinds: ['checkin.completed'], count: 10, slots: 3 },
  { id: 'gym', name: 'Gym', requirement: '10 exercise sessions or 6 movement breaks', kinds: ['exercise.session'], count: 10, slots: 3 },
  { id: 'greenhouse', name: 'Hydroponic garden', requirement: '3 recovery or mindfulness sessions, or 8 rest days', kinds: ['recovery.session', 'mindfulness.session'], count: 3, slots: 3 },
  { id: 'observatory', name: 'Research laboratory', requirement: '10 cognitive challenges', kinds: ['cognitive-game.played'], count: 10, slots: 3 },
  { id: 'lounge', name: 'Recreation room', requirement: '1 crew activity or recreational session', kinds: ['crew-activity.joined', 'recreation.session'], count: 1, slots: 3 },
  { id: 'pet-home', name: 'Pet living space', requirement: '3 companion chats or 4 rest days', kinds: ['companion.chat', 'companion.played'], count: 3, slots: 3 },
];

export const DECORATIONS: { id: string; name: string; unlockedBy: string }[] = [
  { id: 'cosy-blanket', name: 'Cosy blanket', unlockedBy: 'rest-skill' },
  { id: 'herb-planter', name: 'Herb planter', unlockedBy: 'gentle-reset' },
  { id: 'star-map', name: 'Star map', unlockedBy: 'sharp-mind' },
  { id: 'telescope', name: 'Telescope', unlockedBy: 'personal-best' },
  { id: 'photo-wall', name: 'Crew photo wall', unlockedBy: 'better-together' },
  { id: 'reading-lamp', name: 'Reading lamp', unlockedBy: 'steady-voice' },
  { id: 'kettlebell-rack', name: 'Kettlebell rack', unlockedBy: 'prescription-pro' },
  { id: 'earth-window', name: 'Earth-view window frame', unlockedBy: 'day-30' },
  { id: 'friendship-plant', name: 'Friendship plant', unlockedBy: 'reaching-out' },
  { id: 'logbook-shelf', name: 'Logbook shelf', unlockedBy: 'first-journal' },
  { id: 'stretch-mat', name: 'Stretch mat', unlockedBy: 'moving-gently' },
  { id: 'board-games', name: 'Board-game cupboard', unlockedBy: 'good-times' },
  { id: 'puzzle-frame', name: 'Framed crew puzzle', unlockedBy: 'puzzle-piece' },
  { id: 'moon-rock', name: 'Moon-rock replica', unlockedBy: 'reach:moon' },
  { id: 'mars-globe', name: 'Mars globe', unlockedBy: 'reach:mars' },
  { id: 'ice-lamp', name: 'Europa ice lamp', unlockedBy: 'reach:europa' },
];

type Needs = { cognitive: number; recovery: number; exercise: number; connection: number };
/**
 * Solar-system route (the first stop needs no connection points — the synthetic history contains none — later stops do). Cumulative points per category; a mix is always required, so exercise alone can
 * never finish it, and rest/recovery and connection (journal, crew time, companion chats, asking for
 * support) are as valuable as training. Facts are short, accurate and offline.
 */
export const DESTINATIONS: { id: string; name: string; fact: string; kind: 'moon' | 'planet' | 'dwarf-planet'; parent: string | null; au: number; needs: Needs; environment: { id: string; name: string } }[] = [
  { id: 'moon', name: 'The Moon', kind: 'moon', parent: 'earth', au: 1, fact: 'The Moon is on average about 384,400 km from Earth.', needs: { cognitive: 3, recovery: 2, exercise: 5, connection: 0 }, environment: { id: 'env-lunar', name: 'Lunar highlands view' } },
  { id: 'mars', name: 'Mars', kind: 'planet', parent: null, au: 1.52, fact: 'A day on Mars (a sol) lasts about 24 hours and 37 minutes.', needs: { cognitive: 10, recovery: 6, exercise: 15, connection: 1 }, environment: { id: 'env-mars', name: 'Martian sunset' } },
  { id: 'phobos', name: 'Phobos', kind: 'moon', parent: 'mars', au: 1.52, fact: 'Phobos orbits Mars about three times a day.', needs: { cognitive: 15, recovery: 9, exercise: 22, connection: 2 }, environment: { id: 'env-phobos', name: 'Phobos crater rim' } },
  { id: 'ceres', name: 'Ceres', kind: 'dwarf-planet', parent: null, au: 2.77, fact: 'Ceres is a dwarf planet and the largest object in the asteroid belt.', needs: { cognitive: 25, recovery: 14, exercise: 35, connection: 3 }, environment: { id: 'env-ceres', name: 'Bright spots of Ceres' } },
  { id: 'europa', name: 'Europa', kind: 'moon', parent: 'jupiter', au: 5.2, fact: 'Europa, a moon of Jupiter, has an ice shell over a subsurface ocean.', needs: { cognitive: 35, recovery: 20, exercise: 50, connection: 5 }, environment: { id: 'env-europa', name: 'Europan ice fields' } },
  { id: 'titan', name: 'Titan', kind: 'moon', parent: 'saturn', au: 9.5, fact: 'Titan, Saturn’s largest moon, has a thick atmosphere and lakes of liquid methane.', needs: { cognitive: 50, recovery: 28, exercise: 70, connection: 7 }, environment: { id: 'env-titan', name: 'Titan’s orange haze' } },
  { id: 'uranus', name: 'Uranus', kind: 'planet', parent: null, au: 19.2, fact: 'Uranus rotates on its side, with an axial tilt of about 98 degrees.', needs: { cognitive: 65, recovery: 36, exercise: 90, connection: 9 }, environment: { id: 'env-uranus', name: 'Sideways rings of Uranus' } },
  { id: 'triton', name: 'Triton', kind: 'moon', parent: 'neptune', au: 30.1, fact: 'Triton orbits Neptune backwards — opposite to the planet’s rotation.', needs: { cognitive: 80, recovery: 44, exercise: 110, connection: 11 }, environment: { id: 'env-triton', name: 'Triton’s nitrogen geysers' } },
  { id: 'pluto', name: 'Pluto', kind: 'dwarf-planet', parent: null, au: 39.5, fact: 'Pluto has a large heart-shaped plain of nitrogen ice, informally called Tombaugh Regio.', needs: { cognitive: 95, recovery: 52, exercise: 130, connection: 13 }, environment: { id: 'env-pluto', name: 'Pluto’s ice heart' } },
];

/** Exploration-point categories: which completion facts count towards which need. */
export const POINT_KINDS: Record<keyof Needs, EngagementKind[]> = {
  cognitive: ['cognitive-game.played'],
  recovery: ['rest.day', 'recovery.session', 'mindfulness.session'],
  exercise: ['exercise.session', 'movement.break'],
  connection: ['crew-activity.joined', 'recreation.session', 'journal.written', 'companion.chat', 'help.requested', 'crew-puzzle.contributed'],
};

/** Companion progression items. Shown in the pet home beside the companion — never drawn onto its artwork. */
export const COMPANION_ITEMS: { id: string; name: string; kind: 'toy' | 'accessory' | 'decoration' | 'environment'; description: string; unlockedBy: string }[] = [
  { id: 'star-ball', name: 'Star ball', kind: 'toy', description: 'A soft ball with a star pattern.', unlockedBy: 'pet:hello' },
  { id: 'comet-ribbon', name: 'Comet ribbon wand', kind: 'toy', description: 'A ribbon that swishes like a comet tail.', unlockedBy: 'pet:playtime' },
  { id: 'orbit-scarf', name: 'Orbit scarf', kind: 'accessory', description: 'A cosy scarf for long voyages.', unlockedBy: 'pet:friend' },
  { id: 'mini-helmet', name: 'Mini space helmet', kind: 'accessory', description: 'Ready for an EVA (in spirit).', unlockedBy: 'reach:mars' },
  { id: 'cushion', name: 'Moon cushion', kind: 'decoration', description: 'A round cushion for naps.', unlockedBy: 'rest-skill' },
  { id: 'plant-pot', name: 'Tiny hydroponic plant', kind: 'decoration', description: 'Grows a little each week.', unlockedBy: 'gentle-reset' },
  { id: 'env-lunar', name: 'Lunar highlands view', kind: 'environment', description: 'Unlocked by reaching the Moon.', unlockedBy: 'reach:moon' },
  { id: 'env-mars', name: 'Martian sunset', kind: 'environment', description: 'Unlocked by reaching Mars.', unlockedBy: 'reach:mars' },
  { id: 'env-europa', name: 'Europan ice fields', kind: 'environment', description: 'Unlocked by reaching Europa.', unlockedBy: 'reach:europa' },
];

/** Companion achievements (positive only; the companion never loses anything). */
export const COMPANION_ACHIEVEMENTS: AchievementDef[] = [
  { id: 'pet:hello', title: 'Hello, friend', description: 'Had a first chat with your companion.', category: 'social', kinds: ['companion.chat'], count: 1 },
  { id: 'pet:friend', title: 'Good companions', description: '10 chats with your companion.', category: 'social', kinds: ['companion.chat'], count: 10 },
  { id: 'pet:playtime', title: 'Playtime', description: 'Played with your companion 5 times.', category: 'social', kinds: ['companion.played'], count: 5 },
];

export const GOAL_OPTIONS: { id: string; title: string; kinds: EngagementKind[]; target: number }[] = [
  { id: 'goal-cognitive-10', title: 'Play 10 cognitive games', kinds: ['cognitive-game.played'], target: 10 },
  { id: 'goal-mindful-5', title: 'Try 5 mindfulness sessions', kinds: ['mindfulness.session'], target: 5 },
  { id: 'goal-checkin-14', title: 'Check in on 14 days', kinds: ['checkin.completed'], target: 14 },
  { id: 'goal-recovery-6', title: 'Make time for 6 recovery sessions', kinds: ['recovery.session'], target: 6 },
  { id: 'goal-crew-3', title: 'Join 3 crew activities', kinds: ['crew-activity.joined'], target: 3 },
];

export const COOP: { id: string; title: string; kinds: EngagementKind[]; target: number }[] = [
  { id: 'coop-cognitive', title: 'Crew brain-trust: cognitive challenges this week', kinds: ['cognitive-game.played'], target: 25 },
  { id: 'coop-recovery', title: 'Crew recharge: rest days and recovery sessions this week', kinds: ['rest.day', 'recovery.session', 'mindfulness.session'], target: 10 },
  { id: 'coop-together', title: 'Crew connection: shared activities this week', kinds: ['crew-activity.joined'], target: 4 },
  { id: 'coop-exercise', title: 'Crew training block: prescribed sessions this week (no extra credit for more)', kinds: ['exercise.session'], target: 25 },
  { id: 'coop-recreation', title: 'Crew fun: recreational sessions this week', kinds: ['recreation.session', 'crew-activity.joined'], target: 6 },
];

/** Weekly crew puzzle pictures (revealed piece by piece by the whole crew). */
export const PUZZLES = ['Saturn’s rings', 'The Pillars of Creation', 'Earthrise', 'Jupiter’s Great Red Spot', 'The Orion Nebula', 'Mars from orbit'];
export const PUZZLE_PIECES = 24;
/** Crew events that place a puzzle piece (every 2 events = 1 piece). */
export const PUZZLE_KINDS: EngagementKind[] = ['crew-puzzle.contributed', 'crew-activity.joined', 'recreation.session'];
