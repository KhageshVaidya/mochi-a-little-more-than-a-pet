// Renders a local HTML page to full-page PNGs with Electron (no browser install needed).
// Usage: npx electron tools/render-page.mjs <html> <outDir>   → <outDir>/{desktop,phone}-{light,dark}.png
import { app, BrowserWindow, nativeTheme } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [html, outDir] = process.argv.slice(-2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true } });
  const url = pathToFileURL(resolve(html)).href;
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme;
    for (const [name, width] of [['desktop', 1440], ['phone', 390]]) {
      win.setContentSize(width, 900);
      for (let i = 0; i < 3; i++) {
        try {
          await win.loadURL(url);
          break;
        } catch {
          await sleep(500);
        }
      }
      await sleep(1800); // fonts + images
      // Lazy images only load once in view: grow the window, wait, and re-measure until the height settles.
      const measure = () => win.webContents.executeJavaScript("document.querySelectorAll('img[loading=lazy]').forEach(i=>i.loading='eager'); Math.min(document.documentElement.scrollHeight, 16000)");
      let h = await measure();
      for (let i = 0; i < 4; i++) { win.setContentSize(width, h); await sleep(900); const n = await measure(); if (n === h) break; h = n; }
      const overflow = await win.webContents.executeJavaScript('document.documentElement.scrollWidth > window.innerWidth + 1');
      win.setContentSize(width, h);
      await sleep(700);
      const img = await win.webContents.capturePage();
      writeFileSync(join(outDir, `${name}-${theme}.png`), img.toPNG());
      console.log(`${name}-${theme}: ${width}×${h}${overflow ? '  ⚠ horizontal overflow' : ''}`);
    }
  }
  app.quit();
});
