import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// npm workspace scripts run with cwd = apps/desktop.
const r = (p: string) => resolve(process.cwd(), p);

/** Workspace packages ship TypeScript source, so they must be bundled, not externalized. */
const WORKSPACE_PACKAGES = ['@orbital/contracts', '@orbital/signals', '@orbital/simulation', '@orbital/engine', '@orbital/gamification', '@orbital/companion', '@orbital/data-sources', '@orbital/recommendations'];

/** Strict CSP injected into each renderer's index.html. Dev adds only what Vite HMR needs. */
function cspPlugin(): Plugin {
  const policy = (dev: boolean) =>
    [
      "default-src 'self'",
      dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: orbital-asset:",
      "font-src 'self'",
      dev ? "connect-src 'self' ws://localhost:* http://localhost:*" : "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
  return {
    name: 'orbital-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => html.replace('%ORBITAL_CSP%', policy(Boolean(ctx.server))),
    },
  };
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: WORKSPACE_PACKAGES },
      rolldownOptions: { input: { index: r('src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads cannot require() node_modules or shared chunks: bundle each entry standalone as CJS.
      externalizeDeps: false,
      isolatedEntries: true,
      rolldownOptions: {
        input: { dashboard: r('src/preload/dashboard.ts'), companion: r('src/preload/companion.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: r('src/renderer'),
    plugins: [react(), tailwindcss(), cspPlugin()],
    build: {
      rolldownOptions: {
        input: {
          dashboard: r('src/renderer/dashboard/index.html'),
          companion: r('src/renderer/companion/index.html'),
        },
      },
    },
  },
});
