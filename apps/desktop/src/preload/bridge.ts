import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { channelsFor, type RendererBridge, type WindowRole } from '@orbital/contracts';

/**
 * Builds the minimal, allow-listed bridge for one window role.
 * Raw ipcRenderer is never exposed; channels outside the role's allowlist are rejected here
 * AND again in main (defence in depth).
 */
export function exposeBridge(role: WindowRole, globalName: 'orbital' | 'orbitalPet'): void {
  const { invoke, events } = channelsFor(role);
  const allowedInvoke = new Set<string>(invoke);
  const allowedEvents = new Set<string>(events);

  const bridge: RendererBridge = {
    platform: process.platform,
    invoke: ((channel: string, payload?: unknown) => {
      if (!allowedInvoke.has(channel)) return Promise.reject(new Error(`Channel not allowed: ${channel}`));
      return ipcRenderer.invoke(channel, payload);
    }) as RendererBridge['invoke'],
    on: ((channel: string, listener: (payload: unknown) => void) => {
      if (!allowedEvents.has(channel)) throw new Error(`Event not allowed: ${channel}`);
      const wrapped = (_e: IpcRendererEvent, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    }) as RendererBridge['on'],
  };

  contextBridge.exposeInMainWorld(globalName, Object.freeze(bridge));
}
