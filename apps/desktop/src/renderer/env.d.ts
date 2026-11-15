import type { RendererBridge } from '@orbital/contracts';

declare global {
  interface Window {
    /** Dashboard bridge (preload/dashboard.ts). Undefined in the companion window. */
    readonly orbital: RendererBridge;
    /** Companion bridge (preload/companion.ts). Undefined in the dashboard window. */
    readonly orbitalPet: RendererBridge;
  }
}

export {};
