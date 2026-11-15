#!/usr/bin/env node
// Static checks for the GitHub Pages site: every local href/src/srcset resolves to a file, no root-absolute
// paths (they break under a project URL like <owner>.github.io/<repo>/), in-page anchors exist, and the external
// links are listed for review.  Usage: node tools/check-site.mjs site [--online]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, normalize, relative } from 'node:path';

const root = process.argv[2] ?? 'site';
const online = process.argv.includes('--online');
const pages = readdirSync(root).filter((f) => f.endsWith('.html'));
const css = readdirSync(root).filter((f) => f.endsWith('.css'));
const problems = [];
const external = new Set();
const used = new Set();

for (const page of pages) {
  const html = readFileSync(join(root, page), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const refs = [
    ...[...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/\ssrcset="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0])),
  ];
  for (const ref of refs) {
    if (/^(https?:)?\/\//.test(ref)) { external.add(ref); continue; }
    if (/^(mailto|tel|data):/.test(ref)) continue;
    if (ref.startsWith('#')) { if (ref.length > 1 && !ids.has(ref.slice(1))) problems.push(`${page}: anchor ${ref} has no matching id`); continue; }
    if (ref.startsWith('/')) { problems.push(`${page}: root-absolute path ${ref} breaks on a project Pages URL`); continue; }
    const file = normalize(join(root, ref.split(/[?#]/)[0]));
    used.add(file);
    if (!existsSync(file)) problems.push(`${page}: missing file ${ref}`);
  }
}
for (const sheet of css) {
  const text = readFileSync(join(root, sheet), 'utf8');
  for (const m of text.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    const ref = m[2];
    if (/^(https?:|data:)/.test(ref)) continue;
    if (ref.startsWith('/')) problems.push(`${sheet}: root-absolute url(${ref})`);
    else if (!existsSync(join(root, ref))) problems.push(`${sheet}: missing url(${ref})`);
  }
}

// Files in site/ that nothing references (informational).
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const unused = walk(root).filter((f) => !/\.(html|css|js)$/.test(f) && !used.has(normalize(f)) && !f.endsWith('.DS_Store'));

if (online) {
  for (const url of external) {
    if (url.startsWith('//')) continue;
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (!r.ok) problems.push(`external ${url} → HTTP ${r.status}`);
    } catch (e) {
      problems.push(`external ${url} → ${e.message}`);
    }
  }
}

console.log(`Checked ${pages.length} page(s), ${css.length} stylesheet(s), ${used.size} local assets, ${external.size} external links.`);
if (unused.length) console.log(`Unreferenced files (not an error):\n  ${unused.map((f) => relative(root, f)).join('\n  ')}`);
console.log(`External links${online ? ' (checked)' : ' (not fetched; use --online)'}:\n  ${[...external].sort().join('\n  ')}`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\n✓ Site links and assets OK');
