/**
 * Isolation Forest (Liu, Ting & Zhou, 2008 — "Isolation Forest", ICDM).
 *
 * Pure, dependency-free and deterministic: the same (rows, options) always yields the same forest.
 * Anomaly score s(x) = 2^(−E[h(x)] / c(ψ)), where h is the path length to isolate x, ψ the sub-sample
 * size and c(n) the average path length of an unsuccessful BST search. s → 1 for isolated points,
 * s ≲ 0.5 for points that look like the training data.
 *
 * Input rows must be complete numeric vectors (callers impute/encode missing values first).
 */

export interface ForestOptions {
  trees: number;
  sampleSize: number;
  seed: number;
}

/** Flat tree storage: node i is a leaf when feature[i] === -1 (size[i] = points that reached it). */
export interface IsolationTree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  size: number[];
}

export interface IsolationForest {
  algorithm: 'isolation-forest/liu-2008';
  trees: IsolationTree[];
  sampleSize: number;
  nFeatures: number;
  options: ForestOptions;
}

/** mulberry32 — small, fast, well-distributed 32-bit PRNG (deterministic). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EULER = 0.5772156649015329;
/** Average path length of an unsuccessful search in a BST of n points. */
export function cFactor(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n;
}

export function trainForest(rows: readonly (readonly number[])[], options: ForestOptions): IsolationForest {
  if (!rows.length) throw new Error('Isolation Forest needs at least one training row');
  const nFeatures = rows[0]!.length;
  const rand = mulberry32(options.seed);
  const psi = Math.min(options.sampleSize, rows.length);
  const heightLimit = Math.ceil(Math.log2(Math.max(2, psi)));
  const trees: IsolationTree[] = [];
  for (let t = 0; t < options.trees; t++) {
    // Sample ψ rows without replacement (partial Fisher–Yates over indices).
    const idx = rows.map((_, i) => i);
    for (let i = 0; i < psi; i++) {
      const j = i + Math.floor(rand() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    const tree: IsolationTree = { feature: [], threshold: [], left: [], right: [], size: [] };
    const build = (members: number[], depth: number): number => {
      const node = tree.feature.length;
      tree.feature.push(-1);
      tree.threshold.push(0);
      tree.left.push(-1);
      tree.right.push(-1);
      tree.size.push(members.length);
      if (depth >= heightLimit || members.length <= 1) return node;
      // Choose a random feature that is not constant within this node.
      const candidates: number[] = [];
      for (let f = 0; f < nFeatures; f++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (const m of members) {
          const v = rows[m]![f]!;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi > lo) candidates.push(f);
      }
      if (!candidates.length) return node;
      const f = candidates[Math.floor(rand() * candidates.length)]!;
      let lo = Infinity;
      let hi = -Infinity;
      for (const m of members) {
        const v = rows[m]![f]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const thr = lo + rand() * (hi - lo);
      const l = members.filter((m) => rows[m]![f]! < thr);
      const r = members.filter((m) => rows[m]![f]! >= thr);
      tree.feature[node] = f;
      tree.threshold[node] = thr;
      tree.left[node] = build(l, depth + 1);
      tree.right[node] = build(r, depth + 1);
      return node;
    };
    build(idx.slice(0, psi), 0);
    trees.push(tree);
  }
  return { algorithm: 'isolation-forest/liu-2008', trees, sampleSize: psi, nFeatures, options };
}

function pathLength(tree: IsolationTree, x: readonly number[]): number {
  let node = 0;
  let depth = 0;
  while (tree.feature[node]! !== -1) {
    node = x[tree.feature[node]!]! < tree.threshold[node]! ? tree.left[node]! : tree.right[node]!;
    depth++;
  }
  return depth + cFactor(tree.size[node]!);
}

export function anomalyScore(forest: IsolationForest, x: readonly number[]): number {
  if (x.length !== forest.nFeatures) throw new Error(`Expected ${forest.nFeatures} features, got ${x.length}`);
  let total = 0;
  for (const t of forest.trees) total += pathLength(t, x);
  const mean = total / forest.trees.length;
  return 2 ** (-mean / cFactor(forest.sampleSize));
}
