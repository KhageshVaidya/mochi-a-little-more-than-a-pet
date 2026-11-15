# Companion character packages

Each folder is one companion: `manifest.json` (validated by `CompanionManifest` in `packages/contracts/src/companion.ts`) plus its artwork.

| Companion | Artwork | Status |
|---|---|---|
| `mochi` | Team-supplied illustration. `mochi-reference.jpg` is the untouched original. `mochi.png` is the transparent, corrected cutout (`npm run artwork:cutout`). `mochi-body.png` and `mochi-tail.png` are the animation layers (`tools/companion-rig.mjs`). | **Official, default** |
| `dog`, `cat`, `alien` | Vector **placeholders** built by `tools/build-placeholder-companions.mjs` (separate parts with species-specific motion) | Placeholder: replace with team artwork |

## Replacing placeholder artwork
1. Drop new files into the folder. Either use SVGs per state (`idle.svg`, `sleep.svg`, `happy.svg`), or a PNG with a `raster-layered` rig like Mochi's.
2. Update `manifest.json` (file names, `artwork.width/height`, `display` box with the same aspect ratio, `placeholder: false`).
3. Run `npm test`: the manifest, asset existence and aspect-ratio checks run automatically. No code changes are needed.
