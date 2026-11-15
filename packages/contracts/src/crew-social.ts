import { z } from 'zod';
import { AstronautId } from './crew';

/**
 * Voluntary crew wellbeing & shared activities (docs/privacy-and-crew-wellbeing.md §3).
 * No hidden analysis: only what people choose to share, shown only to the audience they choose.
 * Companion-to-companion messages carry activity logistics only — never journal, mood or health data.
 */
export const CrewStatusOption = z.enum(['company', 'activity', 'space', 'support']);
export type CrewStatusOption = z.infer<typeof CrewStatusOption>;

export const CrewStatus = z.object({
  subjectId: AstronautId,
  day: z.number().int(),
  status: CrewStatusOption,
  /** Who may see it. 'support' statuses can be limited to crew-support or one chosen crewmate. */
  audience: z.enum(['crew', 'crew-support', 'person']),
  audiencePersonId: AstronautId.optional(),
  /** Synthetic crewmates' statuses are simulated for the demo and labelled as such. */
  source: z.enum(['user', 'simulation']),
});
export type CrewStatus = z.infer<typeof CrewStatus>;

export const ActivityKind = z.enum(['puzzle', 'cognitive-game', 'exercise', 'rec-evening', 'meal', 'conversation']);
export type ActivityKind = z.infer<typeof ActivityKind>;

export const CrewActivity = z.object({
  id: z.string(),
  day: z.number().int(),
  kind: ActivityKind,
  title: z.string(),
  proposedBy: AstronautId,
  invitees: z.array(AstronautId),
  /** Declining is neutral and needs no reason. */
  responses: z.record(z.string(), z.enum(['pending', 'accepted', 'declined'])),
  companionMessages: z.array(z.object({ from: z.string(), text: z.string() })),
});
export type CrewActivity = z.infer<typeof CrewActivity>;

export const CrewBoard = z.object({
  day: z.number().int(),
  me: AstronautId,
  myStatus: CrewStatus.nullable(),
  /** Statuses visible to me today (respecting each person's chosen audience). */
  visibleStatuses: z.array(CrewStatus),
  activities: z.array(CrewActivity),
  /** Companion suggestion of who might enjoy an activity — only people who said they're open to it. */
  suggestion: z.object({ text: z.string(), invitee: AstronautId, kind: ActivityKind }).nullable(),
  /** Team-level only; never per person. */
  participation: z.object({
    weeks: z.array(z.object({ weekStart: z.number().int(), activities: z.number().int(), checkins: z.number().int() })),
    suggestion: z.string().nullable(),
  }),
});
export type CrewBoard = z.infer<typeof CrewBoard>;
