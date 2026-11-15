import { z } from 'zod';
import { ScenarioId } from './provenance';

/**
 * Fictional crew. These are SYNTHETIC profiles for demonstration only —
 * they are not real astronauts and their data are not NASA measurements.
 */
export const AstronautId = z.enum(['CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05']);
export type AstronautId = z.infer<typeof AstronautId>;

export const AstronautProfile = z.object({
  id: AstronautId,
  name: z.string(),
  initials: z.string().max(3),
  role: z.string(),
  scenario: ScenarioId,
  scenarioLabel: z.string(),
  /** Short neutral description of the simulated pattern. Never diagnostic. */
  scenarioSummary: z.string(),
  /** Categorical slot (validated for colour-vision deficiency; see docs/decisions.md D-010). */
  accent: z.enum(['blue', 'orange', 'aqua', 'yellow', 'magenta']),
  seed: z.number().int(),
});
export type AstronautProfile = z.infer<typeof AstronautProfile>;
