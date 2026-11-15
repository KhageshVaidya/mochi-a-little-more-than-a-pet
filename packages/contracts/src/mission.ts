import { z } from 'zod';
import { ScenarioId } from './provenance';
import { AstronautId } from './crew';

/** Mission clock & simulation playback state. Owned by main, mirrored to renderers. */

export const MISSION_LENGTH_DAYS = 180;

export const PLAYBACK_SPEEDS = [1, 5, 15, 30, 60] as const;
export const PlaybackSpeed = z.union([z.literal(1), z.literal(5), z.literal(15), z.literal(30), z.literal(60)]);
export type PlaybackSpeed = z.infer<typeof PlaybackSpeed>;

export const MissionState = z.object({
  /** Current mission day, 0 … MISSION_LENGTH_DAYS - 1. */
  day: z.number().int().min(0).max(MISSION_LENGTH_DAYS - 1),
  playing: z.boolean(),
  /** Mission days advanced per real-time minute of playback. */
  speed: PlaybackSpeed,
  /** Selected crew member. Every view follows this. */
  astronautId: AstronautId,
  /** Scenario of the selected crew member (derived; each fictional profile has exactly one). */
  scenario: ScenarioId,
  seed: z.number().int(),
  /** Always true in the current build — ORBITAL never displays real astronaut telemetry. */
  synthetic: z.literal(true),
});
export type MissionState = z.infer<typeof MissionState>;

export const MissionCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('seek'), day: z.number().int().min(0).max(MISSION_LENGTH_DAYS - 1) }),
  z.object({ type: z.literal('speed'), speed: PlaybackSpeed }),
  z.object({ type: z.literal('select'), astronautId: AstronautId }),
]);
export type MissionCommand = z.infer<typeof MissionCommand>;
