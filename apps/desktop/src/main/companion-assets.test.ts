import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => '' }, net: {}, protocol: {} }));
const { companionCatalog, loadCompanionManifest, resolveAssetPath } = await import('./companion-assets');
const { PNG } = await import('pngjs');

const root = resolve(__dirname, '../../../../assets');

describe('companion assets', () => {
  it('Mochi manifest is valid and every referenced asset exists', () => {
    const m = loadCompanionManifest('mochi', root);
    expect(m.displayName).toBe('Mochi');
    expect(m.official).toBe(true);
    expect(m.interactions.menu).toEqual(['chat', 'hello', 'status', 'celebrate', 'sleep', 'wake', 'open-dashboard', 'hide']);
  });

  it('the transparent artwork has an alpha channel, transparent corners and the declared size', () => {
    const m = loadCompanionManifest('mochi', root);
    const png = PNG.sync.read(readFileSync(resolve(root, 'pets/mochi', m.artwork.default)));
    expect([png.width, png.height]).toEqual([m.artwork.width, m.artwork.height]);
    const alpha = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3]!;
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]) expect(alpha(x!, y!)).toBe(0);
    // The body centre is fully opaque.
    expect(alpha(Math.round(png.width * 0.55), Math.round(png.height * 0.7))).toBe(255);
  });

  it('catalog lists four companions, Mochi first and official; placeholders are labelled', () => {
    const c = companionCatalog(root);
    expect(c.map((x) => x.id)).toEqual(['mochi', 'alien', 'cat', 'dog']);
    expect(c[0]).toMatchObject({ id: 'mochi', official: true, placeholder: false });
    for (const x of c.slice(1)) expect(x.placeholder).toBe(true);
  });

  it('every companion: valid manifest, all assets exist, aspect ratio preserved, all states defined', () => {
    for (const id of ['mochi', 'dog', 'cat', 'alien']) {
      const m = loadCompanionManifest(id, root);
      const art = m.artwork.width / m.artwork.height;
      expect(Math.abs(art - m.display.width / m.display.height) / art, id).toBeLessThan(0.03);
      for (const st of ['idle', 'bounce', 'react', 'celebrate', 'sleep', 'wake', 'curious'] as const) expect(m.animations[st], `${id}.${st}`).toBeDefined();
    }
  });

  it('species have their own motion profiles and anatomy-specific part animations', () => {
    const profiles = ['mochi', 'dog', 'cat', 'alien'].map((id) => loadCompanionManifest(id, root).motionProfile);
    expect(new Set(profiles).size).toBe(4);
    const svg = (id: string) => readFileSync(resolve(root, `pets/${id}/idle.svg`), 'utf8');
    expect(svg('dog')).toMatch(/@keyframes wag/);
    expect(svg('cat')).toMatch(/@keyframes curl/);
    expect(svg('alien')).toMatch(/@keyframes hover/);
    for (const id of ['dog', 'cat', 'alien']) expect(svg(id)).toMatch(/class="blink/);
  });

  it('Mochi rig: tail layer and two blink lids over the drawn pupils', () => {
    const m = loadCompanionManifest('mochi', root);
    expect(m.rig.kind).toBe('raster-layered');
    if (m.rig.kind !== 'raster-layered') return;
    expect(m.rig.eyes).toHaveLength(2);
    expect(m.rig.tail?.swish.deg).toBeLessThanOrEqual(2); // tucked tail: small swish only (no gaps/ghosting)
  });

  it('A1: the corrected Mochi artwork has no large enclosed white patch left', () => {
    const png = PNG.sync.read(readFileSync(resolve(root, 'pets/mochi/mochi.png')));
    const { width: W, height: H, data } = png;
    const white = (i: number) => data[i * 4 + 3]! === 255 && Math.min(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) >= 200 && Math.max(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) - Math.min(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) <= 28;
    const seen = new Uint8Array(W * H);
    let largest = 0;
    for (let s = 0; s < W * H; s++) {
      if (seen[s] || !white(s)) continue;
      let n = 0;
      const st = [s];
      seen[s] = 1;
      while (st.length) {
        const i = st.pop()!;
        n++;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && !seen[j] && white(j)) { seen[j] = 1; st.push(j); }
      }
      largest = Math.max(largest, n);
    }
    expect(largest).toBeLessThan(100); // only tiny eye/nose highlights remain
  });

  it('the original reference artwork is preserved byte-for-byte', async () => {
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update(readFileSync(resolve(root, 'pets/mochi/mochi-reference.jpg'))).digest('hex');
    expect(sha).toBe('d523015ad0d306d3fe61e6da40d3fc65959041484a32d99c935eb1b9de196caa');
  });

  it('companion messages are supportive: no guilt, sadness or diagnosis', () => {
    const m = loadCompanionManifest('mochi', root);
    const all = Object.values(m.personality.messages).flat().join(' ').toLowerCase();
    for (const banned of ['should have', 'failed', 'lazy', 'missed', 'disappoint', 'sad', 'guilt', 'shame', 'depress', 'diagnos', 'you must', 'why didn']) {
      expect(all).not.toContain(banned);
    }
    expect(m.personality.messages.rest.length).toBeGreaterThan(0); // rest is celebrated too
  });

  it('the asset protocol refuses traversal, non-image files and other schemes', () => {
    expect(resolveAssetPath(root, 'orbital-asset://pets/mochi/mochi.png')).toMatch(/mochi\.png$/);
    expect(resolveAssetPath(root, 'orbital-asset://pets/mochi/../../package.json')).toBeNull();
    expect(resolveAssetPath(root, 'orbital-asset://pets/mochi/%2e%2e/%2e%2e/%2e%2e/package.json')).toBeNull();
    expect(resolveAssetPath(root, 'orbital-asset://pets/mochi/manifest.json')).toBeNull(); // JSON goes via validated IPC only
    expect(resolveAssetPath(root, 'file:///etc/passwd')).toBeNull();
    expect(resolveAssetPath(root, 'orbital-asset://pets/mochi/nope.png')).toBeNull();
  });

  it('every phrasebank line renders grammatically with every companion voice', async () => {
    const { LINES, render } = await import('@orbital/companion');
    for (const id of ['mochi', 'dog', 'cat', 'alien']) {
      const m = loadCompanionManifest(id, root);
      const voice = { name: m.displayName, ...m.personality.voice };
      for (const [cat, lines] of Object.entries(LINES)) {
        lines.forEach((_, i) => {
          const text = render(cat as keyof typeof LINES, i, { name: 'Sofia', timeOfDay: 'evening', game: 'Signal Catch', achievement: 'Sharp mind', memory: 'chess' }, voice);
          expect(text, `${id}/${cat}/${i}`).not.toMatch(/\bI (does|wags|makes|slow-blinks|is)\b|\{[a-zA-Z]+\}/);
        });
      }
    }
  });

  it('rejects invalid companion ids', () => {
    expect(() => loadCompanionManifest('../etc', root)).toThrow();
  });
});
