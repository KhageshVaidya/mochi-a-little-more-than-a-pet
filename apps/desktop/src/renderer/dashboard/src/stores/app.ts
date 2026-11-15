import { create } from 'zustand';
import type { AstronautProfile, MissionState, Prefs, PrefsPatch, SystemInfo, MissionCommand } from '@orbital/contracts';

export const SECTIONS = [
  'overview',
  'crew',
  'physical',
  'brain',
  'journal',
  'telemetry',
  'challenges',
  'reports',
  'knowledge',
  'companion',
  'settings',
  'setup',
] as const;
export type SectionId = (typeof SECTIONS)[number];

function sectionFromHash(): SectionId {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[0] ?? '';
  return (SECTIONS as readonly string[]).includes(id) ? (id as SectionId) : 'overview';
}

function focusFromHash(): string | null {
  const [section, risk] = window.location.hash.replace(/^#\/?/, '').split('/');
  return section === 'knowledge' && risk ? risk : null;
}

interface AppState {
  section: SectionId;
  mission: MissionState | null;
  prefs: Prefs | null;
  system: SystemInfo | null;
  crew: AstronautProfile[];
  navigate(section: SectionId): void;
  /** NASA risk selected in the Knowledge section (deep link from alerts: #/knowledge/<riskId>). */
  knowledgeFocus: string | null;
  openRisk(riskId: string): void;
  missionCommand(cmd: MissionCommand): Promise<void>;
  setPrefs(patch: PrefsPatch): Promise<void>;
}

/**
 * Renderer view-state. Shared state (mission, prefs) is owned by the main process;
 * this store only mirrors it and forwards commands.
 */
export const useApp = create<AppState>((set) => ({
  section: sectionFromHash(),
  knowledgeFocus: focusFromHash(),
  mission: null,
  prefs: null,
  system: null,
  crew: [],
  navigate(section) {
    if (window.location.hash !== `#/${section}`) window.location.hash = `#/${section}`;
    set({ section });
  },
  openRisk(riskId) {
    window.location.hash = `#/knowledge/${riskId}`;
    set({ section: 'knowledge', knowledgeFocus: riskId });
  },
  async missionCommand(cmd) {
    set({ mission: await window.orbital.invoke('mission:command', cmd) });
  },
  async setPrefs(patch) {
    set({ prefs: await window.orbital.invoke('prefs:set', patch) });
  },
}));

/** Wire the store to main. Call once at startup. */
export async function connectStore(): Promise<void> {
  const o = window.orbital;
  window.addEventListener('hashchange', () => useApp.setState({ section: sectionFromHash(), ...(focusFromHash() ? { knowledgeFocus: focusFromHash() } : {}) }));
  o.on('mission:state', (mission) => useApp.setState({ mission }));
  o.on('prefs:changed', (prefs) => useApp.setState({ prefs }));
  // Mochi can open Dr G Zero at a section ("show me my health").
  o.on('dashboard:navigate', ({ section }) => {
    if ((SECTIONS as readonly string[]).includes(section)) useApp.getState().navigate(section as SectionId);
  });
  const [mission, prefs, system, crew] = await Promise.all([
    o.invoke('mission:get'),
    o.invoke('prefs:get'),
    o.invoke('system:info'),
    o.invoke('crew:list'),
  ]);
  useApp.setState({ mission, prefs, system, crew });
}

/** The currently selected crew member's profile. */
export function useAstronaut(): AstronautProfile | null {
  return useApp((s) => s.crew.find((c) => c.id === s.mission?.astronautId) ?? null);
}
