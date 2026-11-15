import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, nativeTheme, screen, type Rectangle } from 'electron';
import type { PetPrefs } from '@orbital/contracts';

const here = fileURLToPath(new URL('.', import.meta.url));
const PRELOAD_DIR = join(here, '../preload');
const RENDERER_DIR = join(here, '../renderer');

export const BACKGROUND = { light: '#F6F6F3', dark: '#15171A' } as const;
/** Transparent overlay: the bottom holds Mochi; the space above is for speech bubbles and menus (click-through when empty). */
export const COMPANION_SIZE = { width: 320, height: 460 } as const;
const COMPANION_MARGIN = 24;

/** Shared hardened webPreferences. Never relax these per-window. */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const;

function securePrefs(preload: string): Electron.WebPreferences {
  return {
    ...SECURE_WEB_PREFERENCES,
    preload: join(PRELOAD_DIR, preload),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    spellcheck: false,
    navigateOnDragDrop: false,
  };
}

function loadRenderer(win: BrowserWindow, entry: 'dashboard' | 'companion'): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  return devUrl ? win.loadURL(`${devUrl}/${entry}/index.html`) : win.loadFile(join(RENDERER_DIR, entry, 'index.html'));
}

export function themeBackground(): string {
  return nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light;
}

export function createDashboardWindow(opts: { show: boolean }): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'ORBITAL',
    backgroundColor: themeBackground(),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 20, y: 20 } : undefined,
    webPreferences: securePrefs('dashboard.cjs'),
  });
  if (opts.show) win.once('ready-to-show', () => win.show());
  void loadRenderer(win, 'dashboard');
  return win;
}

/**
 * The desktop companion: an independent, transparent, frameless overlay.
 * Transparent pixels are click-through (setIgnoreMouseEvents with forwarding); the renderer
 * turns interactivity on only while the pointer is over the pet or its menu.
 */
export function createCompanionWindow(pet: PetPrefs, opts: { show: boolean }): BrowserWindow {
  const pos = restoreCompanionPosition(pet);
  const win = new BrowserWindow({
    ...COMPANION_SIZE,
    ...pos,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false, // moved programmatically via companion:move so clicks still register
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: pet.alwaysOnTop,
    title: 'ORBITAL Companion',
    webPreferences: securePrefs('companion.cjs'),
  });
  // 'floating' sits above normal windows but below system notifications and alerts.
  if (pet.alwaysOnTop) win.setAlwaysOnTop(true, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  if (opts.show && pet.visible) win.once('ready-to-show', () => win.showInactive());
  void loadRenderer(win, 'companion');
  return win;
}

/** Last saved position for the display it was on, clamped; otherwise bottom-right of the primary work area. */
export function restoreCompanionPosition(pet: PetPrefs): { x: number; y: number } {
  for (const display of screen.getAllDisplays()) {
    const saved = pet.positions[String(display.id)];
    if (saved) return clampToWorkArea(saved, display.workArea);
  }
  const wa = screen.getPrimaryDisplay().workArea;
  return {
    x: wa.x + wa.width - COMPANION_SIZE.width - COMPANION_MARGIN,
    y: wa.y + wa.height - COMPANION_SIZE.height - COMPANION_MARGIN,
  };
}

export function clampToWorkArea(p: { x: number; y: number }, wa: Rectangle): { x: number; y: number } {
  return {
    x: Math.round(Math.min(Math.max(p.x, wa.x), wa.x + wa.width - COMPANION_SIZE.width)),
    y: Math.round(Math.min(Math.max(p.y, wa.y), wa.y + wa.height - COMPANION_SIZE.height)),
  };
}

export function moveCompanionBy(win: BrowserWindow, dx: number, dy: number): void {
  const b = win.getBounds();
  const target = { x: b.x + dx, y: b.y + dy };
  const display = screen.getDisplayNearestPoint({
    x: target.x + COMPANION_SIZE.width / 2,
    y: target.y + COMPANION_SIZE.height / 2,
  });
  const p = clampToWorkArea(target, display.workArea);
  win.setBounds({ ...p, ...COMPANION_SIZE });
}

export function companionDisplayKey(win: BrowserWindow): string {
  return String(screen.getDisplayMatching(win.getBounds()).id);
}
