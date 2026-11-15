#!/usr/bin/env node
/** Visual review walkthrough: runs the BUILT app once per theme with ORBITAL_REVIEW=1 (isolated profile). */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronBin = createRequire(import.meta.url)('electron');
const outRoot = join(appDir, '.review');
for (const theme of ['light', 'dark']) {
  const outDir = join(outRoot, theme);
  rmSync(outDir, { recursive: true, force: true });
  const code = await new Promise((r) => {
    const child = spawn(electronBin, ['.'], { cwd: appDir, env: { ...process.env, ORBITAL_SMOKE_OUT: outDir, ORBITAL_SMOKE_THEME: theme, ORBITAL_REVIEW: '1', ELECTRON_RENDERER_URL: '' }, stdio: 'inherit' });
    child.on('exit', r);
  });
  console.log(`${theme}: exit ${code} → ${outDir}`);
}
