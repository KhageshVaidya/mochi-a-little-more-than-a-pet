# ORBITAL — GitHub & Library Research

> Retrieved 2026-11-14 from the GitHub REST API (licence, stars, last push) and the npm registry (latest version). Stars are approximate.

## Summary decision

**Adopt (11):** Electron · electron-vite · electron-builder · React · Tailwind CSS v4 · shadcn/ui (on Radix primitives) · Recharts · Lucide · Motion · Zustand · SQLite (built-in `node:sqlite` if Electron's Node exposes it, otherwise better-sqlite3)
**Reference only, don't install (5):** Tremor · nivo · visx · Magic UI · Aceternity UI

We chose a small set of libraries that work well together: one styling system, one component approach, one chart library, one animation library and one state library. Every adopted licence is permissive (MIT/ISC) and compatible with a packaged macOS app.

## Repositories investigated

| # | Repository | Licence | ★ | Last push | npm latest | Verdict |
|---|---|---|---|---|---|---|
| 1 | [electron/electron](https://github.com/electron/electron) | MIT | 124k | 2026-11-14 | 45.3.2 | **Adopt.** The runtime. Gives us transparent frameless windows (needed for the companion), `utilityProcess`, `safeStorage` and fuses. |
| 2 | [alex8088/electron-vite](https://github.com/alex8088/electron-vite) | MIT | 5.6k | 2026-10-14 | 6.0.0 | **Adopt.** One config builds main, preload and **multiple renderer entries** (dashboard + companion). Supports Vite ^8, with HMR in the renderers. |
| 3 | [electron-userland/electron-builder](https://github.com/electron-userland/electron-builder) | MIT | 14.7k | 2026-11-13 | 26.18.0 | **Adopt.** macOS `.dmg`/`.app` packaging, native-module rebuild (`install-app-deps`), hardened runtime. Chosen over Electron Forge because electron-vite documents it as the primary path. |
| 4 | [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) | MIT | 98.6k | 2026-11-11 | 4.3.5 | **Adopt.** v4's CSS-first `@theme` maps directly onto our design tokens as CSS variables, which makes light/dark theming simple. |
| 5 | [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | 128k | 2026-11-13 | (CLI) | **Adopt as source.** Components are copied into our repo, not imported as a dependency. We restyle them fully to the ORBITAL system so the app doesn't look like stock shadcn. We'll use: Dialog, Popover, Tabs, Tooltip, Slider, Switch, DropdownMenu, ScrollArea, Sheet, Command. |
| 6 | [radix-ui/primitives](https://github.com/radix-ui/primitives) | MIT | 19.5k | 2026-10-14 | — | **Adopt (transitively, via shadcn).** Accessible behaviour (focus, keyboard, ARIA) for overlays and controls, which matters for a credible product. |
| 7 | [recharts/recharts](https://github.com/recharts/recharts) | MIT | 27.7k | 2026-11-13 | 3.10.1 | **Adopt.** A declarative React/SVG chart library with enough control for baseline bands (`ReferenceArea`), anomaly markers (`ReferenceDot`), brushing and synced cursors. We wrap it in our own `<OrbitalChart>` primitives so the visual language stays consistent. |
| 8 | [lucide-icons/lucide](https://github.com/lucide-icons/lucide) | ISC (GitHub reports NOASSERTION because the licence file also carries Feather's MIT notice) | 25.8k | 2026-11-14 | lucide-react 1.73.0 | **Adopt.** One consistent 24px/1.5-stroke icon set, tree-shakeable. |
| 9 | [motiondivision/motion](https://github.com/motiondivision/motion) (formerly Framer Motion) | MIT | 35.1k | 2026-11-13 | motion 14.14.0 | **Adopt.** Page transitions, layout animations, the companion's idle motion, and the reduced-motion hook. Use it sparingly: the design brief is "calm". |
| 10 | [pmndrs/zustand](https://github.com/pmndrs/zustand) | MIT | 58.9k | 2026-11-06 | 5.1.0 | **Adopt.** Small per-feature stores (UI, playback, preferences) with no provider tree. Cross-window state lives in main, and Zustand mirrors it through IPC. |
| 11 | [WiseLibs/better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | MIT | 7.5k | 2026-11-14 | 13.2.0 | **Fallback.** Synchronous, fast, well understood. It's a native module, so it must be rebuilt for Electron's ABI. We'll first try Node's built-in `node:sqlite` inside Electron 45's main process (no native build). If that isn't available, we fall back to better-sqlite3. To be confirmed in a 30-minute spike (WBS task 0.3). |
| 12 | [tremorlabs/tremor](https://github.com/tremorlabs/tremor) | Apache-2.0 | 3.7k | 2025-10-10 | — | **Reference only.** Good Tailwind+Recharts dashboard patterns (KPI cards, spark charts, category bars). Last push was over a year ago, and it would add a second styling layer. We borrow ideas, not code. |
| 13 | [plouc/nivo](https://github.com/plouc/nivo) | MIT | 14.1k | 2026-07-21 | @nivo/core 0.99.0 | **Reference only.** Strong for heatmaps and calendars, but heavy (D3-based) and a second chart grammar. We'll draw the one heatmap we need (a 180-day calendar) in plain SVG. |
| 14 | [airbnb/visx](https://github.com/airbnb/visx) | MIT | 21.1k | 2026-06-22 | 4.0.0 | **Reference only. Escape hatch.** Low-level D3+React primitives. We'd adopt it only if Recharts can't render a specific scientific chart (e.g. a CUSUM control chart with custom glyphs). |
| 15 | [magicuidesign/magicui](https://github.com/magicuidesign/magicui) | MIT | 23.3k | 2026-11-13 | (copy-in) | **Reference only.** Its marketing-style effects (shimmer, meteors, beams) clash with "calm, scientific". At most we might adapt one subtle effect, such as an animated number ticker, by copying it with attribution. |
| 16 | Aceternity UI (`aceternity/ui`) | **No public repository found.** `github.com/aceternity/ui` returns 404. The components are distributed from the website under the site's own terms, partly paid. | — | — | — | **Inspiration only. Don't copy code.** Without a clear OSS licence, it's unsafe to include in a submission. |

## Why this combination

- **One token source.** Tailwind v4 `@theme` CSS variables feed shadcn components, Recharts colours (read from CSS vars at runtime) and the companion window, so a theme switch changes everything at once.
- **No duplicate grammars.** One chart library (Recharts), one animation library (Motion), one icon set (Lucide).
- **Desktop-native.** electron-vite's multi-entry build is what lets us ship a separate, minimal, sandboxed companion renderer with its own preload script.
- **Offline.** No runtime CDN. Fonts are the system stack (SF Pro / SF Mono on macOS), so nothing is fetched at runtime.

## Additional dependencies (minimal, justified)

| Package | Why |
|---|---|
| `zod` 4.x | Runtime validation of every IPC payload in main, and the contract schemas shared by all workstreams |
| `vitest` 5.x | Unit and property tests for the engine, simulation and gamification (all pure TS) |
| `clsx` + `tailwind-merge` | Required by shadcn's `cn()` helper |
| `@electron/fuses` (build-time) | Turns off RunAsNode, NODE_OPTIONS and similar in the packaged app |

**Deliberately excluded:** UI kits beyond shadcn, D3 directly, ML libraries (Isolation Forest is about 150 lines of pure TS and deterministic with a seeded RNG), LLM SDKs (the explainer is template-based by default), and any analytics or telemetry SDK.

## Version caveat

TypeScript 7.0 (the native Go compiler) is now `latest`. Vite only strips types, so TS is used purely for type-checking. If any tool (e.g. typescript-eslint) isn't ready for 7.x yet, we'll pin TS 5.9 during scaffolding and record it here.
