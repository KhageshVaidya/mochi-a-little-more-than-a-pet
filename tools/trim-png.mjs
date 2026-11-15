#!/usr/bin/env node
/** Trim fully transparent borders from PNGs (used for companion-window screenshots). Usage: node tools/trim-png.mjs <png>... */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(readFileSync(f));
  let x0 = p.width, y0 = p.height, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) continue;
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(p.width - 1, x1 + pad); y1 = Math.min(p.height - 1, y1 + pad);
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(p, out, x0, y0, out.width, out.height, 0, 0);
  writeFileSync(f, PNG.sync.write(out));
  console.log(`${f}: ${p.width}×${p.height} → ${out.width}×${out.height}`);
}
