import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { SmokeConfig } from './smoke';

/**
 * Screenshot capture for the public website and the presentation (dev tooling only).
 * ORBITAL_SMOKE_OUT + ORBITAL_REVIEW=capture + MOCHI_SMOKE_AI=ollama. Public crew names (no private identities),
 * real local model for the conversation, isolated profile. One controlled pass per theme.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runCapture(cfg: SmokeConfig, ctx: { dashboard: BrowserWindow; companion: BrowserWindow }): Promise<void> {
  mkdirSync(cfg.outDir, { recursive: true });
  const log: Record<string, unknown> = { theme: cfg.theme ?? 'system', shots: [] as string[] };
  const errors: string[] = [];
  for (const [name, win] of Object.entries({ dashboard: ctx.dashboard, companion: ctx.companion })) {
    win.webContents.on('console-message', (...args: unknown[]) => {
      const e = args[0] as { level?: string | number; message?: string };
      if (['error', '3'].includes(String(e.level ?? args[1]))) errors.push(`${name}: ${String(e.message ?? args[2])}`);
    });
  }
  const timeout = setTimeout(() => {
    writeFileSync(join(cfg.outDir, 'capture.json'), JSON.stringify({ ...log, error: 'timeout', errors }, null, 2));
    app.exit(2);
  }, 360_000);
  const d = ctx.dashboard.webContents;
  const c = ctx.companion.webContents;
  const shots = log.shots as string[];
  const shot = async (win: BrowserWindow, file: string) => {
    writeFileSync(join(cfg.outDir, `${file}.png`), (await win.webContents.capturePage()).toPNG());
    shots.push(file);
  };
  const go = async (section: string, wait = 1100) => {
    await d.executeJavaScript(`location.hash = '#/${section}'`);
    await delay(wait);
    await d.executeJavaScript(`document.querySelector('main')?.scrollTo?.(0, 0); window.scrollTo(0, 0)`);
    await delay(200);
  };
  const scrollTo = async (text: string) => {
    await d.executeJavaScript(`[...document.querySelectorAll('h1,h2,h3')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))?.scrollIntoView({ block: 'start' })`);
    await delay(600);
  };
  const tab = async (title: string) => {
    await d.executeJavaScript(`document.querySelector('[role=radio][title=${JSON.stringify(title)}]')?.click()`);
    await delay(900);
  };
  const select = async (id: string, day: number) => {
    await d.executeJavaScript(`window.orbital.invoke('mission:command', { type: 'pause' }).then(() => window.orbital.invoke('mission:command', { type: 'select', astronautId: '${id}' })).then(() => window.orbital.invoke('mission:command', { type: 'seek', day: ${day} }))`);
    await delay(1500);
  };
  const tapPet = `(() => { const el = document.querySelector('[data-testid=companion]'); const o = { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); })()`;
  const waitReply = async () => {
    for (let i = 0; i < 300; i++) {
      await delay(100);
      if (!(await c.executeJavaScript(`!!document.querySelector('[data-testid=streaming]')`))) return;
    }
  };
  const say = async (text: string) => {
    await c.executeJavaScript(`(() => { const el = document.querySelector('[data-testid=chat-input]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await delay(80);
    await c.executeJavaScript(`document.querySelector('[data-testid=chat-input]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    await delay(300);
    await waitReply();
  };

  try {
    await delay(2500);
    ctx.dashboard.showInactive();
    ctx.companion.showInactive();
    for (let i = 0; i < 40; i++) {
      const s = await d.executeJavaScript(`window.orbital.invoke('ai:check')`);
      log.ai = { state: s.state, model: s.activeModel };
      if (s.state === 'ready') break;
      await delay(1000);
    }

    // Wellbeing-change scenario (Sofia Patel, CM-04) — Mochi as her companion for the marketing shots.
    await select('CM-04', 130);
    await d.executeJavaScript(`window.orbital.invoke('prefs:set', { pet: { companionByProfile: { 'CM-04': 'mochi', 'CM-01': 'mochi' } } })`);
    await delay(1200);
    await shot(ctx.companion, 'mochi-idle');
    await c.executeJavaScript(tapPet);
    await delay(400);
    await waitReply();
    for (const t of ['I had a terrible day.', 'Long shift and the experiment failed twice.', 'Yeah. Maybe a game later.']) await say(t);
    log.conversation = await c.executeJavaScript(`document.querySelector('[data-testid=chat]')?.innerText ?? ''`);
    await shot(ctx.companion, 'mochi-chat');

    await go('overview');
    await shot(ctx.dashboard, 'drg-overview');
    await go('brain');
    await shot(ctx.dashboard, 'drg-brain');
    await scrollTo('How the decision was reached');
    await shot(ctx.dashboard, 'drg-brain-intelligence');
    await scrollTo('What needs attention');
    await shot(ctx.dashboard, 'drg-alerts');
    await go('crew');
    await shot(ctx.dashboard, 'drg-crew');
    await go('knowledge');
    await shot(ctx.dashboard, 'drg-knowledge');
    await go('settings');
    await scrollTo('Conversational AI');
    await shot(ctx.dashboard, 'drg-settings-ai');
    await go('journal');
    await shot(ctx.dashboard, 'drg-journal');

    // Gamification (Sofia): the chat above unlocked "Hello, friend" → Star ball for the pet home.
    await go('challenges');
    await tab('Today');
    await shot(ctx.dashboard, 'game-today');
    await tab('Explore');
    await shot(ctx.dashboard, 'game-explore');
    await tab('Habitat & pet');
    await d.executeJavaScript(`(async () => { const b = [...document.querySelectorAll('[data-testid=pet-home] button')].find((x) => x.textContent.trim() === 'Star ball'); if (b && !b.disabled) { b.click(); await new Promise((r) => setTimeout(r, 700)); } })()`);
    await delay(900);
    await shot(ctx.dashboard, 'game-habitat');
    await tab('Games');
    await d.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Constellation Memory'))?.click()`);
    await delay(500);
    await d.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Start · remember'))?.click()`);
    await delay(900);
    await shot(ctx.dashboard, 'game-memory');
    await tab('Crew');
    await shot(ctx.dashboard, 'game-crew');
    await tab('Rewards');
    await shot(ctx.dashboard, 'game-rewards');

    // Physical deconditioning scenario (Daniel Reed, CM-03): longitudinal trends.
    await select('CM-03', 150);
    await go('physical');
    await scrollTo('Physical trends and deviations');
    await shot(ctx.dashboard, 'drg-physical-trends');

    // The other companions (for the Fable illustration): render each species in the companion window.
    for (const species of ['dog', 'cat', 'alien']) {
      await d.executeJavaScript(`window.orbital.invoke('prefs:set', { pet: { companionByProfile: { 'CM-03': '${species}' } } })`);
      await delay(1300);
      await c.executeJavaScript(`document.querySelector('[aria-label="Close chat"]')?.click()`);
      await delay(300);
      await shot(ctx.companion, `pet-${species}`);
    }

    log.errors = errors;
    writeFileSync(join(cfg.outDir, 'capture.json'), JSON.stringify(log, null, 2));
    clearTimeout(timeout);
    app.quit();
  } catch (e) {
    writeFileSync(join(cfg.outDir, 'capture.json'), JSON.stringify({ ...log, error: String((e as Error).stack ?? e), errors }, null, 2));
    clearTimeout(timeout);
    app.exit(1);
  }
}
