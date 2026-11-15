#!/usr/bin/env node
// Smoke-test the PACKAGED app (what users install), in light and dark mode, then evaluate the reports.
// Used by .github/workflows/release.yml on each native runner, and runnable locally after `electron-builder --dir`
// or a full build:  node apps/desktop/scripts/smoke-packaged.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const release = join(here, '..', 'release');
const candidates = {
  darwin: ['mac-arm64/Mochi.app/Contents/MacOS/Mochi', 'mac/Mochi.app/Contents/MacOS/Mochi', 'mac-universal/Mochi.app/Contents/MacOS/Mochi'],
  win32: ['win-unpacked/Mochi.exe'],
  linux: ['linux-unpacked/mochi'],
}[process.platform] ?? [];
const bin = candidates.map((c) => join(release, c)).find(existsSync);
if (!bin) {
  console.error(`No packaged app found in ${release} (looked for: ${candidates.join(', ')})`);
  process.exit(2);
}

const out = mkdtempSync(join(tmpdir(), 'mochi-packaged-smoke-'));
const timeout = Number(process.env.MOCHI_SMOKE_TIMEOUT_MS ?? 300_000);
for (const theme of ['light', 'dark']) {
  console.log(`▶ ${bin} (${theme})`);
  const r = spawnSync(bin, [], {
    stdio: 'inherit',
    timeout: timeout + 60_000,
    env: { ...process.env, ORBITAL_SMOKE_OUT: join(out, theme), ORBITAL_SMOKE_THEME: theme, MOCHI_SMOKE_TIMEOUT_MS: String(timeout) },
  });
  if (r.error) {
    console.error(`Packaged app failed to run (${theme}):`, r.error.message);
    process.exit(1);
  }
}
const evalRun = spawnSync(process.execPath, [join(here, 'smoke.mjs'), '--report', out], { stdio: 'inherit' });
process.exit(evalRun.status ?? 1);
