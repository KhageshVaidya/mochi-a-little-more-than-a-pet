# Releasing Mochi

Repository: <https://github.com/KhageshVaidya/mochi-a-little-more-than-a-pet> · Website: <https://khageshvaidya.github.io/mochi-a-little-more-than-a-pet/>

Installers are built by electron-builder (`apps/desktop/electron-builder.yml`) on native runners in GitHub Actions (`.github/workflows/release.yml`): macOS Apple Silicon (`macos-15`), macOS Intel (`macos-15-intel`) and Windows x64 (`windows-latest`). Each runner type-checks, tests, builds, packages and then **smoke-tests the packaged app** in light and dark mode. Nothing is published automatically.

## Build locally

```bash
npm ci
npm run check                                     # type checks + tests
npm run smoke                                     # real app, light + dark
cd apps/desktop
MOCHI_ARTIFACT_SUFFIX=-unsigned npm run dist:mac  # arm64 + x64 DMGs → apps/desktop/release/
MOCHI_ARTIFACT_SUFFIX=-unsigned npm run dist:win  # Windows NSIS (build on Windows)
```

To smoke-test what you just packaged (finds `release/mac-arm64`, `release/mac` or `release/win-unpacked`):

```bash
node apps/desktop/scripts/smoke-packaged.mjs
```

Or verify an installed copy, e.g. from a mounted DMG:

```bash
ORBITAL_SMOKE_OUT=/tmp/mochi-pkg/light ORBITAL_SMOKE_THEME=light "/Volumes/Mochi <v>/Mochi.app/Contents/MacOS/Mochi"
ORBITAL_SMOKE_OUT=/tmp/mochi-pkg/dark  ORBITAL_SMOKE_THEME=dark  "/Volumes/Mochi <v>/Mochi.app/Contents/MacOS/Mochi"
node apps/desktop/scripts/smoke.mjs --report /tmp/mochi-pkg
```

(For the Intel build on Apple Silicon, prefix the app with `arch -x86_64` and set `MOCHI_SMOKE_TIMEOUT_MS=480000`, because Rosetta is slow.)

## Build in GitHub Actions

1. **Actions → Build installers → Run workflow** on `main`. Leave **publish** unticked to just build. Artefacts (`.dmg`, `.exe`) attach to the run.
2. Download and test them, especially the **Windows installer on a real Windows 10/11 x64 machine**, before any release.
3. Write the release notes in `docs/release-notes/<tag>.md` (for example `v0.1.0.md`) and merge them to `main`.
4. Run the workflow again on `main` with **publish = true** and the **tag**. If, and only if, every platform built and passed its smoke test, it creates a **draft** release with the installers, `SHA256SUMS.txt` and the release notes.
5. Review the draft (notes, testing status, the unsigned label), then click **Publish release**. Only then do the website's download buttons switch to direct links.

## Code signing (optional, needs credentials)

Without the secrets below, builds are unsigned and named `-unsigned`.

### macOS (Developer ID + notarisation)

Requires an Apple Developer Program membership.

| Secret | Value |
|---|---|
| `CSC_LINK` | Base64 of your *Developer ID Application* `.p12` certificate |
| `CSC_KEY_PASSWORD` | Its password |
| `APPLE_ID` | Apple ID email used for notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Your 10-character Team ID |

You must also set `mac.identity` in `electron-builder.yml` to your identity (or remove `identity: null`) and add `notarize: true`. Hardened runtime is already enabled.

### Windows (Authenticode)

Requires a code-signing certificate (OV or EV) from a certificate authority. Provide it as `CSC_LINK` and `CSC_KEY_PASSWORD` on the Windows job (or use `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`). Unsigned installers trigger SmartScreen warnings until they build reputation.

## Website (GitHub Pages)

One-time: **Settings → Pages → Build and deployment → Source: GitHub Actions**. After that, every push to `main` that changes `site/` deploys it automatically (or run **Actions → Deploy website** by hand). The workflow first runs `node tools/check-site.mjs site` (missing assets, broken anchors, root-absolute paths) and publishes `site/` only.

When the presentation changes, copy `presentation/mochi-space-apps.pdf` to `site/assets/` so the website's link stays current.

## Checklist before going public

- [ ] `npm run check`, `npm run smoke` pass.
- [ ] `node tools/license-audit.mjs`: all shipped dependencies are permissive; THIRD_PARTY_NOTICES.md is current.
- [ ] Licence for code and artwork decided (LICENSE, ASSETS.md).
- [ ] No private files: `git status --ignored` shows `reference/`, `config/*.local.json`, `.review/`, `.smoke/`, `release/`, `*.sqlite` as ignored.
- [ ] Windows installer tested on real hardware, or the release notes say it is untested.
- [ ] No private names or transcripts: `git grep` for each name in the git-ignored `config/demo-identities.local.json` returns nothing; unredacted research stays in the git-ignored `private/` folder.
- [ ] Release notes state: demonstration, synthetic data, not a medical device, unsigned (if so).
