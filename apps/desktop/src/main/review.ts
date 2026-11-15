import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { SmokeConfig } from './smoke';

/**
 * Visual review walkthrough (dev tooling only; enabled with ORBITAL_SMOKE_OUT + ORBITAL_REVIEW=1 via
 * scripts/review.mjs). Drives the REAL UI like a user — crew switcher, sections, tabs, Mochi's chat box,
 * both brain games — and records screenshots plus what each screen displayed. Changes no app behaviour.
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEMO = [
  { id: 'CM-01', day: 150 },
  { id: 'CM-02', day: 100 },
  { id: 'CM-03', day: 150 },
  { id: 'CM-04', day: 130 },
  { id: 'CM-05', day: 120 },
] as const;

export async function runReview(cfg: SmokeConfig, ctx: { dashboard: BrowserWindow; companion: BrowserWindow }): Promise<void> {
  mkdirSync(cfg.outDir, { recursive: true });
  const theme = cfg.theme ?? 'system';
  const log: Record<string, unknown> = { theme };
  const errors: string[] = [];
  for (const [name, win] of Object.entries({ dashboard: ctx.dashboard, companion: ctx.companion })) {
    win.webContents.on('console-message', (...args: unknown[]) => {
      const e = args[0] as { level?: string | number; message?: string };
      const level = String(e.level ?? args[1]);
      if (['error', '3'].includes(level)) errors.push(`${name}: ${String(e.message ?? args[2])}`);
    });
  }
  for (const [name, win] of Object.entries({ dashboard: ctx.dashboard, companion: ctx.companion })) {
    win.webContents.on('render-process-gone', (_e, det) => errors.push(`${name} renderer gone: ${det.reason} (${det.exitCode})`));
    win.webContents.on('did-start-navigation', (_e, url, inPlace, isMain) => isMain && !inPlace && errors.push(`${name} navigation: ${url}`));
    win.on('closed', () => errors.push(`${name} window closed`));
  }
  const timeout = setTimeout(() => {
    writeFileSync(join(cfg.outDir, 'review.json'), JSON.stringify({ ...log, error: 'timeout', errors }, null, 2));
    app.exit(2);
  }, 900_000);

  const d = ctx.dashboard.webContents;
  const c = ctx.companion.webContents;
  const js = <T = unknown>(wc: Electron.WebContents, code: string) => wc.executeJavaScript(code) as Promise<T>;
  const shot = async (win: BrowserWindow, file: string) => writeFileSync(join(cfg.outDir, `${file}.png`), (await win.webContents.capturePage()).toPNG());
  const go = async (section: string) => {
    await js(d, `location.hash = '#/${section}'; window.scrollTo(0,0); document.querySelector('main')?.scrollTo?.(0,0)`);
    await delay(900);
  };
  const scrollTo = async (text: string) => {
    const found = await js<boolean>(d, `(() => { const el = [...document.querySelectorAll('h1,h2,h3,p,span')].find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)})); el?.scrollIntoView({ block: 'start' }); return !!el; })()`);
    await delay(500);
    return found;
  };
  const tab = async (title: string) => {
    await js(d, `document.querySelector('[role=radio][title=${JSON.stringify(title)}]')?.click()`);
    await delay(800);
  };
  const text = (sel: string) => js<string[]>(d, `[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => e.innerText.replace(/\\s+/g, ' ').trim())`);

  try {
    await delay(2500);
    ctx.dashboard.showInactive();
    ctx.companion.showInactive();
    await delay(1500);

    // ── Crew switcher (real UI) ───────────────────────────────────────────────
    await go('overview');
    await js(d, `document.querySelector('[aria-haspopup=listbox]')?.click()`);
    await delay(500);
    await shot(ctx.dashboard, 'crew-switcher');
    log.switcherOptions = await text('[role=listbox] button, [role=option]');
    await js(d, `document.querySelector('[aria-haspopup=listbox]')?.click()`);

    const perCrew: Record<string, unknown> = {};
    for (const { id, day } of DEMO) {
      // Switch crew through the sidebar switcher, then seek via the timeline API (the slider is a range input).
      await js(d, `document.querySelector('[aria-haspopup=listbox]')?.click()`);
      await delay(300);
      const clicked = await js<boolean>(d, `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes(${JSON.stringify(id)}) && x.closest('[role=listbox], .absolute')); b?.click(); return !!b; })()`);
      await delay(400);
      if (!clicked) await js(d, `window.orbital.invoke('mission:command', { type: 'select', astronautId: ${JSON.stringify(id)} })`);
      await js(d, `window.orbital.invoke('mission:command', { type: 'pause' }).then(() => window.orbital.invoke('mission:command', { type: 'seek', day: ${day} }))`);
      await delay(1200);
      const sel = await js<{ astronautId: string; day: number }>(d, `window.orbital.invoke('mission:get')`);

      await go('overview');
      await shot(ctx.dashboard, `${id}-overview`);
      await go('brain');
      await shot(ctx.dashboard, `${id}-brain`);
      const brainState = (await text('h1, h2')).slice(0, 4);
      await scrollTo('How the decision was reached');
      await shot(ctx.dashboard, `${id}-brain-intelligence`);
      const intel = await js<Record<string, unknown>>(d, `(() => { const p = document.querySelector('[data-testid=intelligence-brain]'); const ml = document.querySelector('[data-testid=ml-advisory]'); return { findings: [...(p?.querySelectorAll('[data-finding]') ?? [])].map((r) => r.innerText.replace(/\\s+/g,' ').slice(0, 160)), ml: ml?.innerText.replace(/\\s+/g,' ').slice(0, 260), mlStatus: ml?.getAttribute('data-ml-status') }; })()`);
      await go('physical');
      await scrollTo('Physical trends and deviations');
      await shot(ctx.dashboard, `${id}-physical-intelligence`);
      const physical = await js<string[]>(d, `[...document.querySelectorAll('[data-testid=intelligence-physical] [data-finding]')].map((r) => r.innerText.replace(/\\s+/g,' ').slice(0, 160))`);

      await go('challenges');
      await tab('Today');
      await shot(ctx.dashboard, `${id}-today`);
      const missions = await text('[data-mission]');
      await scrollTo('Why these suggestions?');
      await shot(ctx.dashboard, `${id}-why`);
      const recs = await text('[data-recommendation]');
      const whyText = await js<string>(d, `(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes('Why these suggestions')); return h?.closest('section')?.innerText.replace(/\\s+/g,' ') ?? ''; })()`);

      // Mochi: open the chat panel through the real companion UI and ask for ideas.
      const tapPet = `(() => { const el = document.querySelector('[data-testid=companion]'); const o = { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 }; el?.dispatchEvent(new PointerEvent('pointerdown', o)); el?.dispatchEvent(new PointerEvent('pointerup', o)); })()`;
      if (!(await js<boolean>(c, `!!document.querySelector('[data-testid=chat]')`))) {
        await js(c, tapPet);
        await delay(400);
        await js(c, `document.querySelector('[data-action=chat]')?.click()`);
      }
      await delay(1200);
      await shot(ctx.companion, `${id}-mochi-open`);
      await js(c, `(() => { const el = document.querySelector('[data-testid=chat-input]'); if (!el) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, 'what should I do today?'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await delay(200);
      await js(c, `document.querySelector('[data-testid=chat-input]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
      await delay(1500);
      await shot(ctx.companion, `${id}-mochi-ideas`);
      const chat = await js<string>(c, `document.querySelector('[data-testid=chat]')?.innerText.replace(/\\s+/g,' ') ?? '(chat panel not open)'`);
      // Close the panel (tapping the pet while the chat is open closes it) so the next crew starts fresh.
      if (await js<boolean>(c, `!!document.querySelector('[data-testid=chat]')`)) await js(c, tapPet);
      await delay(500);

      perCrew[id] = { selected: sel, brainHeadings: brainState, intel, physical, missions, recs, whyText: whyText.slice(0, 900), mochi: chat.slice(0, 900) };
    }
    log.perCrew = perCrew;

    // ── Gamification walkthrough on CM-04 day 130 ─────────────────────────────
    await js(d, `window.orbital.invoke('mission:command', { type: 'select', astronautId: 'CM-04' }).then(() => window.orbital.invoke('mission:command', { type: 'seek', day: 130 }))`);
    await delay(1200);
    await go('challenges');
    for (const t of ['Explore', 'Habitat & pet', 'Crew', 'Rewards']) {
      await tab(t);
      await shot(ctx.dashboard, `game-${t.split(' ')[0]!.toLowerCase()}`);
      if (t === 'Explore') {
        log.explore = await js(d, `[...document.querySelectorAll('[data-destination]')].map((g) => g.getAttribute('data-destination') + ':' + g.getAttribute('data-reached'))`);
        await scrollTo('Where you’ve been');
        await shot(ctx.dashboard, 'game-explore-history');
      }
      if (t === 'Rewards') {
        await scrollTo('Achievements');
        await shot(ctx.dashboard, 'game-achievements');
      }
    }
    // Pet home: equip and play with a toy if one is unlocked (the chat above unlocks "Hello, friend" → Star ball).
    await tab('Habitat & pet');
    const pet = await js<Record<string, unknown>>(d, `(async () => {
      const btn = [...document.querySelectorAll('[data-testid=pet-home] button')].find((b) => b.textContent.trim() === 'Star ball');
      if (!btn || btn.disabled) return { starBall: 'locked', items: [...document.querySelectorAll('[data-testid=pet-home] button')].map((b) => b.textContent.trim()) };
      btn.click(); await new Promise((r) => setTimeout(r, 800));
      const play = [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Play with'));
      play?.click(); await new Promise((r) => setTimeout(r, 300));
      return { starBall: 'equipped', played: !!play };
    })()`);
    await delay(300);
    await shot(ctx.dashboard, 'game-pet-home');
    await shot(ctx.companion, 'mochi-toy');
    log.petHome = pet;

    // Brain games, played through the UI.
    await tab('Games');
    await js(d, `[...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Signal Catch'))?.click()`);
    await delay(500);
    await shot(ctx.dashboard, 'game-signal-ready');
    log.signalCatch = await js(d, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const btn = () => document.querySelector('[data-testid=signal-catch]');
      for (let i = 0; i < 300; i++) {
        const t = btn()?.innerText ?? '';
        if (t.includes('Median')) return t.replace(/\\s+/g, ' ');
        if (t.includes('Now!')) { await wait(180 + Math.random() * 60); btn().click(); }
        else if (t.includes('Click or press') || t.includes('early')) btn().click();
        await wait(t.includes('Wait') ? 120 : 250);
        for (let k = 0; k < 40 && (btn()?.innerText ?? '').includes('Wait'); k++) await wait(100);
      }
      return btn()?.innerText.replace(/\\s+/g, ' ');
    })()`);
    await delay(800);
    await shot(ctx.dashboard, 'game-signal-done');
    await js(d, `[...document.querySelectorAll('[role=radio]')].find((b) => b.textContent === 'Easy')?.click()`);
    await js(d, `[...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Constellation Memory'))?.click()`);
    await delay(600);
    await js(d, `[...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('Start · remember'))?.click()`);
    await delay(700);
    await shot(ctx.dashboard, 'game-memory-show');
    log.memory = await js(d, `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const status = () => document.querySelector('[data-testid=constellation]')?.parentElement?.innerText ?? '';
      for (let round = 0; round < 6; round++) {
        const seen = [];
        let last = -1;
        for (let k = 0; k < 200 && !status().includes('Your turn'); k++) {
          const stars = [...document.querySelectorAll('[data-testid=constellation] button')];
          const lit = stars.findIndex((s) => s.textContent.includes('★'));
          if (lit >= 0 && lit !== last) seen.push(lit);
          last = lit;
          await wait(40);
        }
        if (status().includes('recalled')) break;
        const stars = [...document.querySelectorAll('[data-testid=constellation] button')];
        const finish = round >= 2; // after a few rounds, tap a wrong star to end the game
        const before = status().replace(/\s+/g, ' ');
        for (const [i, s] of seen.entries()) { (finish && i === seen.length - 1 ? stars[(s + 1) % stars.length] : stars[s]).click(); await wait(120); }
        if (finish) return 'rounds completed: ' + round + ' · last sequence length ' + seen.length + ' · status before final tap: ' + before;
        await wait(700);
        if (status().includes('recalled')) break;
      }
      return status().replace(/\\s+/g, ' ');
    })()`);
    await delay(1500);
    await shot(ctx.dashboard, 'game-memory-done');
    log.memoryHistory = await js(d, `window.orbital.invoke('game:history', { astronautId: 'CM-04', game: 'constellation-memory' })`);
    log.signalHistory = await js(d, `window.orbital.invoke('game:history', { astronautId: 'CM-04', game: 'signal-catch' })`);
    await scrollTo('Your history');
    await shot(ctx.dashboard, 'game-history');

    // ── Disconnected-path probes ──────────────────────────────────────────────
    await go('journal');
    await shot(ctx.dashboard, 'journal');
    log.journalCreateControl = await js(d, `[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => /new|write|add/i.test(t))`);
    await go('companion');
    await shot(ctx.dashboard, 'companion-section');
    log.companionSectionHasChat = await js(d, `!!document.querySelector('input[placeholder*="Say something"], [data-testid=chat]')`);
    await go('settings');
    await shot(ctx.dashboard, 'settings');
    log.settingsLlm = await js(d, `[...document.querySelectorAll('p')].map((p) => p.innerText).filter((t) => /language model|LLM|Claude|Anthropic|Ollama/i.test(t)).slice(0, 6)`);
    log.llmStatus = await js(d, `window.orbital.invoke('llm:status')`);
    await go('crew');
    await shot(ctx.dashboard, 'crew-section');

    log.errors = errors;
    writeFileSync(join(cfg.outDir, 'review.json'), JSON.stringify(log, null, 2));
    clearTimeout(timeout);
    app.quit();
  } catch (e) {
    writeFileSync(join(cfg.outDir, 'review.json'), JSON.stringify({ ...log, error: String((e as Error).stack ?? e), errors }, null, 2));
    clearTimeout(timeout);
    app.exit(1);
  }
}
