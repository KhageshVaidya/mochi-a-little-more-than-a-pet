import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { AstronautId, AstronautProfile } from '@orbital/contracts';

/**
 * Demo identities (Mochi M1).
 *
 * Public builds use the original fictional crew and original companions. A developer may keep PRIVATE demo
 * identities in `config/demo-identities.local.json` (git-ignored, never packaged, never loaded in smoke tests).
 * Profiles stay keyed by their internal ids (CM-01…CM-05), so scenarios, data and tests are unaffected.
 */

export const DEFAULT_COMPANION_BY_PROFILE: Record<AstronautId, string> = {
  'CM-01': 'mochi',
  'CM-02': 'dog',
  'CM-03': 'cat',
  'CM-04': 'alien',
  'CM-05': 'mochi',
};

const Identity = z.object({ name: z.string().min(1).max(40), initials: z.string().min(1).max(3).optional(), role: z.string().max(40).optional(), companion: z.string().regex(/^[a-z0-9-]+$/).optional() });
const IdentityFile = z.object({ profiles: z.record(z.string(), Identity) });
export type Identities = z.infer<typeof IdentityFile>['profiles'];

export function loadLocalIdentities(appPath: string, enabled: boolean): Identities {
  if (!enabled) return {};
  const file = resolve(appPath, '..', '..', 'config', 'demo-identities.local.json');
  if (!existsSync(file)) return {};
  try {
    return IdentityFile.parse(JSON.parse(readFileSync(file, 'utf8'))).profiles;
  } catch (e) {
    console.warn('[mochi] ignoring invalid demo-identities.local.json:', (e as Error).message);
    return {};
  }
}

export function applyIdentity(p: AstronautProfile, ids: Identities): AstronautProfile {
  const o = ids[p.id];
  if (!o) return p;
  const initials = o.initials ?? o.name.split(/\s+/).map((w) => w[0]!.toUpperCase()).join('').slice(0, 2);
  return { ...p, name: o.name, initials, ...(o.role ? { role: o.role } : {}) };
}

export const identitiesPath = (appPath: string) => join(appPath, '..', '..', 'config', 'demo-identities.local.json');
