#!/usr/bin/env node
/** Screenshot capture for website + presentation: built app, public crew names, real local model, one pass per theme. */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const electronBin = createRequire(import.meta.url)('electron');
for (const theme of process.argv.slice(2).length ? process.argv.slice(2) : ['light', 'dark']) {
  const outDir = join(appDir, '.review', `capture-${theme}`);
  rmSync(outDir, { recursive: true, force: true });
  const code = await new Promise((r) => {
    const child = spawn(electronBin, ['.'], { cwd: appDir, env: { ...process.env, ORBITAL_SMOKE_OUT: outDir, ORBITAL_SMOKE_THEME: theme, ORBITAL_REVIEW: 'capture', MOCHI_SMOKE_AI: 'ollama', ELECTRON_RENDERER_URL: '' }, stdio: 'inherit' });
    child.on('exit', r);
  });
  console.log(`${theme}: exit ${code} → ${outDir}`);
}
