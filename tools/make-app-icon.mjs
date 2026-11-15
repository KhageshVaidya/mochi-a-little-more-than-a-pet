#!/usr/bin/env node
/**
 * Generates apps/desktop/build/icon.png (1024×1024) from the corrected Mochi cutout (assets/pets/mochi/mochi.png):
 * a soft rounded tile with Mochi centred. The original reference artwork is never read or modified.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SIZE = 1024;
const src = PNG.sync.read(readFileSync(new URL('../assets/pets/mochi/mochi.png', import.meta.url)));
const out = new PNG({ width: SIZE, height: SIZE });

// Rounded-square tile (macOS-style ~22% radius) with a gentle vertical gradient: dusk lavender → soft sky.
const R = SIZE * 0.225, M = SIZE * 0.06;
const top = [232, 226, 255], bottom = [204, 230, 250];
const inside = (x, y) => {
  const x0 = M, y0 = M, x1 = SIZE - M, y1 = SIZE - M;
  if (x < x0 || x > x1 || y < y0 || y > y1) return 0;
  const cx = Math.min(Math.max(x, x0 + R), x1 - R), cy = Math.min(Math.max(y, y0 + R), y1 - R);
  const d = Math.hypot(x - cx, y - cy);
  return Math.max(0, Math.min(1, R - d + 0.5)); // 1-px anti-aliased edge
};
for (let y = 0; y < SIZE; y++) {
  const t = y / SIZE;
  for (let x = 0; x < SIZE; x++) {
    const a = inside(x + 0.5, y + 0.5);
    const i = (y * SIZE + x) * 4;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(top[c] * (1 - t) + bottom[c] * t);
    out.data[i + 3] = Math.round(a * 255);
  }
}
// Bilinear-scale Mochi to ~74% of the tile height and alpha-composite it, slightly below centre.
const targetH = Math.round(SIZE * 0.74);
const scale = targetH / src.height;
const targetW = Math.round(src.width * scale);
const ox = Math.round((SIZE - targetW) / 2), oy = Math.round((SIZE - targetH) / 2 + SIZE * 0.03);
const sample = (sx, sy, c) => {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(sx))), y0 = Math.max(0, Math.min(src.height - 1, Math.floor(sy)));
  const x1 = Math.min(src.width - 1, x0 + 1), y1 = Math.min(src.height - 1, y0 + 1);
  const fx = sx - x0, fy = sy - y0;
  const p = (x, y) => src.data[(y * src.width + x) * 4 + c];
  return p(x0, y0) * (1 - fx) * (1 - fy) + p(x1, y0) * fx * (1 - fy) + p(x0, y1) * (1 - fx) * fy + p(x1, y1) * fx * fy;
};
for (let y = 0; y < targetH; y++) {
  for (let x = 0; x < targetW; x++) {
    const sx = x / scale, sy = y / scale;
    const a = sample(sx, sy, 3) / 255;
    if (a <= 0) continue;
    const i = ((oy + y) * SIZE + (ox + x)) * 4;
    if (out.data[i + 3] === 0) continue; // stay inside the tile
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(sample(sx, sy, c) * a + out.data[i + c] * (1 - a));
  }
}
writeFileSync(new URL('../apps/desktop/build/icon.png', import.meta.url), PNG.sync.write(out));
console.log(`icon.png ${SIZE}×${SIZE} written`);
