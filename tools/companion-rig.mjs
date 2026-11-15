#!/usr/bin/env node
/**
 * Derive an animation rig from ONE transparent illustration, without redrawing it:
 *  - eyes: small dark blobs (pupils) → positions + lid colour sampled from the surrounding fur (for blinking)
 *  - tail: fur regions flood-filled from seed points up to the black outline → a separate tail layer that
 *    rotates about its base; the body layer drops only the far part of the tail (over open background),
 *    keeping the seam so a small rotation never reveals a gap or a doubled outline.
 *
 * Usage: node tools/companion-rig.mjs <cutout.png> <outDir> --tail-seeds x,y[;x,y...] [--eye-region x0,y0,x1,y1]
 * Writes <outDir>/body.png, <outDir>/tail.png and prints rig JSON (pivot, eyes) for the manifest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const [input, outDir, ...rest] = process.argv.slice(2);
const arg = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
const img = PNG.sync.read(readFileSync(input));
const { width: W, height: H, data } = img;
const N = W * H;
const L = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
const A = (i) => data[i * 4 + 3];
const dark = (i) => A(i) > 128 && L(i) < 95;

// ── Eyes: dark components of pupil size inside the eye region ──────────────
const er = (arg('eye-region') ?? `0,0,${W},${Math.round(H * 0.55)}`).split(',').map(Number);
const seen = new Uint8Array(N);
const blobs = [];
for (let s = 0; s < N; s++) {
  const x0 = s % W, y0 = (s / W) | 0;
  if (seen[s] || !dark(s) || x0 < er[0] || y0 < er[1] || x0 > er[2] || y0 > er[3]) continue;
  const comp = []; const st = [s]; seen[s] = 1;
  while (st.length) {
    const i = st.pop(); comp.push(i);
    const x = i % W, y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !seen[j] && dark(j)) { seen[j] = 1; st.push(j); }
  }
  const xs = comp.map((i) => i % W), ys = comp.map((i) => (i / W) | 0);
  const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
  blobs.push({ area: comp.length, cx: xs.reduce((a, b) => a + b, 0) / comp.length, cy: ys.reduce((a, b) => a + b, 0) / comp.length, bw, bh, fill: comp.length / (bw * bh) });
}
// Pupils: compact (high fill ratio), roughly round, small. Lines (brows, mouth) have low fill ratios.
const pupils = blobs.filter((b) => b.area >= 25 && b.area <= 220 && b.fill > 0.5 && b.bw / b.bh < 1.8 && b.bh / b.bw < 1.8);

const sampleFur = (cx, cy, r) => {
  const acc = [0, 0, 0]; let n = 0;
  for (let y = Math.round(cy - r * 2.2); y <= cy + r * 2.2; y++) for (let x = Math.round(cx - r * 2.6); x <= cx + r * 2.6; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    const mx = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]), mn = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (A(i) === 255 && L(i) > 110 && mx - mn > 25) { for (let c = 0; c < 3; c++) acc[c] += data[i * 4 + c]; n++; }
  }
  return '#' + acc.map((v) => Math.round(v / Math.max(1, n)).toString(16).padStart(2, '0')).join('');
};
const eyes = pupils.map((p) => {
  const r = Math.max(p.bw, p.bh) / 2;
  return { cx: +(p.cx / W).toFixed(4), cy: +(p.cy / H).toFixed(4), rx: +((r * 1.9) / W).toFixed(4), ry: +((r * 1.7) / H).toFixed(4), lid: sampleFur(p.cx, p.cy, r) };
});

// ── Tail: flood fill fur from seeds, bounded by dark outline ───────────────
const seeds = (arg('tail-seeds') ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
const tail = new Uint8Array(N);
for (const [sx, sy] of seeds) {
  const s0 = sy * W + sx;
  if (dark(s0) || A(s0) < 128) throw new Error(`tail seed ${sx},${sy} is not on fur`);
  const st = [s0]; tail[s0] = 1;
  while (st.length) {
    const i = st.pop(); const x = i % W, y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !tail[j] && A(j) > 128 && !dark(j)) { tail[j] = 1; st.push(j); }
  }
}
let tailArea = 0;
for (let i = 0; i < N; i++) tailArea += tail[i];
if (tailArea > N * 0.25) throw new Error(`tail flood leaked into the body (${tailArea} px) — check seeds / outline gaps`);
// Include the tail's own outline + antialias (dilate 4 px over opaque pixels).
const dil = Uint8Array.from(tail);
for (let pass = 0; pass < 4; pass++) {
  const add = [];
  for (let i = 0; i < N; i++) {
    if (dil[i] || A(i) === 0) continue;
    const x = i % W, y = (i / W) | 0;
    if ((x > 0 && dil[i - 1]) || (x < W - 1 && dil[i + 1]) || (y > 0 && dil[i - W]) || (y < H - 1 && dil[i + W])) add.push(i);
  }
  for (const i of add) dil[i] = 1;
}
// Distance from non-tail opaque pixels ("body"), to decide which tail pixels the body layer may drop.
const INF = 1e9;
const dist = new Float32Array(N).fill(INF);
const q = [];
for (let i = 0; i < N; i++) if (A(i) > 0 && !dil[i]) { dist[i] = 0; q.push(i); }
for (let h = 0; h < q.length; h++) {
  const i = q[h]; const x = i % W, y = (i / W) | 0;
  for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); }
}
const KEEP_SEAM = 10;
const body = new PNG({ width: W, height: H });
const tailPng = new PNG({ width: W, height: H });
let tx0 = W, ty0 = H, tx1 = 0, ty1 = 0;
for (let i = 0; i < N; i++) {
  for (let c = 0; c < 4; c++) { body.data[i * 4 + c] = data[i * 4 + c]; tailPng.data[i * 4 + c] = 0; }
  if (dil[i]) {
    for (let c = 0; c < 4; c++) tailPng.data[i * 4 + c] = data[i * 4 + c];
    if (dist[i] > KEEP_SEAM) body.data[i * 4 + 3] = 0;
    const x = i % W, y = (i / W) | 0;
    if (tail[i]) { tx0 = Math.min(tx0, x); ty0 = Math.min(ty0, y); tx1 = Math.max(tx1, x); ty1 = Math.max(ty1, y); }
  }
}
// Pivot: the tail pixel closest to the body's centre of mass along the seam (where the tail joins the body).
let bx = 0, by = 0, bn = 0;
for (let i = 0; i < N; i++) if (A(i) > 0 && !dil[i]) { bx += i % W; by += (i / W) | 0; bn++; }
bx /= bn; by /= bn;
let best = null;
for (let i = 0; i < N; i++) if (tail[i] && dist[i] <= 6) {
  const x = i % W, y = (i / W) | 0, d = (x - bx) ** 2 + (y - by) ** 2;
  if (!best || d < best.d) best = { x, y, d };
}
writeFileSync(join(outDir, 'body.png'), PNG.sync.write(body));
writeFileSync(join(outDir, 'tail.png'), PNG.sync.write(tailPng));
console.log(JSON.stringify({
  size: [W, H],
  eyes,
  candidateBlobs: blobs.filter((b) => b.area >= 15).map((b) => ({ area: b.area, cx: Math.round(b.cx), cy: Math.round(b.cy), fill: +b.fill.toFixed(2) })),
  tail: { area: tailArea, bbox: [tx0, ty0, tx1, ty1], pivot: best ? { x: +(best.x / W).toFixed(4), y: +(best.y / H).toFixed(4) } : null },
}, null, 1));
