#!/usr/bin/env node
/**
 * ORBITAL artwork cutout — remove a plain light background from line-art illustrations
 * WITHOUT touching enclosed white details (eye highlights, white fur tips, etc.).
 *
 * Method
 *  1. Mark "background-like" pixels: light (min channel ≥ LIGHT) and low chroma (max−min ≤ CHROMA).
 *  2. Flood-fill (4-connected) from the image border through background-like pixels only.
 *     Whites enclosed by the drawing's outline are never reached, so they are preserved.
 *  3. Soft edge: within EDGE px of the background boundary, alpha comes from darkness
 *     (antialiased outline over white), and colour is un-mixed from white → no white halo.
 *  4. Crop to the visible artwork plus padding. Never scales, so proportions are untouched.
 *
 *  5. Optional --fill-enclosed-white <minArea>: enclosed near-white regions of at least minArea px (e.g. an
 *     unwanted white patch inside the character) are refilled by harmonic interpolation from the
 *     surrounding non-outline pixels, so they take on the neighbouring colour and shading. Small enclosed
 *     whites (eye/nose highlights) are below the threshold and untouched. Outline pixels are never changed.
 *
 * Usage: node tools/artwork-cutout.mjs <input.jpg|png> <output.png> [--light 200] [--chroma 28] [--pad 16] [--fill-enclosed-white 1500]
 * The input file is only read, never modified.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: artwork-cutout <input> <output.png> [--light N] [--chroma N] [--pad N]');
  process.exit(2);
}
const opt = (name, d) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? Number(rest[i + 1]) : d;
};
const LIGHT = opt('light', 200);
const CHROMA = opt('chroma', 28);
const PAD = opt('pad', 16);
const FILL_MIN = opt('fill-enclosed-white', 0);
const EDGE = 2;
const INK = 45; // approximate luminance of the outline ink

const buf = readFileSync(input);
const img = /\.png$/i.test(input) ? PNG.sync.read(buf) : jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
const { width: W, height: H } = img;
const px = img.data;
const N = W * H;

const bgLike = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  bgLike[i] = mn >= LIGHT && mx - mn <= CHROMA ? 1 : 0;
}

// Flood fill from the border.
const bg = new Uint8Array(N);
const queue = new Int32Array(N);
let qh = 0, qt = 0;
const seed = (i) => {
  if (bgLike[i] && !bg[i]) {
    bg[i] = 1;
    queue[qt++] = i;
  }
};
for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
while (qh < qt) {
  const i = queue[qh++];
  const x = i % W, y = (i / W) | 0;
  if (x > 0) seed(i - 1);
  if (x < W - 1) seed(i + 1);
  if (y > 0) seed(i - W);
  if (y < H - 1) seed(i + W);
}

// Optional: refill large enclosed white regions from their surroundings.
const filled = { regions: 0, pixels: 0 };
if (FILL_MIN > 0) {
  const lum = (i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const chroma = (i) => Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const seen = new Uint8Array(N);
  const region = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (seen[s] || bg[s] || !bgLike[s]) continue;
    const comp = [];
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop();
      comp.push(i);
      const x = i % W, y = (i / W) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !seen[j] && !bg[j] && bgLike[j]) { seen[j] = 1; st.push(j); }
      }
    }
    if (comp.length >= 20) {
      const xs = comp.map((i) => i % W), ys = comp.map((i) => (i / W) | 0);
      (filled.components ??= []).push({ area: comp.length, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], filled: comp.length >= FILL_MIN });
    }
    if (comp.length >= FILL_MIN) { for (const i of comp) region[i] = 1; filled.regions++; }
  }
  // Grow into the light, low-chroma antialias fringe (never into dark outline pixels or coloured fur).
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let i = 0; i < N; i++) {
      if (region[i] || bg[i]) continue;
      const x = i % W, y = (i / W) | 0;
      const nb = (x > 0 && region[i - 1]) || (x < W - 1 && region[i + 1]) || (y > 0 && region[i - W]) || (y < H - 1 && region[i + W]);
      if (nb && lum(i) >= 150 && chroma(i) <= 40) add.push(i);
    }
    for (const i of add) region[i] = 1;
  }
  // Harmonic (Laplace) fill. A fully outlined patch has no coloured neighbours of its own, so the solve
  // domain U also covers nearby outline/antialias pixels (low chroma, within 6 px); colour flows in from the
  // fur on the far side of each line. Only region pixels are written back — outline pixels never change.
  const U = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (region[i]) U[i] = 1;
  for (let pass = 0; pass < 6; pass++) {
    const add = [];
    for (let i = 0; i < N; i++) {
      if (U[i] || bg[i] || chroma(i) > 40) continue;
      const x = i % W, y = (i / W) | 0;
      if ((x > 0 && U[i - 1]) || (x < W - 1 && U[i + 1]) || (y > 0 && U[i - W]) || (y < H - 1 && U[i + W])) add.push(i);
    }
    for (const i of add) U[i] = 1;
  }
  const isSource = (j) => !U[j] && !bg[j] && chroma(j) > 25 && lum(j) > 100;
  const cur = new Float32Array(N * 3);
  const idx = [];
  for (let i = 0; i < N; i++) if (U[i]) idx.push(i);
  let mean = [0, 0, 0], mc = 0;
  for (const i of idx) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && isSource(j)) { for (let c = 0; c < 3; c++) mean[c] += px[j * 4 + c]; mc++; }
  mean = mean.map((v) => v / Math.max(1, mc));
  for (const i of idx) for (let c = 0; c < 3; c++) cur[i * 3 + c] = mean[c];
  for (let it = 0; it < 2500; it++) {
    for (const i of idx) {
      const acc = [0, 0, 0];
      let n = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N) continue;
        if (U[j]) { for (let c = 0; c < 3; c++) acc[c] += cur[j * 3 + c]; n++; }
        else if (isSource(j)) { for (let c = 0; c < 3; c++) acc[c] += px[j * 4 + c]; n++; }
      }
      if (n) for (let c = 0; c < 3; c++) cur[i * 3 + c] = acc[c] / n;
    }
  }
  idx.length = 0;
  for (let i = 0; i < N; i++) if (region[i]) { idx.push(i); filled.pixels++; }
  for (const i of idx) {
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.round(cur[i * 3 + c]);
    bgLike[i] = 0;
  }
}

// Distance (Chebyshev, capped) to the bg/non-bg boundary.
const nearEdge = new Uint8Array(N);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let edge = false;
    for (let dy = -EDGE; dy <= EDGE && !edge; dy++)
      for (let dx = -EDGE; dx <= EDGE; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (bg[yy * W + xx] !== bg[i]) { edge = true; break; }
      }
    nearEdge[i] = edge ? 1 : 0;
  }

const out = new PNG({ width: W, height: H });
let enclosedWhite = 0;
for (let i = 0; i < N; i++) {
  const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
  let a;
  if (nearEdge[i]) {
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    a = bg[i] ? Math.max(0, Math.min(1, (255 - L) / (255 - INK))) : Math.max(0.35, Math.min(1, (255 - L) / (255 - INK) * 1.6));
    if (!bg[i] && L < 200) a = 1; // solid outline / fill pixels stay opaque
  } else a = bg[i] ? 0 : 1;
  if (!bg[i] && bgLike[i]) enclosedWhite++;
  // Un-mix from white for semi-transparent edge pixels.
  const un = (v) => (a > 0 && a < 1 ? Math.max(0, Math.min(255, Math.round((v - (1 - a) * 255) / a))) : v);
  out.data[i * 4] = un(r);
  out.data[i * 4 + 1] = un(g);
  out.data[i * 4 + 2] = un(b);
  out.data[i * 4 + 3] = Math.round(a * 255);
}

// Crop to visible content + padding (no scaling).
let x0 = W, y0 = H, x1 = -1, y1 = -1;
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (out.data[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD); x1 = Math.min(W - 1, x1 + PAD); y1 = Math.min(H - 1, y1 + PAD);
const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const crop = new PNG({ width: cw, height: ch });
PNG.bitblt(out, crop, x0, y0, cw, ch, 0, 0);
writeFileSync(output, PNG.sync.write(crop, { colorType: 6 }));
console.log(JSON.stringify({ input, output, source: [W, H], crop: { x: x0, y: y0, w: cw, h: ch }, enclosedWhitePixelsPreserved: enclosedWhite, filledEnclosedWhite: filled, removedBackgroundPixels: bg.reduce((a, v) => a + v, 0) }));
