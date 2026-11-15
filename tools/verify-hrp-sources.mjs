#!/usr/bin/env node
/**
 * Maintainer tool (online, manual): re-fetch every NASA source in the HRP knowledge registry and check
 * that page titles still match and every quoted statement/mitigation still appears verbatim.
 * The app itself never runs this and never goes online for HRP knowledge.
 *
 *   node tools/verify-hrp-sources.mjs
 */
import { readFileSync } from 'node:fs';

const reg = JSON.parse(readFileSync(new URL('../packages/data-sources/knowledge/nasa-hrp/registry.json', import.meta.url), 'utf8'));
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const norm = (s) => decode(s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').replace(/ ([.,;:])/g, '$1');
const text = (html) => norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '));

let problems = 0;
const pages = new Map();
for (const s of reg.sources) {
  try {
    const res = await fetch(s.url, { headers: { 'user-agent': 'orbital-hrp-verifier' } });
    const html = await res.text();
    const title = norm(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').replace(/ - NASA$/, '').trim();
    pages.set(s.id, text(html));
    if (title !== norm(s.title)) {
      problems++;
      console.log(`TITLE  ${s.id}: page "${title}" ≠ registry "${s.title}"`);
    }
  } catch (e) {
    problems++;
    console.log(`FETCH  ${s.id}: ${e.message}`);
  }
}
for (const r of reg.risks) {
  for (const q of [...r.statements, ...r.mitigations]) {
    const page = pages.get(q.sourceId);
    if (page && !page.includes(norm(q.quote))) {
      problems++;
      console.log(`QUOTE  ${r.id} (${q.sourceId}): "${q.quote}"`);
    }
  }
}
console.log(problems ? `\n${problems} problem(s): update the registry and bump registryVersion.` : `\nAll ${reg.sources.length} sources and quotes verified.`);
process.exit(problems ? 1 : 0);
