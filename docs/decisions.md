# ORBITAL — Decision Log

Each decision is binding until a later entry supersedes it. The architecture plan ([architecture-plan.md](./architecture-plan.md)) is the design. This log records what was decided and why.

---

## D-001 · Central process owns shared state (approved 2026-11-14)
The Electron main process owns preferences, the mission clock, storage, the engine runner and gamification state. Renderers (dashboard and companion) are views: they send commands over typed IPC and receive pushed updates. Domain logic lives in modular pure-TS packages with typed interfaces in `@orbital/contracts`.

## D-002 · ML never overrides deterministic decisions (approved 2026-11-14)
The Brain Health Monitor's state (`YES` / `NO` / `INSUFFICIENT_DATA`) comes only from the deterministic layers: safety → data quality → sufficiency → statistics → rules. ML (e.g. Isolation Forest) may add **anomaly insights and explanations** as `advisories[]`. This is enforced in the type system: `MlAdvisor.advise()` returns `Advisory[]` and receives a frozen snapshot. A test with an adversarial plugin will be added with the engine (Workstream C).

## D-003 · Personal baselines by default; clinical ranges are separate and cited (approved 2026-11-14)
Status colours and alerts compare the astronaut with their own baseline. Clinical reference ranges live in a separate reference-range registry. Each entry needs a citation, and the UI shows the source. `SignalDefinition.plausibleRange` is used only for data-quality rejection and is never shown as a clinical range. A registry test asserts that no signal declares a reference range without one.

## D-004 · Four workstreams under one integration lead (approved 2026-11-14)
A: Frontend & application architecture · B: Synthetic health data & NASA integration · C: Brain health intelligence engine · D: Gamification & desktop companion. The lead owns `apps/desktop/src/main`, `apps/desktop/src/preload` and `packages/contracts`. Shared contracts were defined in Phase 0, before any work was assigned. See [workstreams.md](./workstreams.md).

## D-005 · Git initialised; planning docs committed before implementation (2026-11-14)
Commit `2608bd4` preserves the research and architecture documents as approved. `reference/` is git-ignored: the body-composition image contains a real person's health data, and the paper is a copyrighted Elsevier article. Both stay local only.

## D-006 · Gamification direction: hybrid (approved 2026-11-14)
Professional health monitoring with a genuinely fun **space-exploration layer**: cognitive games, cooperative crew challenges, adaptive missions and a persistent companion. These invariants carry over from the plan and are encoded in `@orbital/contracts/gamification`:
- XP depends on completion and consistency, **never on the values** an astronaut reports. This avoids biasing self-reports.
- Exercise XP is capped at the prescribed volume. **Nothing is earned for overexertion.**
- Rest and recovery count toward streaks. XP is never removed, and nothing ranks people against each other.
- Cognitive games double as the brain-engine's cognition inputs (reaction time, working memory). Their *scores* are measurements and are never turned into XP.

## D-007 · Persistence: built-in `node:sqlite` (Phase 0 spike, 2026-11-14)
Electron 45.3.2 embeds Node 24.22.2 with `node:sqlite` (SQLite 3.53.4). It inserted 50k rows in 46 ms and works in the packaged main process (smoke test). **better-sqlite3 is not needed**, so there's no native module and no ABI rebuild.

## D-008 · TypeScript pinned to 5.9.3 (2026-11-14)
TS 7.0 (native compiler) is `latest`, but we pinned 5.9.3 to avoid ecosystem lag during the hackathon. Vite only strips types, so this affects type-checking only. We'll revisit after the event.

## D-009 · Theme via `nativeTheme.themeSource` (2026-11-14)
The theme preference (light / dark / system) is stored in SQLite and applied by setting Electron's `nativeTheme.themeSource` before windows are created. CSS then relies only on `prefers-color-scheme`. Both windows switch together, there's no flash on startup, and native macOS chrome matches.

## D-010 · Crew categorical palette (Phase 0.5, 2026-11-14)
The five crew colours use the validated reference categorical slots: blue, orange, aqua, yellow, magenta. Separate light and dark steps were checked with the dataviz validator against ORBITAL's surfaces. All hard checks pass: adjacent CVD ΔE ≥ 8.4 and normal-vision ΔE ≥ 19.3. Light mode carries a contrast WARN for three hues, so crew charts always have a legend, direct end-of-line labels and a comparison table. Status colours (watch/attention) are never reused as series colours.

## D-011 · "Sustained" requires persistence AND both control charts (Phase 0.5, 2026-11-14)
During calibration, a physical-deconditioning profile produced an isolated one-day YES. Two near-threshold CUSUM excursions (5.4 and 5.3 against h = 5) coincided. A domain now counts as sustained only when persistence (≥ 5 of 7 days at ≥ 1.5σ) **and** an EWMA alarm **and** a CUSUM alarm all agree. Detection latency for the wellbeing scenario was unchanged (first YES day 106).

## D-012 · No σ-based status for sparse signals (Phase 0.5, 2026-11-14)
Weekly and monthly signals have too few baseline observations (n < 10) for a trustworthy SD; a single noisy cuff reading showed as "+4.5σ". These signals are now compared by percentage change against their baseline or first measurement, and never receive an attention badge.

## D-013 · One scenario per crew member (Phase 0.5, 2026-11-14)
Scenario selection on the timeline selects the crew member who follows that scenario. Switching crew member keeps the mission day, so profiles can be compared at the same point. The app opens on day 90.

## D-014 · Mochi is the official companion; companions are character packages (2026-11-14)
- **Artwork:** `assets/pets/mochi/mochi-reference.jpg` is the team's original and is never modified; a test pins its SHA-256. `mochi.png` (421×449, RGBA) is a cutout made by `tools/artwork-cutout.mjs`. The tool flood-fills only background connected to the image border, so whites enclosed by the outline are preserved (tail tip, eye and nose highlights; 3,983 px). It un-mixes antialiased edges from white so there's no halo, and it crops without scaling. The result was verified on dark, grey, blue and white backgrounds and with a removed-region overlay.
- **Package format:** `assets/pets/<id>/manifest.json`, validated with zod in main. It holds the display name, artwork, contain-fit display box, animation definitions per state (`still` with a CSS motion preset now; `frames` ready for future artwork), interaction menu and personality/messages. The placeholder alien, dog and cat were removed.
- **Delivery:** artwork reaches renderers only through the read-only `orbital-asset://` protocol: images only, path-traversal and symlink-escape checks, tested. Manifests go through validated IPC, never through the protocol.
- **Behaviour:** click opens the menu (hello, status, celebrate, sleep/wake, open dashboard, hide); drag moves the window; clicking a napping companion just wakes it. It naps by itself after 20 quiet minutes and bounces occasionally. Animations are transform-only, so the drawing is never altered, and reduced motion is respected.
- **Engagement events are positive-only by contract:** daily mission, cognitive achievement, recovery, rest logged, milestone, break suggestion. There is no "missed" event, and rest is celebrated exactly like activity. Mission milestones fire automatically when playback reaches them.
- **Disabling interactions makes the companion fully click-through.** This is enforced in main, not only in the UI.
- **Packaging note:** when electron-builder is configured, `assets/` must be shipped as `extraResources` (`assetsRoot()` already resolves `process.resourcesPath/assets` when packaged).

## D-015 · Mochi artwork correction & single-image rig (Phase 2 A, 2026-11-15)
- The enclosed white tail-tip patch (3,293 px) and an adjacent white sliver (648 px) are refilled by harmonic interpolation that passes *through* the outline from the surrounding fur (`--fill-enclosed-white 300`). Outline pixels are never written. The original JPEG is unchanged (SHA-256 pinned in a test), and a test asserts that no enclosed white region over 100 px remains.
- Eye positions were set **by inspection**. Automatic pupil detection proved unreliable because each pupil touches its lash line. Blink lids are fur-coloured discs over the pupils, so closing them leaves the drawn lash arc, which reads as a closed eye. No new expression is drawn.
- The tail is a separate layer. A ±6° rotation opened gaps and doubled outlines, because the tail is tucked against the body, so it uses a **seam-anchored swish** (scaleX 0.965–1.025, ±1°). "Curious head movement" is a whole-figure tilt, because the head isn't a separate layer.

## D-016 · Dog, cat and alien are labelled placeholders (2026-11-15)
No team artwork exists for them, so they're vector placeholders (`tools/build-placeholder-companions.mjs`) with `placeholder: true` and an in-app badge. Each has its own anatomy-specific part animations (dog: fast tail wag and ear flop; cat: slow S-curl tail and slow blink; alien: hover and antenna glow) and its own container motion profile. Mochi remains the official default.

## D-017 · Companion language model: optional, wording-only (2026-11-15)
Deterministic dialogue decides intent, journal flow, safety and alerts. When the user enables it, `claude-haiku-5-5` (effort `low`, 2.5 s timeout) may rephrase *eligible small-talk replies only*. It receives the persona, the draft and the current chat turns, and **never** journal, memory, health values or assessments. Model ids are configuration, verified with the Models API before use. `claude-opus-5-5` (with server-side refusal fallback) is wired but reserved. Any failure falls back to templates. Tested with a fake provider: fallback, not called for journal or safety turns, no journal content in any request.

## D-018 · Safety handling is deterministic and closes the P0 gap (2026-11-15)
An on-device phrase screen (typographic apostrophes are normalised, a bug found by tests) runs on every message in every mode. The "I'd like to talk to someone" controls in the companion and dashboard record a safety event, which feeds the engine's `input.safety`, which escalates in P0, which produces an urgent alert. The event is audited and the companion goes quiet. The reply is fixed and never playful.

## D-019 · Alert tiers and append-only audit (2026-11-15)
`deriveAlerts` (engine) produces urgent, human-review, monitor and routine alerts with explicit precedence. Generation, acknowledgement, share/no-share decisions and escalations go to `alert_audit`, which SQLite triggers make append-only. Human review is recommended, never forced. The person records whether to share.

## D-020 · Crew wellbeing is opt-in and team-level (2026-11-15)
Statuses are voluntary, expire daily and are visible only to the chosen audience (support can be limited to crew-support or one person). People who chose "personal space" are never suggested or invited. Companion-to-companion messages carry activity logistics only. Participation is shown per team per week only. The four other crewmates are simulated and labelled.

## D-021 · NASA HRP knowledge is an offline, cited registry that explains but never decides (Phase 3, 2026-11-15)
The 17 HRP risks are curated in `packages/data-sources/knowledge/nasa-hrp/registry.json` (v1.0.0, retrieved 2026-11-15).
- **Sources:** only the official nasa.gov public and HSRB pages that were actually read. Every NASA statement and mitigation is a verbatim quote, verified by `tools/verify-hrp-sources.mjs`.
- **Evidence classes:** links are classed as NASA-stated, NASA-related or ORBITAL hypothesis.
- **Validation:** with zod and cross-checks, including bidirectional consistency with signal `hrpRisks`. An invalid registry is reported "unavailable", never partially trusted.
- **Alerts:** alerts gain explanatory `riskContext` in main; urgent alerts never do; tier, wording and SCND decisions are untouched.
- **External links:** NASA pages open only through an allow-listed IPC that accepts registry source ids, not URLs.

Details: docs/nasa-hrp-integration.md.

## D-022 · Hybrid intelligence: statistics decide, the Isolation Forest advises (Phase 4, 2026-11-15)
- **Statistics:** a Mann–Kendall + Theil–Sen trend detector was added for slow physical change, plus per-signal data quality.
- **Confirmation rule:** a YES must now hold on 3 consecutive days (`R-BRAIN-CONFIRM`). Held-out healthy false-YES days fell from 1.33% to 0.28%, for about 2–3 days of extra delay.
- **Isolation Forest:**
  - implemented from scratch and seeded (hash 69db990e)
  - trained on a healthy synthetic cohort with seeds disjoint from evaluation and the named crew
  - reported beside the decision through P5's frozen snapshot only
- **Recommendations** consume `ApprovedOutputs`, which is strict and has no ML fields.
- **Forecasting** was evaluated and rejected: it was worse than "no change".
- Details: docs/phase-4-intelligence-design.md and docs/phase-4-ml-evaluation.md.

## D-023 · Adaptive gamification replaces, never adds (Phase 4, 2026-11-15)
- The top approved recommendation fills the rotating daily slot, so the XP on offer is identical with or without detected changes. Deterioration is never rewarded.
- Offers are persisted per day.
- The route needs a balanced mix including *connection*; the first stop needs none because synthetic history has no connection facts.
- Companion items are shown beside, never drawn onto, the artwork.
- The companion relays approved titles verbatim and never via the LLM.
- Details: docs/phase-4-adaptive-gamification.md.

