import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol } from 'electron';
import { CompanionManifest, type CompanionCatalogEntry } from '@orbital/contracts';

/**
 * Companion character packages: assets/pets/<id>/{manifest.json, artwork}.
 * Served to renderers through a read-only, allow-listed custom protocol (orbital-asset://),
 * so renderers never get file:// access.
 */

export const ASSET_SCHEME = 'orbital-asset';
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);

/** Must run before `app.whenReady()`. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } }]);
}

export function assetsRoot(): string {
  // Dev: <repo>/assets (app path is apps/desktop). Packaged: <Resources>/assets (electron-builder extraResources).
  return app.isPackaged ? join(process.resourcesPath, 'assets') : resolve(app.getAppPath(), '../../assets');
}

/**
 * Resolves an orbital-asset URL to a file inside the assets root, or null if it is outside the root,
 * not an allowed image type, or missing. Exported for tests.
 */
export function resolveAssetPath(root: string, url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${ASSET_SCHEME}:`) return null;
  const rel = decodeURIComponent(`${u.hostname}${u.pathname}`);
  if (rel.includes('\0')) return null;
  const target = normalize(join(root, rel));
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  if (!target.startsWith(base)) return null;
  if (!ALLOWED_EXT.has(extname(target).toLowerCase())) return null;
  if (!existsSync(target)) return null;
  // Reject symlinks that escape the root.
  const real = realpathSync(target);
  if (!real.startsWith(realpathSync(root) + sep)) return null;
  return real;
}

export function handleAssetProtocol(): void {
  const root = assetsRoot();
  protocol.handle(ASSET_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const file = resolveAssetPath(root, request.url);
    if (!file) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/** Loads and validates a companion manifest; also checks that every referenced image exists. */
export function loadCompanionManifest(id: string, root = assetsRoot()): CompanionManifest {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid companion id ${id}`);
  const dir = join(root, 'pets', id);
  const manifest = CompanionManifest.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')));
  if (manifest.id !== id) throw new Error(`Manifest id ${manifest.id} does not match folder ${id}`);
  const images = new Set<string>([manifest.artwork.default, manifest.artwork.reference]);
  if (manifest.rig.kind === 'raster-layered') {
    images.add(manifest.rig.body);
    if (manifest.rig.tail) images.add(manifest.rig.tail.image);
  }
  for (const a of Object.values(manifest.animations)) {
    if (!a) continue;
    if (a.kind === 'still') images.add(a.image);
    else a.frames.forEach((f) => images.add(f));
  }
  for (const img of images) {
    if (!resolveAssetPath(root, `${ASSET_SCHEME}://pets/${id}/${img}`)) throw new Error(`Companion ${id}: missing or disallowed asset ${img}`);
  }
  return manifest;
}

/** All installed companions with a valid manifest (invalid packages are skipped and logged). */
export function companionCatalog(root = assetsRoot()): CompanionCatalogEntry[] {
  const dir = join(root, 'pets');
  const out: CompanionCatalogEntry[] = [];
  for (const id of readdirSync(dir).filter((n) => /^[a-z0-9-]+$/.test(n)).sort()) {
    try {
      const m = loadCompanionManifest(id, root);
      out.push({ id: m.id, displayName: m.displayName, species: m.species, official: m.official, placeholder: m.placeholder, preview: m.artwork.default, traits: m.personality.traits });
    } catch (err) {
      console.warn(`[orbital] skipping companion package "${id}":`, (err as Error).message);
    }
  }
  // Official companions first (Mochi is the default).
  return out.sort((a, b) => Number(b.official) - Number(a.official));
}
