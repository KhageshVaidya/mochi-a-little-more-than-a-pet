# ORBITAL — Workstreams & Ownership

Phase 0 has frozen the shared contracts. Each stream can now work independently.

| Stream | Scope | Owns (write access) | Consumes |
|---|---|---|---|
| **Lead / integration** | Main process, IPC, windows, security, packaging | `apps/desktop/src/main/**`, `apps/desktop/src/preload/**`, `packages/contracts/**`, root config | everything |
| **A · Frontend & app architecture** | Design system, sections, charts, body map, reports | `apps/desktop/src/renderer/dashboard/**`, `apps/desktop/src/renderer/shared/**`, `assets/icons/**` | contracts, signals |
| **B · Synthetic data & NASA integration** | Simulation, adapters, HRP knowledge snapshot, OSDR | `packages/simulation/**`, `packages/data-sources/**`, `knowledge/**` | contracts, signals |
| **C · Brain health engine** | Detectors, rules, profiles, explainer, ML advisory | `packages/engine/**` | contracts, signals |
| **B2 · Companion conversation & journal** | Dialogue engine, phrasebank, safety screen, journal/memory UI | `packages/companion/**`, `renderer/dashboard/src/sections/Journal.tsx`, `renderer/companion/src/ChatPanel.tsx` | contracts |
| **D · Gamification & companion** | Objectives, XP, cognitive games logic, crew challenges, pet behaviour and assets | `packages/gamification/**`, `apps/desktop/src/renderer/companion/**`, `assets/pets/**` | contracts |

`packages/signals` is co-owned by the lead and C. New signals need a registry entry, and the registry tests must pass.

## Rules

1. **Contracts first.** Need a new type, IPC channel or event? Open a PR against `packages/contracts` and tag the lead. Never redefine a contract type locally.
2. **Pure packages stay pure.** `simulation`, `engine`, `gamification` and `data-sources` don't import Electron, the DOM or `fs`. The main process wires them in.
3. **Main is the only integrator.** Streams expose functions. The lead connects them to IPC and storage.
4. **Always runnable.** Before merging: `npm run check` (typecheck + tests) and `npm run smoke` (launches the real app in both themes and checks 16 assertions per theme).
5. **Branches.** One branch per stream (`ws/a-frontend`, `ws/b-data`, `ws/c-engine`, `ws/d-engagement`). Rebase on `main` at least every 2 hours.
6. **Honesty constraints apply to all streams:** never diagnose; synthetic data is always labelled; no invented clinical ranges; every value carries provenance.

## Phase 1 entry points

- **A:** add shadcn primitives (Dialog, Tooltip, Popover, Tabs) restyled to the tokens. Build `<OrbitalChart>` (baseline band, anomaly markers, provenance line styles), then Physical Health views on fixture `HealthRecord[]`.
- **B:** `generate({ seed, scenario, days })` → `HealthRecord[]` that passes `HealthRecord.parse`, plus the `nasa.hrp` snapshot as `ReferenceItem[]`.
- **C:** implement `evaluate(input: EngineInput, config) → Assessment` with P0–P4 + P6, starting from the contract interfaces in `packages/contracts/src/engine.ts`.
- **D:** behaviour state machine and asset loader (`PetManifest`), message catalogue plus tone test, and a gamification rules engine over `EngagementEvent[]`.
