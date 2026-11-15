import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { app, BrowserWindow, Menu, nativeImage, nativeTheme, screen, Tray, type MenuItemConstructorOptions } from 'electron';
import { CONTRACTS_VERSION, DEFAULT_COMPANION, MISSION_MILESTONES, type AstronautId, type CompanionManifest } from '@orbital/contracts';
import { assetsRoot, companionCatalog, handleAssetProtocol, loadCompanionManifest, registerAssetScheme } from './companion-assets';
import { Storage } from './storage';
import { PrefsService } from './prefs';
import { MissionClock } from './mission-clock';
import { DataService } from './data-service';
import { GameService } from './game-service';
import { ConversationService } from './conversation-service';
import { CrewService, setCrewNameResolver } from './crew-service';
import { IntelligenceService } from './intelligence-service';
import { AiService } from './ai-service';
import { applyIdentity, DEFAULT_COMPANION_BY_PROFILE, loadLocalIdentities } from './identities';
import { writeFileSync } from 'node:fs';
import { dialog, shell } from 'electron';
import { allowedSourceUrl, hrpKnowledge } from './knowledge';
import { GOAL_OPTIONS } from '@orbital/gamification';
import { IpcRouter } from './ipc';
import { applySecurityPolicy } from './security';
import {
  clampToWorkArea,
  companionDisplayKey,
  createCompanionWindow,
  createDashboardWindow,
  moveCompanionBy,
  themeBackground,
} from './windows';
import { runSmoke, smokeConfig } from './smoke';
import { runReview } from './review';
import { runDemo } from './demo';
import { runCapture } from './capture';

/**
 * Mochi main process (integration module). Mochi (the desktop companion) is the primary experience;
 * Dr G Zero (dashboard + intelligence) opens on request. Owns shared state and all windows; renderers are views.
 */

// Rebrand without moving existing user data: the data folder keeps its pre-rename location (migration later).
const legacyUserData = app.getPath('userData');
app.setName('Mochi');
app.setPath('userData', legacyUserData);

const smoke = smokeConfig();
if (smoke) {
  // Isolated profile so smoke runs never touch real user data.
  mkdirSync(smoke.userData, { recursive: true });
  app.setPath('userData', smoke.userData);
}

if (!app.requestSingleInstanceLock()) app.quit();
registerAssetScheme();

let dashboard: BrowserWindow | undefined;
let companion: BrowserWindow | undefined;
let tray: Tray | undefined; // kept referenced so it isn't garbage-collected

async function bootstrap(): Promise<void> {
  applySecurityPolicy();
  handleAssetProtocol();

  const storage = new Storage(join(app.getPath('userData'), 'orbital.sqlite'));
  const prefs = new PrefsService(storage);
  if (smoke?.theme) prefs.set({ theme: smoke.theme });
  // Smoke/review runs are deterministic: no live model (the real model is covered by apps/desktop/src/main/mochi-live-ollama.test.ts).
  if (smoke && process.env['MOCHI_SMOKE_AI'] !== 'ollama') prefs.set({ ai: { provider: 'off' } });
  const clock = new MissionClock(storage);
  const data = new DataService(storage);
  // Private local demo identities (git-ignored file; never in smoke runs or packaged builds).
  const identities = loadLocalIdentities(app.getAppPath(), (!smoke || process.env['MOCHI_DEMO_IDENTITIES'] === '1') && !app.isPackaged);
  data.setProfileOverlay((p) => applyIdentity(p, identities));
  setCrewNameResolver((id) => data.profiles().find((p) => p.id === id)?.name ?? id);
  data.init();
  const game = new GameService(storage, data, (e) => ipc.send('companion:event', e));
  // Phase 4: intelligence → decision → recommendations → missions. The ML model trains lazily (deterministic).
  const intel = new IntelligenceService(data, storage);
  data.onInvalidate((id) => intel.invalidate(id));
  game.setRecommendationSource({ recommendations: (id, day) => intel.recommendations(id, day), offeredAll: (id) => intel.offeredAll(id) });
  const manifests = new Map<string, CompanionManifest>();
  /** Each astronaut has their own companion: explicit choice → private identity → profile default → global. */
  const companionIdFor = (astronautId: AstronautId): string =>
    prefs.get().pet.companionByProfile[astronautId] ?? identities[astronautId]?.companion ?? DEFAULT_COMPANION_BY_PROFILE[astronautId] ?? prefs.get().pet.companionId;
  const companionManifest = (): CompanionManifest => {
    const id = companionIdFor(clock.get().astronautId);
    let m = manifests.get(id);
    if (!m) {
      try {
        m = loadCompanionManifest(id);
      } catch (err) {
        console.error('[orbital] companion manifest invalid, falling back to default', err);
        m = loadCompanionManifest(DEFAULT_COMPANION);
      }
      manifests.set(id, m);
    }
    return m;
  };
  const ipc = new IpcRouter();

  // Theme: driving nativeTheme makes `prefers-color-scheme` follow the preference in every window,
  // and it is applied before first paint, so there is no flash.
  nativeTheme.themeSource = prefs.get().theme;
  nativeTheme.on('updated', () => dashboard?.setBackgroundColor(themeBackground()));

  // ── IPC handlers ───────────────────────────────────────────────────────────
  ipc.handle('system:info', () => ({
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    storage: storage.info(),
  }));
  ipc.handle('prefs:get', () => prefs.get());
  ipc.handle('prefs:set', (patch) => prefs.set(patch));
  ipc.handle('mission:get', () => clock.get());
  ipc.handle('mission:command', (cmd) => clock.command(cmd));
  ipc.handle('crew:list', () => data.profiles());
  ipc.handle('crew:summary', ({ day }) => data.crewSummary(day));
  ipc.handle('data:snapshot', ({ astronautId, day }) => data.snapshot(astronautId, day));
  ipc.handle('data:series', ({ astronautId, signalIds, fromDay, toDay }) => data.series(astronautId, signalIds, fromDay, toDay));
  ipc.handle('brain:assess', ({ astronautId, day }) => data.assess(astronautId, day));
  ipc.handle('brain:timeline', ({ astronautId }) => data.timeline(astronautId));
  ipc.handle('telemetry:day', ({ astronautId, day }) => data.telemetry(astronautId, day));
  // Conversational AI: local Ollama by default (health-checked, streaming); Anthropic optional and off by default.
  const ai = new AiService(() => prefs.get().ai, (status) => ipc.send('ai:status', status));
  // First run: if the local model isn't ready, open the setup guide (once). Never downloads anything by itself.
  void ai.check().then((s) => {
    if (smoke || prefs.get().onboarding.completed) return;
    if (s.state === 'ready') prefs.set({ onboarding: { completed: true } });
    else if (s.provider === 'ollama') setTimeout(() => openDashboardAt('setup'), 1500);
  });
  const convo = new ConversationService(storage, data, game, {
    suggestions: (id, day) => intel.recommendations(id, day).recommendations.map((r) => r.title),
    prefs: () => prefs.get(),
    selection: () => ({ astronautId: clock.get().astronautId, day: clock.get().day }),
    manifest: () => companionManifest(),
    emit: (e) => ipc.send('companion:event', e),
    ai: () => ai,
    stream: (turnId, text, done) => ipc.send('chat:stream', { turnId, text, done }),
    openDashboard: (section) => openDashboardAt(section),
  });
  const crew = new CrewService(storage, game);
  ipc.handle('crew:board', ({ astronautId, day }) => crew.board(astronautId, day));
  ipc.handle('crew:status:set', ({ astronautId, day, status, audience, audiencePersonId }) => crew.setStatus(astronautId, day, status, audience, audiencePersonId));
  ipc.handle('crew:activity:propose', ({ astronautId, day, kind, invitees }) => crew.propose(astronautId, day, kind, invitees));
  ipc.handle('crew:activity:respond', ({ astronautId, day, activityId, accept }) => crew.respond(astronautId, day, activityId, accept));
  ipc.handle('companion:chat', (req) => convo.chat(req));
  ipc.handle('journal:list', ({ astronautId }) => convo.journal(astronautId));
  ipc.handle('journal:save', (entry) => convo.saveJournal(entry));
  ipc.handle('journal:delete', ({ astronautId, id }) => convo.deleteJournal(astronautId, id));
  ipc.handle('journal:export', async ({ astronautId, format }) => {
    const res = await dialog.showSaveDialog({ defaultPath: `mochi-journal-${astronautId}.${format === 'json' ? 'json' : 'md'}` });
    if (res.canceled || !res.filePath) return { saved: false };
    writeFileSync(res.filePath, convo.exportJournal(astronautId, format), 'utf8');
    return { saved: true, path: res.filePath };
  });
  ipc.handle('memory:list', ({ astronautId }) => convo.memory(astronautId));
  ipc.handle('memory:save', ({ astronautId, id, kind, text }) => convo.saveMemory({ id: id ?? `m:${astronautId}:${Date.now()}`, subjectId: astronautId, kind, text }));
  ipc.handle('memory:delete', ({ astronautId, id }) => convo.deleteMemory(astronautId, id));
  ipc.handle('ai:status', () => ai.status());
  ipc.handle('ai:pull', ({ model }) => ai.pull(model, (pr) => ipc.send('ai:pull-progress', { model, ...pr })));
  ipc.handle('ai:verify', async () => {
    const r = await ai.verify();
    if (r.ok) prefs.set({ onboarding: { completed: true } });
    return r;
  });
  ipc.handle('app:openOllamaDownload', async () => {
    if (!smoke) await shell.openExternal('https://ollama.com/download');
  });
  ipc.handle('ai:check', () => ai.check());
  ipc.handle('journal:create', ({ astronautId, day, text, feelings }) => convo.createJournal(astronautId, day, text, feelings));
  ipc.handle('companion:openChat', () => {
    if (!prefs.get().pet.visible) prefs.set({ pet: { visible: true } });
    if (!companion || companion.isDestroyed()) companion = openCompanion();
    companion.showInactive();
    ipc.send('companion:open-chat', undefined);
  });
  ipc.handle('app:openDashboard', ({ section }) => openDashboardAt(section ?? 'overview'));
  ipc.handle('alerts:list', ({ astronautId, day }) => convo.alerts(astronautId, day));
  ipc.handle('alerts:ack', ({ astronautId, day, alertId }) => convo.acknowledge(astronautId, day, alertId));
  ipc.handle('alerts:share', ({ astronautId, day, alertId, share }) => convo.recordShareDecision(astronautId, day, alertId, share));
  ipc.handle('alerts:audit', ({ astronautId }) => convo.audit(astronautId));
  ipc.handle('knowledge:hrp', () => hrpKnowledge());
  ipc.handle('knowledge:open-source', async ({ sourceId }) => {
    const url = allowedSourceUrl(sourceId); // allow-list: registry sources only
    if (!url) return { opened: false };
    if (!smoke) await shell.openExternal(url);
    return { opened: true };
  });
  ipc.handle('intelligence:report', ({ astronautId, day }) => intel.report(astronautId, day));
  ipc.handle('recommendations:list', ({ astronautId, day }) => intel.recommendations(astronautId, day));
  ipc.handle('restrictions:get', ({ astronautId }) => intel.restrictions(astronautId));
  ipc.handle('restrictions:set', ({ astronautId, restrictions }) => intel.setRestrictions(astronautId, restrictions));
  ipc.handle('game:history', ({ astronautId, game: g }) => game.history(astronautId, g));
  ipc.handle('companion:equip', ({ astronautId, day, slot, itemId }) => game.equip(astronautId, day, slot, itemId));
  ipc.handle('companion:play', ({ astronautId, day, toyId }) => game.playToy(astronautId, day, toyId));
  ipc.handle('brain:patterns', ({ astronautId, day }) => data.patterns(astronautId, day));
  ipc.handle('game:progress', ({ astronautId, day }) => game.progress(astronautId, day));
  ipc.handle('game:log', (req) => game.log(req));
  ipc.handle('game:play', (r) => game.play(r));
  ipc.handle('game:habitat:place', ({ astronautId, day, roomId, slot, decorationId }) => game.placeDecoration(astronautId, day, roomId, slot, decorationId));
  ipc.handle('game:goals:set', ({ astronautId, day, goalIds }) => game.setGoals(astronautId, day, goalIds));
  ipc.handle('game:goal-options', () => GOAL_OPTIONS.map(({ id, title, target }) => ({ id, title, target })));
  ipc.handle('companion:catalog', () => companionCatalog());
  ipc.handle('companion:manifest', () => companionManifest());
  ipc.handle('companion:emit', (event) => ipc.send('companion:event', event));
  ipc.handle('companion:setVisible', (visible) => prefs.set({ pet: { visible } }).pet.visible);
  ipc.handle('companion:move', ({ dx, dy }) => {
    if (companion) moveCompanionBy(companion, dx, dy);
  });
  ipc.handle('companion:dragEnd', () => {
    if (!companion) return;
    const { x, y } = companion.getBounds();
    const positions = { ...prefs.get().pet.positions, [companionDisplayKey(companion)]: { x, y } };
    prefs.set({ pet: { positions } });
  });
  ipc.handle('companion:setInteractive', (interactive) => {
    // Enforced here, not only in the UI: with interactions disabled the companion stays click-through.
    const allowed = interactive && prefs.get().pet.interactionsEnabled;
    companion?.setIgnoreMouseEvents(!allowed, { forward: true });
  });
  ipc.handle('app:focusDashboard', () => openDashboardAt());

  let [aiProvider, aiModel, aiFallback, aiBase] = [prefs.get().ai.provider, prefs.get().ai.ollama.model, prefs.get().ai.ollama.fallbackModel, prefs.get().ai.ollama.baseUrl];

  // ── State fan-out ──────────────────────────────────────────────────────────
  let lastDay = clock.get().day;
  clock.on('changed', (state) => {
    ipc.send('mission:state', state);
    // Milestones are celebrated only when the mission actually advances into them (not while scrubbing).
    if (state.playing && state.day === lastDay + 1 && (MISSION_MILESTONES as readonly number[]).includes(state.day)) {
      ipc.send('companion:event', { type: 'milestone.reached', day: state.day });
    }
    lastDay = state.day;
  });
  let lastAstronaut = clock.get().astronautId;
  clock.on('changed', (state) => {
    if (state.astronautId !== lastAstronaut) ipc.send('prefs:changed', prefs.get()); // companion reloads its manifest
    lastAstronaut = state.astronautId;
  });
  prefs.on('changed', (p) => {
    if (p.ai.provider !== aiProvider || p.ai.ollama.model !== aiModel || p.ai.ollama.fallbackModel !== aiFallback || p.ai.ollama.baseUrl !== aiBase) {
      [aiProvider, aiModel, aiFallback, aiBase] = [p.ai.provider, p.ai.ollama.model, p.ai.ollama.fallbackModel, p.ai.ollama.baseUrl];
      void ai.check();
    }
    nativeTheme.themeSource = p.theme;
    ipc.send('prefs:changed', p);
    applyCompanionPrefs(p.pet);
    if (!p.pet.interactionsEnabled) companion?.setIgnoreMouseEvents(true, { forward: true });
    buildMenu();
  });

  // ── Windows ───────────────────────────────────────────────────────────────
  const openDashboard = (show = false): BrowserWindow => {
    const win = createDashboardWindow({ show: show && !smoke });
    ipc.attach(win.webContents, 'dashboard');
    return win;
  };
  /** Open Dr G Zero (the dashboard), optionally at a section — on request from Mochi, the tray or the dock. */
  function openDashboardAt(section?: string): void {
    const fresh = !dashboard || dashboard.isDestroyed();
    if (fresh) dashboard = openDashboard(true);
    const win = dashboard!;
    const go = () => section && ipc.send('dashboard:navigate', { section });
    if (fresh) win.webContents.once('did-finish-load', go);
    else go();
    if (!smoke) {
      win.show();
      win.focus();
    }
  }
  const openCompanion = (): BrowserWindow => {
    const win = createCompanionWindow(prefs.get().pet, { show: !smoke });
    ipc.attach(win.webContents, 'companion');
    win.on('closed', () => (companion = undefined));
    return win;
  };

  function applyCompanionPrefs(pet: ReturnType<typeof prefs.get>['pet']): void {
    if (!companion || companion.isDestroyed()) {
      if (pet.visible) companion = openCompanion();
      return;
    }
    companion.setAlwaysOnTop(pet.alwaysOnTop, 'floating');
    if (pet.visible && !companion.isVisible()) companion.showInactive();
    if (!pet.visible && companion.isVisible()) companion.hide();
  }

  function buildMenu(): void {
    const pet = prefs.get().pet;
    const template: MenuItemConstructorOptions[] = [
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Show Companion',
            type: 'checkbox',
            checked: pet.visible,
            accelerator: 'CmdOrCtrl+Shift+P',
            click: (item) => prefs.set({ pet: { visible: item.checked } }),
          },
          {
            label: 'Companion Always on Top',
            type: 'checkbox',
            checked: pet.alwaysOnTop,
            click: (item) => prefs.set({ pet: { alwaysOnTop: item.checked } }),
          },
          { type: 'separator' },
          ...(app.isPackaged ? [] : [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }]),
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  buildMenu();
  // Desktop-first: Mochi appears; Dr G Zero opens only when asked (smoke/review runs pre-create it hidden).
  if (smoke) dashboard = openDashboard();
  if (prefs.get().pet.visible || smoke) companion = openCompanion();
  tray = createTray();

  // Keep the companion on-screen when displays change.
  const reclamp = () => {
    if (!companion || companion.isDestroyed()) return;
    const b = companion.getBounds();
    const p = clampToWorkArea(b, screen.getDisplayMatching(b).workArea);
    companion.setPosition(p.x, p.y);
  };
  screen.on('display-removed', reclamp);
  screen.on('display-metrics-changed', reclamp);

  function createTray(): Tray | undefined {
    if (smoke) return undefined;
    try {
      const icon = nativeImage.createFromPath(join(assetsRoot(), 'pets', 'mochi', 'mochi.png')).resize({ height: 18 });
      const t = new Tray(icon);
      t.setToolTip('Mochi — A Little More Than a Pet');
      const menu = () =>
        Menu.buildFromTemplate([
          { label: 'Chat with Mochi', click: () => openChatFromTray() },
          { label: prefs.get().pet.visible ? 'Hide Mochi' : 'Show Mochi', click: () => prefs.set({ pet: { visible: !prefs.get().pet.visible } }) },
          { label: 'Open Dr G Zero', click: () => openDashboardAt('overview') },
          { type: 'separator' },
          { label: 'Quit Mochi', role: 'quit' },
        ]);
      t.setContextMenu(menu());
      prefs.on('changed', () => t.setContextMenu(menu()));
      return t;
    } catch (e) {
      console.warn('[mochi] tray unavailable:', (e as Error).message);
      return undefined;
    }
  }
  function openChatFromTray(): void {
    if (!prefs.get().pet.visible) prefs.set({ pet: { visible: true } });
    if (!companion || companion.isDestroyed()) companion = openCompanion();
    companion.showInactive();
    ipc.send('companion:open-chat', undefined);
  }

  app.on('activate', () => openDashboardAt());
  app.on('before-quit', () => {
    ai.dispose();
    clock.dispose();
    storage.close();
  });

  if (smoke && process.env['ORBITAL_REVIEW'] === 'capture') await runCapture(smoke, { dashboard: dashboard!, companion: companion! });
  else if (smoke && process.env['ORBITAL_REVIEW'] === 'demo') await runDemo(smoke, { dashboard: dashboard!, companion: companion! });
  else if (smoke && process.env['ORBITAL_REVIEW'] === '1') await runReview(smoke, { dashboard: dashboard!, companion: companion! });
  else if (smoke) await runSmoke(smoke, { dashboard: dashboard!, companion: companion!, storage, data, contractsVersion: CONTRACTS_VERSION });
}

app.on('second-instance', () => {
  companion?.showInactive();
});

// The companion is a satellite of the app: closing the dashboard on macOS keeps the app alive (standard behaviour).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void app.whenReady().then(bootstrap).catch((err) => {
  console.error('[orbital] fatal bootstrap error', err);
  app.exit(1);
});
