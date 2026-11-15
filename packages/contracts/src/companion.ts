import { z } from 'zod';

/**
 * Desktop companion contracts.
 * A companion is a self-contained character package: assets/pets/<id>/manifest.json + artwork.
 * The companion window only ever receives coarse engagement events — never health or assessment details.
 */

/** Behaviour states. Each maps to an animation definition in the character manifest. */
export const CompanionState = z.enum(['idle', 'bounce', 'react', 'celebrate', 'sleep', 'wake', 'curious']);
export type CompanionState = z.infer<typeof CompanionState>;

/** Built-in CSS motion presets that animate a single still illustration without redrawing it. */
export const MotionPreset = z.enum(['float-breathe', 'bounce', 'react', 'celebrate', 'sleep', 'wake', 'curious']);
export type MotionPreset = z.infer<typeof MotionPreset>;

export const AnimationDef = z.discriminatedUnion('kind', [
  /** One illustration animated with a CSS motion preset (current Mochi artwork). */
  z.object({ kind: z.literal('still'), image: z.string(), motion: MotionPreset, durationMs: z.number().positive().optional(), overlay: z.enum(['zzz', 'sparkles']).optional() }),
  /** Future: frame-by-frame artwork (array of images played at fps). */
  z.object({ kind: z.literal('frames'), frames: z.array(z.string()).min(1), fps: z.number().positive(), loop: z.boolean(), overlay: z.enum(['zzz', 'sparkles']).optional() }),
]);
export type AnimationDef = z.infer<typeof AnimationDef>;

export const CompanionAction = z.enum(['chat', 'hello', 'status', 'celebrate', 'sleep', 'wake', 'open-dashboard', 'hide']);
export type CompanionAction = z.infer<typeof CompanionAction>;

const Messages = z.array(z.string().min(1).max(120)).min(1);

/** Species motion family: each species moves differently (container motion + its own part animations). */
export const MotionProfile = z.enum(['mochi', 'dog', 'cat', 'alien']);
export type MotionProfile = z.infer<typeof MotionProfile>;

const Norm = z.number().min(0).max(1);
/**
 * How a character is animated without redrawing it.
 *  - raster-layered: one illustration split into layers (body + optional tail) with blink lids over the drawn pupils.
 *  - svg-states: one SVG per state; each SVG animates its own parts (tail, ears, eyelids…).
 * Coordinates are normalised to the artwork (0–1).
 */
export const CompanionRig = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('raster-layered'),
    body: z.string(),
    tail: z
      .object({
        image: z.string(),
        pivot: z.object({ x: Norm, y: Norm }),
        /** Seam-anchored swish: horizontal scale range and small rotation (degrees). */
        swish: z.object({ scaleMin: z.number().min(0.8).max(1), scaleMax: z.number().min(1).max(1.2), deg: z.number().min(0).max(8) }),
      })
      .optional(),
    eyes: z.array(z.object({ cx: Norm, cy: Norm, r: Norm, lid: z.string().regex(/^#[0-9a-f]{6}$/i) })),
  }),
  z.object({ kind: z.literal('svg-states') }),
]);
export type CompanionRig = z.infer<typeof CompanionRig>;

export const CompanionManifest = z.object({
  schemaVersion: z.literal(2),
  id: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string(),
  species: z.string(),
  official: z.boolean(),
  /** True when the artwork is a stand-in, not team-supplied. Shown in the UI. */
  placeholder: z.boolean(),
  motionProfile: MotionProfile,
  rig: CompanionRig,
  /** Artwork files relative to the character folder. `reference` is the untouched original. */
  artwork: z.object({
    default: z.string(),
    reference: z.string(),
    /** Intrinsic pixel size of `default`, used for contain-fit layout (never stretched). */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string(),
  }),
  /** On-screen display box in CSS px. The artwork is contain-fitted and bottom-anchored inside it. */
  display: z.object({ width: z.number().positive(), height: z.number().positive() }),
  animations: z.record(CompanionState, AnimationDef),
  interactions: z.object({
    menu: z.array(CompanionAction).min(1),
    /** Minutes without interaction before the companion naps on its own (0 = never). */
    autoSleepAfterMin: z.number().min(0),
    /** Seconds between occasional idle bounces (average). */
    idleBounceEverySec: z.number().positive(),
  }),
  personality: z.object({
    traits: z.array(z.string()).min(1),
    /** Voice flavour for the conversation engine. */
    voice: z.object({
      /** Little interjections ("Ooh", "Woof", "Mrrp", "Bleep"). */
      interjections: z.array(z.string().max(16)).min(1),
      /** First-person happy action, used after "I" ("do a tail wiggle", "wag my tail"). */
      happyAction: z.string().max(40),
      /** Short sign-off ("Mochi out!"). */
      signoff: z.string().max(40),
    }),
    messages: z.object({
      hello: Messages,
      celebrate: Messages,
      dailyMission: Messages,
      cognitive: Messages,
      recovery: Messages,
      rest: Messages,
      milestone: Messages,
      sleep: Messages,
      wake: Messages,
      breakSuggestion: Messages,
    }),
  }),
  credits: z.string(),
});
export type CompanionManifest = z.infer<typeof CompanionManifest>;

/**
 * Engagement events the companion reacts to. Only positive or neutral events exist —
 * there is deliberately no "missed objective" event, so the companion can never be sad or punitive.
 */
export const CompanionEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('objective.completed'), title: z.string().max(80) }),
  z.object({ type: z.literal('cognitive.achievement'), title: z.string().max(80) }),
  z.object({ type: z.literal('recovery.completed'), title: z.string().max(80) }),
  z.object({ type: z.literal('rest.logged') }),
  z.object({ type: z.literal('milestone.reached'), day: z.number().int().min(0).max(179) }),
  z.object({ type: z.literal('break.suggested') }),
  // Phase 4: an approved, optional activity is on today's list (title only); playing with a toy in the pet home.
  z.object({ type: z.literal('mission.suggested'), title: z.string().max(80) }),
  z.object({ type: z.literal('toy.played'), title: z.string().max(80) }),
  /** While any alert/escalation is active the companion stays quiet and only offers to open ORBITAL. */
  z.object({ type: z.literal('alert.active'), active: z.boolean() }),
]);
export type CompanionEvent = z.infer<typeof CompanionEvent>;

export const CompanionCatalogEntry = z.object({
  id: z.string(),
  displayName: z.string(),
  species: z.string(),
  official: z.boolean(),
  placeholder: z.boolean(),
  /** Artwork used for previews (relative to the character folder). */
  preview: z.string(),
  traits: z.array(z.string()),
});
export type CompanionCatalogEntry = z.infer<typeof CompanionCatalogEntry>;

export const MISSION_MILESTONES = [1, 30, 60, 90, 100, 120, 150, 179] as const;
