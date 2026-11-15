import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { SmokeConfig } from './smoke';

/**
 * M1 demonstration capture (dev tooling only): ORBITAL_SMOKE_OUT + ORBITAL_REVIEW=demo + MOCHI_SMOKE_AI=ollama.
 * Drives the REAL app with the REAL local model through the companion's own chat box and records screenshots,
 * the transcript, voices and latencies. Short by design (one pass per theme).
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDemo(cfg: SmokeConfig, ctx: { dashboard: BrowserWindow; companion: BrowserWindow }): Promise<void> {
  mkdirSync(cfg.outDir, { recursive: true });
  const log: Record<string, unknown> = { theme: cfg.theme ?? 'system', startedAt: new Date().toISOString() };
  const errors: string[] = [];
  for (const [name, win] of Object.entries({ dashboard: ctx.dashboard, companion: ctx.companion })) {
    win.webContents.on('console-message', (...args: unknown[]) => {
      const e = args[0] as { level?: string | number; message?: string };
      if (['error', '3'].includes(String(e.level ?? args[1]))) errors.push(`${name}: ${String(e.message ?? args[2])}`);
    });
  }
  const timeout = setTimeout(() => {
    writeFileSync(join(cfg.outDir, 'demo.json'), JSON.stringify({ ...log, error: 'timeout', errors }, null, 2));
    app.exit(2);
  }, 300_000);
  const d = ctx.dashboard.webContents;
  const c = ctx.companion.webContents;
  const shot = async (win: BrowserWindow, file: string) => writeFileSync(join(cfg.outDir, `${file}.png`), (await win.webContents.capturePage()).toPNG());
  const tapPet = `(() => { const el = document.querySelector('[data-testid=companion]'); const o = { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); })()`;
  const waitReply = async () => {
    for (let i = 0; i < 300; i++) {
      await delay(100);
      if (!(await c.executeJavaScript(`!!document.querySelector('[data-testid=streaming]')`))) return;
    }
  };
  const say = async (text: string) => {
    await c.executeJavaScript(`(() => { const el = document.querySelector('[data-testid=chat-input]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await delay(100);
    const t0 = Date.now();
    await c.executeJavaScript(`document.querySelector('[data-testid=chat-input]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    // Capture once mid-stream if possible (shows streaming), then wait for completion.
    let midStream: string | null = null;
    for (let i = 0; i < 40 && !midStream; i++) {
      await delay(50);
      midStream = await c.executeJavaScript(`document.querySelector('[data-testid=streaming]')?.innerText ?? null`);
    }
    await waitReply();
    const wallMs = Date.now() - t0;
    const status = await d.executeJavaScript(`window.orbital.invoke('ai:status')`);
    const lastReply = await c.executeJavaScript(`[...document.querySelectorAll('[data-testid=chat] p')].map((p) => p.innerText).filter(Boolean).at(-1) ?? ''`);
    return { you: text, mochi: lastReply, wallMs, model: status.lastTurn?.model ?? null, firstTokenMs: status.lastTurn?.firstTokenMs ?? null, totalMs: status.lastTurn?.totalMs ?? null, sawStreaming: midStream !== null };
  };

  try {
    await delay(2500);
    log.dashboardVisibleAtLaunch = ctx.dashboard.isVisible();
    ctx.companion.showInactive();
    await d.executeJavaScript(`window.orbital.invoke('mission:command', { type: 'select', astronautId: 'CM-01' }).then(() => window.orbital.invoke('mission:command', { type: 'seek', day: 90 }))`);
    await delay(1500);
    // Wait for the model to be ready (health check + warm-up).
    for (let i = 0; i < 60; i++) {
      const s = await d.executeJavaScript(`window.orbital.invoke('ai:check')`);
      log.aiStatusAtStart = s;
      if (s.state === 'ready') break;
      await delay(1000);
    }
    log.profiles = await d.executeJavaScript(`window.orbital.invoke('crew:list').then((l) => l.map((p) => p.id + ' ' + p.name))`);
    await shot(ctx.companion, '01-desktop-first-mochi');

    await c.executeJavaScript(tapPet);
    await delay(400);
    await waitReply();
    await delay(300);
    await shot(ctx.companion, '02-click-opens-chat-model-greeting');
    const turns = [];
    for (const [i, t] of ['I had a terrible day.', 'Had an argument with Maya.', 'Haha, shut up.'].entries()) {
      turns.push(await say(t));
      await shot(ctx.companion, `03-conversation-turn-${i + 1}`);
    }
    log.conversation = turns;

    const open = await say('Open Dr G Zero');
    ctx.dashboard.showInactive();
    await delay(1500);
    await shot(ctx.dashboard, '04-open-dr-g-zero');
    const health = await say('Mochi, show me my health');
    await delay(1200);
    log.commands = { open, health, dashboardHash: await d.executeJavaScript(`location.hash`) };
    await shot(ctx.dashboard, '05-show-me-my-health');

    await d.executeJavaScript(`location.hash = '#/settings'`);
    await delay(900);
    await d.executeJavaScript(`[...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Conversational AI'))?.scrollIntoView({ block: 'start' })`);
    await delay(500);
    await shot(ctx.dashboard, '06-settings-local-ai');

    // Simple mode: turn the provider off, reopen the chat.
    await d.executeJavaScript(`window.orbital.invoke('prefs:set', { ai: { provider: 'off' } })`);
    await delay(800);
    await c.executeJavaScript(`document.querySelector('[aria-label="Close chat"]')?.click()`);
    await delay(300);
    await c.executeJavaScript(tapPet);
    await delay(800);
    await waitReply();
    log.simpleMode = { badge: await c.executeJavaScript(`!!document.querySelector('[data-testid=simple-mode]')`), reply: await say('hey, how are you?') };
    await shot(ctx.companion, '07-simple-mode-badge');
    await d.executeJavaScript(`window.orbital.invoke('prefs:set', { ai: { provider: 'ollama' } }).then(() => window.orbital.invoke('ai:check'))`);
    await delay(1500);

    // Profile switch → that astronaut's own companion and chat session.
    await c.executeJavaScript(`document.querySelector('[aria-label="Close chat"]')?.click()`);
    await d.executeJavaScript(`window.orbital.invoke('mission:command', { type: 'select', astronautId: 'CM-02' })`);
    await delay(1800);
    await shot(ctx.companion, '08-profile-switch-own-companion');
    await c.executeJavaScript(tapPet);
    await delay(400);
    await waitReply();
    log.secondProfile = await say('Alex dragged me on another adventure.');
    await shot(ctx.companion, '09-second-profile-chat');

    await d.executeJavaScript(`location.hash = '#/journal'`);
    await delay(900);
    await shot(ctx.dashboard, '10-journal-new-entry');
    await d.executeJavaScript(`location.hash = '#/challenges'`);
    await delay(1200);
    await shot(ctx.dashboard, '11-missions-today');

    log.errors = errors;
    log.finalAiStatus = await d.executeJavaScript(`window.orbital.invoke('ai:status')`);
    writeFileSync(join(cfg.outDir, 'demo.json'), JSON.stringify(log, null, 2));
    clearTimeout(timeout);
    app.quit();
  } catch (e) {
    writeFileSync(join(cfg.outDir, 'demo.json'), JSON.stringify({ ...log, error: String((e as Error).stack ?? e), errors }, null, 2));
    clearTimeout(timeout);
    app.exit(1);
  }
}
