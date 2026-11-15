import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { Storage } from './storage';
import type { DataService } from './data-service';
import { SECURE_WEB_PREFERENCES } from './windows';

/**
 * Launch verification. Enabled only when ORBITAL_SMOKE_OUT is set (see scripts/smoke.mjs).
 * Boots the real app, probes security boundaries and IPC from inside each renderer,
 * captures screenshots of both windows, writes report.json and quits.
 */

export interface SmokeConfig {
  outDir: string;
  userData: string;
  theme: 'light' | 'dark' | undefined;
}

export function smokeConfig(): SmokeConfig | undefined {
  const outDir = process.env['ORBITAL_SMOKE_OUT'];
  if (!outDir) return undefined;
  const t = process.env['ORBITAL_SMOKE_THEME'];
  return { outDir, userData: join(outDir, 'userdata'), theme: t === 'light' || t === 'dark' ? t : undefined };
}

interface ConsoleIssue {
  window: string;
  level: string;
  message: string;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForLoad(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading() && win.webContents.getURL()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    win.webContents.once('did-finish-load', () => resolve());
    win.webContents.once('did-fail-load', (_e, code, desc) => reject(new Error(`load failed ${code} ${desc}`)));
  });
}

export async function runSmoke(
  cfg: SmokeConfig,
  ctx: { dashboard: BrowserWindow; companion: BrowserWindow; storage: Storage; data: DataService; contractsVersion: string },
): Promise<void> {
  mkdirSync(cfg.outDir, { recursive: true });
  const issues: ConsoleIssue[] = [];
  const crashes: string[] = [];
  const windows = { dashboard: ctx.dashboard, companion: ctx.companion };

  for (const [name, win] of Object.entries(windows)) {
    win.webContents.on('console-message', (...args: unknown[]) => {
      // Electron ≥ 35 passes a single event object; older versions pass (event, level, message).
      const e = args[0] as { level?: string | number; message?: string };
      const level = String(e.level ?? args[1]);
      const message = String(e.message ?? args[2]);
      if (['warning', 'error', '2', '3'].includes(level)) issues.push({ window: name, level, message });
    });
    win.webContents.on('preload-error', (_e, path, error) => crashes.push(`${name} preload ${path}: ${error.message}`));
    win.webContents.on('render-process-gone', (_e, d) => crashes.push(`${name} renderer gone: ${d.reason}`));
  }

  const timeout = setTimeout(() => {
    writeFileSync(join(cfg.outDir, 'report.json'), JSON.stringify({ ok: false, error: 'timeout', issues, crashes }, null, 2));
    app.exit(2);
  }, Number(process.env['MOCHI_SMOKE_TIMEOUT_MS'] ?? 120_000)); // whole-probe budget (override for slow environments, e.g. Rosetta)

  try {
    await Promise.all([waitForLoad(ctx.dashboard), waitForLoad(ctx.companion)]);
    // Desktop-first: Dr G Zero (dashboard) is not shown at launch; Mochi is.
    const dashboardHiddenAtLaunch = !ctx.dashboard.isVisible();
    ctx.dashboard.showInactive();
    ctx.companion.showInactive();
    await delay(1800);
    const theme = cfg.theme ?? 'system';
    const shots: string[] = [];
    const capture = async (win: BrowserWindow, file: string) => {
      const img = await win.webContents.capturePage();
      writeFileSync(join(cfg.outDir, file), img.toPNG());
      shots.push(file);
    };

    const dashboardProbe = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      const seek = await o.invoke('mission:command', { type: 'seek', day: 42 });
      const after = await o.invoke('mission:get');
      await o.invoke('mission:command', { type: 'reset' });
      return {
        bridge: typeof o === 'object',
        requireType: typeof require,
        processType: typeof process,
        moduleType: typeof module,
        info: await o.invoke('system:info'),
        companionMoveFromDashboard: await o.invoke('companion:move', { dx: 1, dy: 1 }).then(() => 'allowed', () => 'blocked'),
        missionSeekRoundTrip: seek.day === 42 && after.day === 42,
        rootChildren: document.getElementById('root')?.childElementCount ?? 0,
        colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        bodyBackground: getComputedStyle(document.body).backgroundColor,
      };
    })()`);

    // Five-astronaut walkthrough driven through the real renderer bridge.
    const crewProbe = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      const crew = await o.invoke('crew:list');
      const out = [];
      for (const p of crew) {
        await o.invoke('mission:command', { type: 'select', astronautId: p.id });
        const m = await o.invoke('mission:get');
        const s90 = await o.invoke('data:snapshot', { astronautId: p.id, day: 90 });
        const s150 = await o.invoke('data:snapshot', { astronautId: p.id, day: 150 });
        const a = await o.invoke('brain:assess', { astronautId: p.id, day: 150 });
        const t = await o.invoke('telemetry:day', { astronautId: p.id, day: 90 });
        out.push({
          id: p.id,
          selected: m.astronautId === p.id,
          rhr90: s90.metrics['hr.resting']?.value ?? null,
          rhr150: s150.metrics['hr.resting']?.value ?? null,
          completeness: s150.completeness.overall,
          state150: a.state,
          reasons: a.reasons.length,
          telemetrySamples: t.hr.filter((v) => v !== null).length,
        });
      }
      await o.invoke('mission:command', { type: 'select', astronautId: 'CM-04' });
      await o.invoke('mission:command', { type: 'seek', day: 130 });
      return out;
    })()`);
    await delay(600);

    // ── Mochi: artwork, menu, status, sleep/wake, celebration, drag + persistence ──
    const cw = ctx.companion.webContents;
    const js = (code: string) => cw.executeJavaScript(code);
    // Companions are per astronaut; the Mochi rig checks below need Mochi for the current astronaut.
    await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('mission:get').then((m) => window.orbital.invoke('prefs:set', { pet: { companionByProfile: { [m.astronautId]: 'mochi' } } }))`);
    await delay(900);
    const clickPet = `(() => { const el = document.querySelector('[data-testid=companion]'); const o = { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); return true; })()`;
    const art = await js(`(() => { const img = document.querySelector('[data-companion] img.rig-layer, [data-companion] img.companion-art'); return img ? { src: img.getAttribute('src'), w: img.naturalWidth, h: img.naturalHeight, fit: getComputedStyle(img).objectFit, alt: img.alt, eyelids: document.querySelectorAll('[data-testid=eyelid]').length, tail: !!document.querySelector('.rig-tail.tail-swish') } : null; })()`);
    await capture(ctx.companion, 'mochi-idle.png');
    const rightClickPet = `(() => { document.querySelector('[data-testid=companion]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 })); return true; })()`;
    // M1: a click opens the conversation (never closes it); right-click opens the menu.
    await js(clickPet);
    await delay(500);
    const clickOpensChat = await js(`!!document.querySelector('[data-testid=chat]')`);
    await js(clickPet);
    await delay(300);
    const secondClickKeepsChat = await js(`!!document.querySelector('[data-testid=chat]')`);
    const simpleModeBadge = await js(`!!document.querySelector('[data-testid=simple-mode]')`);
    await capture(ctx.companion, 'mochi-chat-simple-mode.png');
    await js(`document.querySelector('[aria-label="Close chat"]')?.click()`);
    await delay(200);
    await js(rightClickPet);
    await delay(350);
    const menuItems = await js(`[...document.querySelectorAll('[data-testid=menu] [role=menuitem]')].map((b) => b.dataset.action)`);
    await capture(ctx.companion, 'mochi-menu.png');
    await js(`document.querySelector('[data-action=status]').click()`);
    await delay(250);
    const statusText = await js(`document.querySelector('[data-testid=status]')?.innerText ?? ''`);
    await js(`document.querySelector('[aria-label="Close status"]')?.click()`);
    await js(rightClickPet);
    await delay(250);
    await js(`document.querySelector('[data-action=sleep]').click()`);
    await delay(500);
    const sleeping = await js(`({ asleep: document.querySelector('[data-asleep]')?.dataset.asleep, zzz: !!document.querySelector('.overlay-zzz') })`);
    await capture(ctx.companion, 'mochi-sleep.png');
    await js(clickPet); // clicking a sleeping companion wakes it
    await delay(300);
    const woke = await js(`document.querySelector('[data-asleep]')?.dataset.asleep`);
    await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('companion:emit', { type: 'rest.logged' })`);
    await delay(200);
    const celebrating = await js(`({ state: document.querySelector('[data-state]')?.dataset.state, sparkles: !!document.querySelector('.overlay-sparkles'), bubble: document.querySelector('[data-testid=bubble]')?.innerText ?? '' })`);
    await capture(ctx.companion, 'mochi-celebrate.png');
    const before = ctx.companion.getBounds();
    await js(`window.orbitalPet.invoke('companion:move', { dx: -40, dy: -25 }).then(() => window.orbitalPet.invoke('companion:dragEnd'))`);
    await delay(200);
    const after = ctx.companion.getBounds();
    const savedPositions = ctx.storage.getJSON<{ pet: { positions: Record<string, { x: number; y: number }> } }>('prefs')?.pet.positions ?? {};
    await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('prefs:set', { pet: { interactionsEnabled: false } })`);
    await delay(300);
    await js(`document.querySelector('[aria-label="Close chat"]')?.click()`);
    await delay(150);
    await js(clickPet);
    await js(rightClickPet);
    await delay(250);
    const menuWhenDisabled = await js(`!!document.querySelector('[data-testid=menu]') || !!document.querySelector('[data-testid=chat]')`);
    await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('prefs:set', { pet: { interactionsEnabled: true } })`);
    // Every species: switch companion, confirm it renders its own artwork and motion profile; capture idle.
    const speciesProbe: Record<string, unknown> = {};
    for (const id of ['dog', 'cat', 'alien', 'mochi']) {
      // Companions are per astronaut: set the current astronaut's companion.
      await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('mission:get').then((m) => window.orbital.invoke('prefs:set', { pet: { companionByProfile: { [m.astronautId]: '${id}' } } }))`);
      await delay(900);
      speciesProbe[id] = await js(`(() => { const root = document.querySelector('[data-companion]'); const img = root?.querySelector('img'); return { rendered: root?.dataset.companion, profile: [...(root?.classList ?? [])].find((c) => c.startsWith('mp-')), loaded: !!img && img.naturalWidth > 0, src: img?.getAttribute('src') }; })()`);
      await capture(ctx.companion, `companion-${id}.png`);
    }

    // Gamification: XP from synthetic history for every crew member; a logged rest day reaches the companion.
    const gameProbe = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      const xp = {};
      for (const id of ['CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05']) xp[id] = (await o.invoke('game:progress', { astronautId: id, day: 90 })).xp;
      const p = await o.invoke('game:play', { astronautId: 'CM-04', day: 130, game: 'constellation-memory', score: 6, trials: 4 });
      return { xp, afterGameXp: p.progress.xp, dailyMissions: p.progress.dailyMissions.length, destinations: p.progress.exploration.length };
    })()`);
    await delay(300);
    const companionAfterGame = await js(`document.querySelector('[data-testid=bubble]')?.innerText ?? ''`);

    // Phase 2: conversation (templates, LLM off by default), journal, urgent pathway, alerts, crew, determinism.
    const phase2 = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      await o.invoke('mission:command', { type: 'select', astronautId: 'CM-03' });
      await o.invoke('mission:command', { type: 'seek', day: 100 });
      const open = await o.invoke('companion:chat', { action: 'open' });
      await o.invoke('companion:chat', { action: 'start-journal' });
      await o.invoke('companion:chat', { text: 'Good day, the repair went well' });
      const end = await o.invoke('companion:chat', { action: 'end' });
      const journal = await o.invoke('journal:list', { astronautId: 'CM-03' });
      const llm = await o.invoke('ai:status');
      const urgent = await o.invoke('companion:chat', { text: 'I can’t go on' });
      const alerts = await o.invoke('alerts:list', { astronautId: 'CM-03', day: 100 });
      const audit = await o.invoke('alerts:audit', { astronautId: 'CM-03' });
      const board = await o.invoke('crew:board', { astronautId: 'CM-03', day: 100 });
      const a1 = await o.invoke('brain:assess', { astronautId: 'CM-04', day: 140 });
      const a2 = await o.invoke('brain:assess', { astronautId: 'CM-04', day: 140 });
      const patterns = await o.invoke('brain:patterns', { astronautId: 'CM-04', day: 140 });
      await o.invoke('alerts:ack', { astronautId: 'CM-03', day: 100, alertId: alerts[0].id });
      await o.invoke('mission:command', { type: 'select', astronautId: 'CM-04' });
      await o.invoke('mission:command', { type: 'seek', day: 130 });
      return {
        openVoice: open.voice, endVoice: end.voice, journalCount: journal.length, journalSummaryKind: journal[0]?.summary?.kind,
        llmState: llm.state, aiSimpleMode: llm.simpleMode, urgentVoice: urgent.voice, urgent: urgent.urgent, firstAlertTier: alerts[0]?.tier,
        audited: audit.some((x) => x.event === 'safety-escalation'), boardStatuses: board.visibleStatuses.length,
        deterministic: JSON.stringify(a1) === JSON.stringify(a2), sofiaState: a1.state, patternSummary: patterns.summary,
      };
    })()`);

    const mochiProbe = {
      phase2,
      gameProbe,
      companionAfterGame,
      speciesProbe,
      art,
      menuItems,
      statusOk: /Mood/.test(statusText) && /Mission day/.test(statusText),
      sleeping,
      wokeOnClick: woke === 'false',
      celebrating,
      moved: { dx: after.x - before.x, dy: after.y - before.y },
      positionPersisted: Object.values(savedPositions).some((p) => p.x === after.x && p.y === after.y),
      menuWhenDisabled,
      clickOpensChat,
      secondClickKeepsChat,
      simpleModeBadge,
      dashboardHiddenAtLaunch,
    };

    const companionProbe = await ctx.companion.webContents.executeJavaScript(`(async () => ({
      bridge: typeof window.orbitalPet === 'object',
      dashboardBridgeLeak: typeof window.orbital,
      requireType: typeof require,
      missionCommandFromCompanion: await window.orbitalPet.invoke('mission:command', { type: 'play' }).then(() => 'allowed', () => 'blocked'),
      systemInfoFromCompanion: await window.orbitalPet.invoke('system:info').then(() => 'allowed', () => 'blocked'),
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    }))()`);

    // Runtime truth from the OS: is each renderer process actually sandboxed?
    const metrics = app.getAppMetrics();
    const webPreferences = Object.fromEntries(
      Object.entries(windows).map(([name, w]) => {
        const pid = w.webContents.getOSProcessId();
        const metric = metrics.find((m) => m.pid === pid);
        const configured = SECURE_WEB_PREFERENCES;
        return [
          name,
          {
            sandbox: metric?.sandboxed ?? null,
            contextIsolation: configured.contextIsolation,
            nodeIntegration: configured.nodeIntegration,
            webSecurity: configured.webSecurity,
          },
        ];
      }),
    );

    // Mochi M1: "show me my health" opens Dr G Zero at Physical; dashboard mission link opens Mochi's chat;
    // a journal entry can be written in Dr G Zero; branding.
    const cmd = await cw.executeJavaScript(`window.orbitalPet.invoke('companion:chat', { text: 'Mochi, show me my health' })`);
    await delay(700);
    const navigatedTo = await ctx.dashboard.webContents.executeJavaScript(`location.hash`);
    await cw.executeJavaScript(`document.querySelector('[aria-label="Close chat"]')?.click()`);
    await delay(200);
    await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('companion:openChat')`);
    await delay(500);
    const openChatFromDashboard = await cw.executeJavaScript(`!!document.querySelector('[data-testid=chat]')`);
    const journalCreated = await ctx.dashboard.webContents.executeJavaScript(`window.orbital.invoke('journal:create', { astronautId: 'CM-04', day: 130, text: 'Smoke test entry in my own words.', feelings: ['calm'] }).then((j) => j.some((e) => e.turns[0]?.answer === 'Smoke test entry in my own words.'))`);
    const m1Probe = { commandAction: cmd.action, navigatedTo, openChatFromDashboard, journalCreated, dashboardTitle: ctx.dashboard.getTitle(), companionTitle: ctx.companion.getTitle() };

    // Phase 3: NASA HRP knowledge — offline registry, allow-listed source opening, alert risk context, UI.
    const knowledgeProbe = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      const k = await o.invoke('knowledge:hrp');
      const allowed = await o.invoke('knowledge:open-source', { sourceId: 'src:pub-sleep' });
      const blocked = await o.invoke('knowledge:open-source', { sourceId: 'https://example.com' });
      const alerts = await o.invoke('alerts:list', { astronautId: 'CM-04', day: 130 });
      const withContext = alerts.filter((a) => a.riskContext && a.riskContext.length);
      location.hash = '#/knowledge/sleep-schedules';
      // Wait for the page to render (lazy route + data load) instead of a fixed delay; slow machines and CI vary.
      for (let i = 0; i < 80 && !(document.querySelectorAll('[data-risk-id]').length && document.querySelector('[data-risk-detail] [data-source-id]')); i++) await new Promise((r) => setTimeout(r, 100));
      const riskButtons = document.querySelectorAll('[data-risk-id]').length;
      const detail = document.querySelector('[data-risk-detail]')?.getAttribute('data-risk-detail');
      const quotes = document.querySelectorAll('[data-risk-detail] [data-source-id]').length;
      return {
        status: k.status, risks: k.status === 'ok' ? k.registry.risks.length : 0, version: k.status === 'ok' ? k.registry.registryVersion : null,
        allowedOpened: allowed.opened, blockedOpened: blocked.opened,
        alertsWithContext: withContext.length,
        urgentWithContext: alerts.filter((a) => a.tier === 'urgent' && a.riskContext).length,
        contextUrlsNasa: withContext.every((a) => a.riskContext.every((l) => !l.source || l.source.url.startsWith('https://www.nasa.gov/'))),
        riskButtons, detail, sourceLinks: quotes,
      };
    })()`);
    await capture(ctx.dashboard, `knowledge-sleep-${theme}.png`);
    // Phase 4: hybrid intelligence, recommendations, adaptive missions, companion progression, persistence.
    const phase4Probe = await ctx.dashboard.webContents.executeJavaScript(`(async () => {
      const o = window.orbital;
      const ids = ['CM-01', 'CM-02', 'CM-03', 'CM-04', 'CM-05'];
      const days = { 'CM-01': 150, 'CM-02': 100, 'CM-03': 150, 'CM-04': 130, 'CM-05': 120 };
      const crew = {};
      for (const id of ids) {
        const sel = { astronautId: id, day: days[id] };
        const r = await o.invoke('intelligence:report', sel);
        const assess = await o.invoke('brain:assess', sel);
        const recs = await o.invoke('recommendations:list', sel);
        const p = await o.invoke('game:progress', sel);
        crew[id] = { state: r.decision.state, sameAsAssess: r.decision.state === assess.state, ml: r.ml.status, approvedHasMl: 'ml' in r.approved, trends: r.approved.physicalTrendSignals.length,
          recs: recs.recommendations.map((x) => x.kind), adaptive: p.dailyMissions.filter((m) => m.adaptive).map((m) => m.title), missions: p.dailyMissions.length };
      }
      // Companion hidden: gamification keeps working.
      await o.invoke('companion:setVisible', false);
      const before = await o.invoke('game:progress', { astronautId: 'CM-03', day: 101 });
      const after = await o.invoke('game:log', { astronautId: 'CM-03', day: 101, kind: 'movement.break', amount: 1 });
      await o.invoke('companion:setVisible', true);
      const played = await o.invoke('game:play', { astronautId: 'CM-03', day: 101, game: 'constellation-memory', score: 5, trials: 3, difficulty: 'hard' });
      const history = await o.invoke('game:history', { astronautId: 'CM-03', game: 'constellation-memory' });
      const p3 = await o.invoke('game:progress', { astronautId: 'CM-03', day: 101 });
      let equipped = null;
      if (p3.companion.items.find((i) => i.id === 'star-ball')?.unlocked) {
        const e = await o.invoke('companion:equip', { astronautId: 'CM-03', day: 101, slot: 'toy', itemId: 'star-ball' });
        const pl = await o.invoke('companion:play', { astronautId: 'CM-03', day: 101, toyId: 'star-ball' });
        equipped = { toy: e.companion.equipped.toy, playedXp: pl.xpByKind['companion.played'] ?? 0 };
      }
      return { crew, hiddenXpDelta: after.xp - before.xp, hardGame: history.some((h) => h.difficulty === 'hard' && h.score === 5), playedOk: !!played.progress,
        rooms: p3.habitat.rooms.map((r) => r.name), destinations: p3.exploration.length, history: p3.explorationHistory.length, equipped };
    })()`);
    for (const t of ['today', 'explore', 'habitat', 'games']) {
      await ctx.dashboard.webContents.executeJavaScript(`location.hash = '#/challenges'`);
      await delay(600);
      await ctx.dashboard.webContents.executeJavaScript(`document.querySelector('[role=radio][title=' + ${JSON.stringify(JSON.stringify({ today: 'Today', explore: 'Explore', habitat: 'Habitat & pet', games: 'Games' }[t]))} + ']')?.click()`);
      await delay(600);
      if (t === 'games') await ctx.dashboard.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Constellation Memory ('))?.click()`), await delay(500);
      await capture(ctx.dashboard, `challenges-${t}-${theme}.png`);
    }

    await ctx.dashboard.webContents.executeJavaScript(`location.hash = '#/knowledge/bone'`);
    await delay(700);
    await capture(ctx.dashboard, `knowledge-bone-${theme}.png`);

    await capture(ctx.dashboard, `dashboard-overview-${theme}.png`);
    const orbitalTextSeen: string[] = [];
    for (const section of ['crew', 'physical', 'brain', 'journal', 'telemetry', 'challenges', 'reports', 'knowledge', 'companion', 'settings']) {
      await ctx.dashboard.webContents.executeJavaScript(`location.hash = '#/${section}'`);
      await delay(700);
      if (await ctx.dashboard.webContents.executeJavaScript(`document.body.innerText.includes('ORBITAL')`)) orbitalTextSeen.push(section);
      await capture(ctx.dashboard, `dashboard-${section}-${theme}.png`);
    }
    await capture(ctx.companion, `companion-${theme}.png`);
    // Scrolled views of Phase 2 surfaces.
    const scrollTo = async (section: string, text: string, file: string) => {
      await ctx.dashboard.webContents.executeJavaScript(`location.hash = '#/${section}'`);
      await delay(900);
      await ctx.dashboard.webContents.executeJavaScript(`(() => { const el = [...document.querySelectorAll('h2,p')].find((e) => e.textContent.includes(${JSON.stringify(text)})); el?.scrollIntoView({ block: 'start' }); })()`);
      await delay(500);
      await capture(ctx.dashboard, file);
    };
    await scrollTo('brain', 'Indicators by system and layer', `brain-bodymap-${theme}.png`);
    await scrollTo('brain', 'What needs attention', `brain-alerts-${theme}.png`);
    await scrollTo('crew', 'How you’d like to connect today', `crew-wellbeing-${theme}.png`);
    await scrollTo('knowledge', 'Indicators — and what ORBITAL actually measures', `knowledge-indicators-${theme}.png`);
    await scrollTo('brain', 'How the decision was reached', `brain-intelligence-${theme}.png`);
    await scrollTo('physical', 'Physical trends and deviations', `physical-intelligence-${theme}.png`);
    // Companion chat panel.
    await cw.executeJavaScript(`(() => { const el = document.querySelector('[data-testid=companion]'); const o = { bubbles: true, button: 0, pointerId: 1, screenX: 100, screenY: 100 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); })()`);
    await delay(300);
    await cw.executeJavaScript(`document.querySelector('[data-action=chat]')?.click()`);
    await delay(600);
    await capture(ctx.companion, `companion-chat-${theme}.png`);

    const report = {
      ok: crashes.length === 0,
      theme,
      contractsVersion: ctx.contractsVersion,
      dashboardProbe,
      companionProbe,
      mochiProbe,
      crewProbe,
      knowledgeProbe,
      m1Probe,
      orbitalTextSeen,
      phase4Probe,
      dataLoad: ctx.data.loadReport,
      recordCount: ctx.storage.countRecords(),
      webPreferences,
      companion: {
        bounds: ctx.companion.getBounds(),
        alwaysOnTop: ctx.companion.isAlwaysOnTop(),
        visible: ctx.companion.isVisible(),
      },
      storage: ctx.storage.info(),
      issues,
      crashes,
      shots,
    };
    writeFileSync(join(cfg.outDir, 'report.json'), JSON.stringify(report, null, 2));
  } catch (err) {
    writeFileSync(
      join(cfg.outDir, 'report.json'),
      JSON.stringify({ ok: false, error: String((err as Error)?.stack ?? err), issues, crashes }, null, 2),
    );
  } finally {
    clearTimeout(timeout);
    app.quit();
  }
}
