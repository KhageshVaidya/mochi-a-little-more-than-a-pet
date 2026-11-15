import { EventEmitter } from 'node:events';
import { DEFAULT_PREFS, Prefs, type PrefsPatch } from '@orbital/contracts';
import type { Storage } from './storage';

const KEY = 'prefs';

/** Typed, validated preferences backed by SQLite. Emits 'changed' with the full Prefs. */
export class PrefsService extends EventEmitter<{ changed: [Prefs] }> {
  private current: Prefs;

  constructor(private readonly storage: Storage) {
    super();
    const stored = storage.getJSON<unknown>(KEY);
    // Merge stored values over defaults so new preference fields get sensible values after upgrades.
    const merged = stored && typeof stored === 'object' ? deepMerge(DEFAULT_PREFS, stored as Partial<Prefs>) : DEFAULT_PREFS;
    const parsed = Prefs.safeParse(merged);
    this.current = parsed.success ? parsed.data : DEFAULT_PREFS;
  }

  get(): Prefs {
    return this.current;
  }

  set(patch: PrefsPatch): Prefs {
    const next = Prefs.parse(deepMerge(this.current, patch as Partial<Prefs>));
    this.current = next;
    this.storage.setJSON(KEY, next);
    this.emit('changed', next);
    return next;
  }
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && k !== 'positions'
        ? deepMerge(b, v as Partial<typeof b>)
        : v;
  }
  return out as T;
}
