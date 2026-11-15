/**
 * Deterministic randomness. Every stream is derived from (profile seed, purpose label), so adding a
 * new signal or purpose never changes the numbers produced for existing ones.
 */

/** FNV-1a 32-bit hash of the parts, used to derive independent seeds. */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f; // separator
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;
  private spare: number | undefined;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** mulberry32 — uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Standard normal via Box–Muller (cached pair). */
  normal(): number {
    if (this.spare !== undefined) {
      const s = this.spare;
      this.spare = undefined;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}

export function stream(seed: number, ...purpose: (string | number)[]): Rng {
  return new Rng(hashSeed(seed, ...purpose));
}
