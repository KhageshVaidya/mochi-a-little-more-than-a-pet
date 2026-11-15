import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AI, type AiPrefs } from '@orbital/contracts';
import { CLINICAL, buildModelMessages, type ModelTurn } from '@orbital/companion';
import { AiService } from './ai-service';

/**
 * LIVE multi-turn conversations with the real local model(s) through the same pipeline Mochi uses:
 * prompt builder → Ollama streaming → output guard. Opt-in (needs a running Ollama):
 *
 *   MOCHI_LIVE=1 npx vitest run apps/desktop/src/main/mochi-live-ollama.test.ts              # preferred model, assertions
 *   MOCHI_LIVE=1 MOCHI_BENCH=1 npx vitest run apps/desktop/src/main/mochi-live-ollama.test.ts # + fallback model, writes results
 *
 * Results (full transcripts): private/benchmarks/mochi-m1-ollama-benchmark.results.json, git-ignored (only with MOCHI_BENCH=1).
 * Publish metrics only (see docs/mochi-m1-ollama-benchmark.summary.json).
 */

const LIVE = process.env['MOCHI_LIVE'] === '1';
const BENCH = process.env['MOCHI_BENCH'] === '1';
const PREFERRED = DEFAULT_AI.ollama.model;
const FALLBACK = DEFAULT_AI.ollama.fallbackModel;

const persona = { name: 'Mochi', traits: ['playful', 'gentle', 'a little cheeky', 'loyal'] };
const ctx = { firstName: 'Maya', timeOfDay: 'evening' as const, restDay: false, suggestions: ['Recovery expedition'], memories: ['likes chess'], achievementsToday: [] };

/** Multi-turn scripts. Each user line is sent after the model's previous reply (true multi-turn context). */
export const SCRIPTS: { id: string; turns: string[] }[] = [
  { id: 'brief-example', turns: ['I had a terrible day.', 'Had an argument with Alex.', 'Haha, shut up.'] },
  { id: 'wants-space', turns: ['Not now Mochi.', 'Seriously, leave me alone for a bit.'] },
  { id: 'good-news', turns: ['The experiment finally worked!', 'Three weeks of failures, then boom.', 'Thanks buddy.'] },
  { id: 'tired', turns: ['I barely slept.', 'Stupid fan noise all night.', 'What should I do?'] },
  { id: 'small-talk', turns: ['Hey Mochi', 'What did you do all day?', 'Tell me a joke.'] },
  { id: 'crew', turns: ['Sofia made pancakes for everyone.', 'James burned his though.'] },
];

const REASONING = /<\/?think>|\bthe user\b|\bI (need|should) to\b|\bmy reply\b|\brules?\b.*\bdraft\b/i;
const STAGE = /\*[^*]+\*|\((smiles|laughs|wags|tilts)[^)]*\)/i;

interface TurnResult {
  script: string;
  user: string;
  reply: string | null;
  firstTokenMs: number | null;
  totalMs: number | null;
  words: number;
  questions: number;
  reasoningChars: number;
  violations: string[];
}

async function runScripts(model: string, aiPrefs: AiPrefs): Promise<TurnResult[]> {
  const ai = new AiService(() => aiPrefs);
  const s = await ai.check();
  ai.dispose();
  if (s.state !== 'ready') throw new Error(`Ollama not ready: ${s.state} ${s.detail ?? ''}`);
  const out: TurnResult[] = [];
  for (const sc of SCRIPTS) {
    const turns: ModelTurn[] = [];
    for (const user of sc.turns) {
      turns.push({ from: 'user', text: user });
      const r = await ai.generate(buildModelMessages(persona, ctx, turns), () => {}, { model });
      const reply = r?.text ?? null;
      const violations: string[] = [];
      if (!reply) violations.push('no-reply');
      else {
        if (reply.split(/\s+/).length > 36) violations.push('too-long');
        if ((reply.match(/\?/g) ?? []).length > 1) violations.push('multiple-questions');
        if (REASONING.test(reply)) violations.push('reasoning-visible');
        if (STAGE.test(reply)) violations.push('stage-direction');
        if (CLINICAL.test(reply)) violations.push('clinical');
      }
      out.push({ script: sc.id, user, reply, firstTokenMs: r?.firstTokenMs ?? null, totalMs: r?.totalMs ?? null, words: reply ? reply.split(/\s+/).length : 0, questions: reply ? (reply.match(/\?/g) ?? []).length : 0, reasoningChars: r?.reasoningChars ?? 0, violations });
      turns.push({ from: 'companion', text: reply ?? '…' });
    }
  }
  return out;
}

const summary = (rs: TurnResult[]) => {
  const ok = rs.filter((r) => r.reply);
  const pct = (xs: number[], q: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : null;
  };
  const ft = ok.map((r) => r.firstTokenMs!);
  const tt = ok.map((r) => r.totalMs!);
  return {
    turns: rs.length,
    replied: ok.length,
    violations: rs.flatMap((r) => r.violations).reduce<Record<string, number>>((a, v) => ((a[v] = (a[v] ?? 0) + 1), a), {}),
    firstTokenMs: { median: pct(ft, 0.5), p90: pct(ft, 0.9), max: Math.max(...ft, 0) },
    totalMs: { median: pct(tt, 0.5), p90: pct(tt, 0.9), max: Math.max(...tt, 0) },
    meanWords: ok.length ? +(ok.reduce((a, r) => a + r.words, 0) / ok.length).toFixed(1) : 0,
    meanReasoningChars: ok.length ? Math.round(rs.reduce((a, r) => a + r.reasoningChars, 0) / rs.length) : 0,
  };
};

async function rawThinkOff(model: string, base: string) {
  // Diagnostic: the fallback model with thinking "disabled" (think:false + /no_think) — does reasoning leak?
  const t0 = performance.now();
  const r = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify({ model, stream: false, think: false, keep_alive: '30m', options: { temperature: 0.7, num_predict: 300 }, messages: [...buildModelMessages(persona, ctx, [{ from: 'user', text: 'I had a terrible day. /no_think' }])] }) });
  const j = (await r.json()) as { message: { content: string; thinking?: string } };
  return { ms: Math.round(performance.now() - t0), contentStart: j.message.content.slice(0, 200), reasoningInContent: REASONING.test(j.message.content), thinkingField: (j.message.thinking ?? '').length };
}

describe.skipIf(!LIVE)('LIVE: Mochi conversations with the local model (Ollama)', () => {
  it(
    `preferred model ${PREFERRED}: natural multi-turn replies, streamed, guarded, no reasoning`,
    async () => {
      const prefs: AiPrefs = { ...DEFAULT_AI };
      const rs = await runScripts(PREFERRED, prefs);
      const sum = summary(rs);
      const transcript = rs.map((r) => `[${r.script}] YOU: ${r.user}\n  MOCHI (${r.firstTokenMs}/${r.totalMs} ms): ${r.reply}${r.violations.length ? `  ⚠ ${r.violations.join(',')}` : ''}`).join('\n');
      if (process.env['MOCHI_LIVE_LOG']) writeFileSync(process.env['MOCHI_LIVE_LOG'], `${JSON.stringify(sum, null, 1)}\n${transcript}\n`);
      expect(sum.replied).toBe(rs.length);
      expect(rs.every((r) => !r.violations.includes('reasoning-visible') && !r.violations.includes('clinical'))).toBe(true);
      expect(rs.every((r) => r.words <= 36 && r.questions <= 1)).toBe(true);
      expect(sum.meanReasoningChars).toBe(0);
      if (BENCH) {
        let fallback: unknown = 'not run';
        let raw: unknown = 'not run';
        try {
          const fr = await runScripts(FALLBACK, prefs);
          fallback = { summary: summary(fr), turns: fr };
        } catch (e) {
          fallback = { error: String(e) };
        }
        try {
          raw = await rawThinkOff(FALLBACK, prefs.ollama.baseUrl);
        } catch (e) {
          raw = { error: String(e) };
        }
        mkdirSync(new URL('../../../../private/benchmarks/', import.meta.url), { recursive: true });
        writeFileSync(
          new URL('../../../../private/benchmarks/mochi-m1-ollama-benchmark.results.json', import.meta.url),
          JSON.stringify({ generatedBy: 'MOCHI_LIVE=1 MOCHI_BENCH=1 npx vitest run apps/desktop/src/main/mochi-live-ollama.test.ts', at: new Date().toISOString(), machine: `${process.platform}/${process.arch}`, scripts: SCRIPTS, preferred: { model: PREFERRED, summary: sum, turns: rs }, fallback: { model: FALLBACK, ...(fallback as object) }, fallbackThinkingDisabledDiagnostic: raw }, null, 2) + '\n',
        );
      }
    },
    900_000,
  );
});

describe.skipIf(LIVE)('LIVE tests skipped', () => {
  it('set MOCHI_LIVE=1 with Ollama running to run real multi-turn conversations (never faked)', () => {
    expect(LIVE).toBe(false);
  });
});
