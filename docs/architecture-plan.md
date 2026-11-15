# ORBITAL — Architecture Plan (for approval)

> Status: **PROPOSED, awaiting team approval** · 2026-11-14
> Inputs: [research-review.md](./research-review.md), [github-research.md](./github-research.md)

---

## 0. Guiding principles

1. **Provenance first.** No number appears in the UI without its source, classification and quality.
2. **Deterministic core, advisory intelligence.** Rules and statistics decide. ML can add context but never overrides. An LLM, if used at all, only rewords results.
3. **Baseline-relative, not population-relative.** Colours and alerts compare the astronaut with themselves unless a *cited* reference range exists.
4. **Never diagnose. Never shame. Never reward overexertion.**
5. **Offline, local, private.** No network access is needed at runtime. Optional NASA metadata fetches are cached and can be turned off.
6. **Always runnable.** Every merge keeps `npm run dev` working.

---

## 1. Desktop architecture

```
┌───────────────────────────── Electron main process (Node) ─────────────────────────────┐
│  WindowManager ── creates/positions ── DashboardWindow, CompanionWindow                  │
│  IpcRouter (allow-listed channels, zod-validated, sender-origin checked)                 │
│  CoreService  ┌ MissionClock (sim day, playback, speed)                                  │
│               ├ DataSourceRegistry → adapters: synthetic · user-entry · nasa-hrp · osdr  │
│               ├ Repository (SQLite: records, assessments, prefs, gamification, pet)      │
│               ├ EngineRunner  → @orbital/engine (pure TS, deterministic)                  │
│               ├ GamificationService → @orbital/gamification                              │
│               └ EventBus → broadcasts state deltas to both windows                       │
└──────────────┬───────────────────────────────────────────────┬──────────────────────────┘
      preload/dashboard.ts (contextBridge)            preload/companion.ts (tiny API)
               │                                               │
┌──────────────▼──────────────┐               ┌────────────────▼────────────────┐
│ Dashboard renderer (React)  │               │ Companion renderer (React)      │
│ 8 sections, design system,  │               │ transparent, frameless overlay  │
│ Zustand view stores         │               │ PetStateMachine + AssetLoader   │
└─────────────────────────────┘               └─────────────────────────────────┘
```

**Why main owns state.** Two windows need the same mission clock, alerts and celebrations. A single source of truth in main avoids drift between windows. Renderers are views: they request queries and receive pushed deltas. If engine runs get slow (180 days × many signals), `EngineRunner` moves into an Electron `utilityProcess` without changing the API.

### 1.1 Security baseline (checklist, enforced in code review)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true` on **both** windows
- Strict CSP: `default-src 'self'; img-src 'self' orbital-asset: data:; connect-src 'self'` (OSDR fetches go through main, never the renderer)
- Assets served through a custom `orbital-asset://` protocol scoped to `assets/`. No `file://` access from renderers.
- `setWindowOpenHandler → deny`, `will-navigate` blocked, `session.setPermissionRequestHandler → deny all`
- Every IPC channel is in an allowlist in `@orbital/contracts/ipc`. Every payload is parsed with zod in main, and `event.senderFrame.url` is checked against the expected window.
- The companion preload exposes **only** pet APIs (move, menu actions, prefs). It can't query health data beyond the events it's sent.
- Packaging: `@electron/fuses` (RunAsNode off, NodeOptions off, OnlyLoadAppFromAsar on), hardened runtime.

### 1.2 Repository layout (npm workspaces)

```
/ (project root — existing docs/, assets/, reference/ are preserved)
├─ package.json                # workspaces, scripts
├─ packages/
│  ├─ contracts/      [LEAD]   # types + zod schemas: records, signals, assessments, IPC, pet events
│  ├─ signals/        [LEAD/C] # the signal registry (declarative definitions)
│  ├─ simulation/     [B]      # 180-day synthetic mission generator (pure TS)
│  ├─ engine/         [C]      # SCND-style decision engine (pure TS, no Electron)
│  ├─ gamification/   [D]      # objectives, XP, achievements (pure TS)
│  └─ data-sources/   [B]      # adapters: synthetic, user-entry, nasa-hrp, osdr
├─ apps/desktop/
│  ├─ electron.vite.config.ts
│  └─ src/
│     ├─ main/        [LEAD]   # windows, IPC router, core service, repository
│     ├─ preload/     [LEAD]   # dashboard.ts, companion.ts
│     ├─ renderer/dashboard/ [A] # sections, design system, charts
│     └─ renderer/companion/ [D] # pet overlay
├─ assets/pets/<species>/manifest.json (+ sprites later)   [D]
├─ assets/icons/                                          [A]
├─ knowledge/nasa-hrp/   # curated, cited HRP snapshot (JSON) [B]
└─ docs/
```

Ownership tags `[A] [B] [C] [D]` match the workstreams in §10. **`packages/contracts` changes only through a reviewed PR from the lead.** Everyone else imports from it and never redefines its types.

---

## 2. Data contracts (`@orbital/contracts`)

```ts
// ---- Provenance ----------------------------------------------------------
export type SourceKind = 'synthetic' | 'nasa' | 'user' | 'model' | 'device';
export type Classification =
  | 'measured'       // direct sensor reading (HR from PPG/ECG, SpO2, skin temp, BP cuff)
  | 'derived'        // deterministic computation from measured data (RMSSD from RR intervals, sleep duration from actigraphy)
  | 'inferred'       // statistical/model estimate (fatigue index, hydration estimate, segmental fat)
  | 'self-reported'  // astronaut input (mood, stress, isolation VAS)
  | 'reference';     // knowledge content (NASA HRP text, cited ranges)

export interface Source {
  kind: SourceKind;
  adapterId: string;          // 'sim.v1', 'user.checkin', 'nasa.hrp', 'osdr'
  device?: string;            // e.g. 'Simulated chest-strap ECG' — never a real product claim
  scenarioId?: ScenarioId;    // present iff kind === 'synthetic'
  citation?: string;          // URL/DOI for nasa/reference
  retrievedAt?: string;       // ISO, for snapshotted external content
}

export interface Quality {
  score: number;              // 0..1
  flags: QualityFlag[];       // 'implausible' | 'motion-artifact' | 'low-contact' | 'gap' | 'duplicate' | 'unit-mismatch' | 'stale' | 'imputed'
}

// ---- The atomic record ---------------------------------------------------
export interface HealthRecord {
  id: string;                 // deterministic: hash(signalId, timestamp, source)
  signalId: SignalId;
  timestamp: string;          // ISO-8601 UTC
  missionDay: number;         // MET day (0 = launch)
  value: number;
  unit: string;               // must equal registry unit for signalId (UCUM-style strings)
  aggregation: 'sample' | 'daily-mean' | 'daily-total' | 'nightly' | 'spot';
  source: Source;
  classification: Classification;
  quality: Quality;
}

// ---- Signal registry (the "board") ---------------------------------------
export interface SignalDefinition {
  id: SignalId;               // 'hr.resting', 'hrv.rmssd', 'mood.vas', 'cog.rt.median' ...
  label: string;
  unit: string;
  domain: 'cardiovascular' | 'respiratory' | 'sleep' | 'activity' | 'thermal' | 'metabolic'
        | 'body-composition' | 'mood' | 'stress' | 'social' | 'cognition' | 'fatigue';
  allowedClassifications: Classification[];
  cadence: 'continuous' | 'daily' | 'intermittent';
  adverseDirection: 'up' | 'down' | 'both';      // e.g. RT up = adverse; mood down = adverse
  plausibleRange: [number, number];              // PHYSICAL plausibility for data-quality only — not clinical
  referenceRangeId?: string;                     // only if a cited range exists in the reference registry
  hrpRisks: HrpRiskId[];                         // links to verified NASA HRP risk catalogue
  baseline: { minObservations: number; windowDays: number };
  explanation: string;                           // plain-language "what this is / how it's measured in space"
}

// ---- Assessment output (the Brain Health Monitor) -------------------------
export type AssessmentState = 'YES' | 'NO' | 'INSUFFICIENT_DATA';

export interface Assessment {
  state: AssessmentState;
  headline: string;                    // fixed copy per state (see §4.6)
  reasons: Reason[];                   // ordered by rule precedence
  contributors: Contributor[];         // per-signal evidence
  window: { start: string; end: string; baselineStart: string; baselineEnd: string };
  dataQuality: { coverage: Record<SignalId, number>; reliableDomains: number; requiredDomains: number; issues: string[] };
  uncertainty: { level: 'low' | 'moderate' | 'high'; drivers: string[] };
  suggestedAction: ActionId;           // from a fixed action table
  advisories: Advisory[];              // ML / supplementary notes — cannot affect `state`
  escalation?: EscalationEvent;        // populated by the safety pathway, independent of state
  trace: { engineVersion: string; configHash: string; inputHash: string; rulesFired: string[] };
}
```

The IPC contract (`contracts/ipc.ts`) is a single typed map, `{ channel: { request: ZodSchema, response: ZodSchema } }`. Main's router and both preloads are generated from it, so a channel can't exist on one side without the other.

---

## 3. Physical-health measurability matrix

This is what ORBITAL *claims* about each metric. It's shown in the UI as a "How is this measured?" sheet on each metric.

| Metric | Classification | Cadence in ORBITAL | Notes |
|---|---|---|---|
| Heart rate | measured | continuous (telemetry) + daily resting | PPG/ECG |
| HRV (RMSSD) | derived | nightly | Needs beat-to-beat intervals, not averaged HR |
| SpO₂ | measured | spot + nightly | Pulse oximetry |
| Respiratory rate | measured | continuous during wear | Chest-band style (Astroskin-like), simulated |
| Skin temperature | measured | continuous | **Not** core temperature, and labelled as such |
| Blood pressure | measured | intermittent (cuff, user-entered) | Added from the challenge brief |
| Blood glucose | measured | intermittent (fingerstick, user-entered) | Added from the challenge brief |
| Sleep duration / timing | derived | nightly | Actigraphy |
| Sleep quality | self-reported | daily | 0–10 scale |
| Physical activity / exercise | derived + self-reported | daily | Accelerometer + exercise log (resistance / treadmill / cycle) |
| Fatigue | self-reported + inferred | daily | The inferred index is labelled low-confidence |
| Hydration | self-reported + inferred | daily | Intake log; any estimate is labelled inferred |
| Body mass | measured | weekly | Synthetic |
| Body composition / segmental | inferred | intermittent (pre-flight, monthly) | BIA, with a fluid-shift caveat shown |

---

## 4. The SCND-inspired decision engine (`@orbital/engine`)

### 4.1 Shape

```ts
evaluate(input: EngineInput, config: EngineConfig): Assessment   // pure, synchronous, deterministic
```
No clock, no randomness, no I/O inside. `asOf` is part of the input. Identical `(input, config)` gives byte-identical output, and that's tested.

### 4.2 Pipeline and precedence

```
            ┌─────────────────────────────────────────────────────────────┐
records ──► │ P0  SAFETY GATE           (hard, highest precedence)         │──► EscalationEvent (separate pathway)
            │ P1  DATA-QUALITY RULES    plausibility, units, dupes, gaps   │
            │ P2  SUFFICIENCY RULES     coverage per domain, baseline age  │──► INSUFFICIENT_DATA (terminal)
            │ P3  STATISTICAL DETECTORS z, EWMA, CUSUM, change-point       │──► Findings[]
            │ P4  DECISION RULES        persistence × breadth → YES / NO   │──► state
            │ P5  ML ADVISORY           Isolation Forest (optional)        │──► advisories[] (state is frozen)
            │ P6  ASSEMBLY              reasons, uncertainty, action, trace│
            └─────────────────────────────────────────────────────────────┘
```

**Precedence is enforced structurally, not by convention.** After P4, `state` is held in a readonly object. P5 receives a read-only snapshot and returns only `Advisory[]`, and its type signature can't express a state change. A test asserts that an adversarial ML plugin can't change the state.

### 4.3 The layers

**P0 Safety gate.** The daily check-in has an always-visible *"I'd like to talk to someone"* control and one optional structured safety item. A positive answer creates an `EscalationEvent` immediately. It is never delayed by data sufficiency, never shown as a YES/NO, and it opens the dedicated **Human Support** sheet (configured crew-support contacts, such as a crew medical officer, flight surgeon or behavioural-health team, plus a private-conference request). The companion goes quiet. We don't scan free text for keywords: that's unreliable and intrusive.

**P1 Data quality.** Values outside `plausibleRange`, unit mismatches, duplicates, flagged artefacts and stale records are excluded and *counted* in `dataQuality.issues`. Missing data is never imputed for decisions; imputation only happens for display and is flagged.

**P2 Sufficiency.** INSUFFICIENT_DATA if any of these hold:
- the baseline has fewer than `baseline.minObservations` reliable observations in each required domain
- fewer than `requiredDomains` (default 4 of 6: mood, sleep, fatigue/stress, cognition, social, activity) have ≥ 70% coverage in the assessment window (default 14 days)
- **all** available evidence is self-reported from a single domain.

This decision is terminal. Nothing downstream can override it.

**P3 Statistical detectors.** Each is a plugin with the interface `Detector { id; appliesTo(signal); run(series, baseline, cfg): Finding[] }`:

| Detector | Method | Default config (engineering defaults, **not** clinically validated) |
|---|---|---|
| Baseline | Robust median/MAD and mean/SD over the baseline window (mission days 7–28, or the 28 days before the window) | min 10 obs |
| Z-score | `(x − μ_b)/σ_b`, signed by `adverseDirection` | Watch at 1.5, attention at 2.0 |
| EWMA | λ = 0.2, control limit L = 2.7 · σ·√(λ/(2−λ)) | Alarm when the limit is crossed in the adverse direction |
| CUSUM | One-sided, k = 0.5σ, h = 5σ (Page 1954) | Detects small sustained shifts. Reports the alarm day and estimated onset. |
| Change point | Onset estimated from the CUSUM trace (last zero-crossing before the alarm) | Gives the "since about day N" in explanations |
| Persistence | Days in the last 7 with adverse z ≥ watch level | Needs ≥ 5/7 to count as "sustained" |

**P4 Decision rules** (declarative, ordered, each with an id):

- `R-BRAIN-01 SUSTAINED_MULTI_DOMAIN` → **YES** if ≥ 2 domains have a *sustained* finding (persistence ≥ 5/7 **and** an EWMA or CUSUM alarm).
- `R-BRAIN-02 SINGLE_DOMAIN_STRONG` → **YES** if one domain has a CUSUM alarm **and** z ≥ 2.0 for ≥ 10 of 14 days.
- `R-BRAIN-03 DEFAULT` → **NO** otherwise.

Rules are data (`{ id, precedence, when: Predicate, then: State }`). Adding a rule is a config change plus a test, with no change to the engine.

**P5 ML advisory.** A pure-TS **Isolation Forest** with a seeded RNG, so it's deterministic. It runs on daily multivariate vectors of *baseline-normalised* z-scores, fitted only on the astronaut's own baseline window. Output: an anomaly score and the top-contributing features, as an `Advisory` ("Unusual combination of signals on days 112–118; consider an extra check-in"). **No supervised classifier is trained**, because there are no real labelled data (paper §8). This is documented in the UI's "About the model" panel.

**P6 Assembly.**
- **Uncertainty** is rule-based. It's high when coverage is below 85%, the baseline is under 21 days, detectors disagree, or the evidence is mostly self-reported.
- **Suggested action** comes from a fixed table, e.g. `YES` → "Consider a private conference with your crew-support contact; review sleep and workload." `NO` → "Keep routine check-ins." `INSUFFICIENT` → "Complete check-ins on the next 3 days to enable assessment."
- **Trace** holds rule ids, config hash and input hash.

### 4.4 Generalisation

The physical-health monitors (e.g. a cardiovascular deconditioning trend) reuse the same pipeline with a different **AssessmentProfile** (`{ id, domains, requiredDomains, rules }`). The brain monitor is one profile. New indicators mean adding a `SignalDefinition`; new logic means registering a `Detector` or `Rule`. The pipeline itself doesn't change.

### 4.5 Optional explainer

`Explainer { explain(a: Assessment): string }`. The default implementation is **template-based**, with deterministic sentences built from the reasons and contributors. An optional local-SLM adapter can be added behind the same interface. It receives only the finished `Assessment` JSON and its output is shown as a paraphrase, with the structured result always visible beside it. The critical path never calls it.

### 4.6 Fixed copy (non-diagnostic)

- **YES**: "Elevated wellbeing risk signal detected." Sub-line: "This is a pattern in your data, not a diagnosis."
- **NO**: "No elevated signal detected in the available reliable data." Sub-line: "This doesn't confirm wellbeing. Check in with your crew-support contact any time."
- **INSUFFICIENT DATA**: "Not enough reliable information for an assessment."

### 4.7 Tests (Vitest)

- Determinism (property test: 100 random seeds, evaluate twice, deep-equal)
- Precedence: P0 always fires; P2 is terminal; an adversarial ML plugin can't change the state
- Known ground truth: the healthy scenario gives no YES after the baseline; the psych-deterioration scenario gives YES within N days of the injected onset (we report detection latency and false-alarm rate per scenario)
- Data quality: implausible values, unit mismatch and gaps are excluded and counted
- Detectors: EWMA/CUSUM against hand-computed fixtures

---

## 5. Synthetic data engine (`@orbital/simulation`)

- **Seeded PRNG** (mulberry32/splitmix). `generate({ seed, scenario, days: 180 })` is fully reproducible.
- **Latent-state model.** Hidden daily drivers (circadian misalignment, sleep debt, workload/stress load, social isolation, deconditioning, adaptation) evolve as AR(1) processes plus scenario forcing. Observable signals are functions of these drivers plus measurement noise. Because they share drivers, signals are **correlated by construction**: poor sleep raises reaction time and lowers mood the next day.
- **Scenarios:**
  - `healthy-adaptation`: early adaptation dip (days 1–14), then stable
  - `physical-deterioration`: progressive deconditioning (resting HR ↑, HRV ↓, lean mass ↓, exercise capacity ↓) from about day 60
  - `psych-deterioration`: gradual onset about day 95 (sleep ↓, mood ↓, isolation ↑, RT ↑, memory ↓), with a known onset for validation.
- **Realism hooks for the engine:** missing check-ins, sensor gaps, motion artefacts and occasional unit errors, injected at configured rates so the P1 and P2 rules get exercised.
- **Two resolutions.** Daily summaries for 180 days are generated up front (about 30 signals × 180 days, which is small). Intraday per-second/minute telemetry for **Live Telemetry** is generated lazily for the current sim day from `hash(seed, day)`.
- Every record has `source.kind = 'synthetic'`, `scenarioId` and `adapterId = 'sim.v1'`. A persistent **"SIMULATED DATA"** badge appears in the title bar whenever any synthetic data is visible.
- **Playback:** `MissionClock` in main supports `play / pause / reset / seek(day) / setSpeed(1×…1 day/s) / setScenario`. The UI shows a mission-day slider in a global footer.

---

## 6. Design system (Workstream A)

- **Type:** system stack (`-apple-system`/SF Pro Text & Display, SF Mono for telemetry), tabular numerals, a 6-step type scale (12/13/15/17/22/28/40).
- **Space:** 4-pt grid. Cards use a 20/24 inset, 16-px radius and a hairline border, not heavy shadows.
- **Colour tokens** (CSS vars through Tailwind v4 `@theme`):
  - *Light:* bg `#F6F6F3`, surface `#FFFFFF`, surface-2 `#EFEFEB`, text `#1C1D1F`, accent-blue `#2F6BD8`, accent-teal `#13968C`
  - *Dark:* bg `#15171A`, surface `#1D2024`, surface-2 `#25292E`, text `#E9EAEC`, accents lifted for contrast.
  - Status follows **baseline semantics**: *within baseline* (neutral/teal), *watch* (amber, muted), *attention* (coral, muted). No neon, no pure black.
  - All pairs checked against WCAG AA.
- **Provenance language** (used consistently in every chart and value):
  - measured: solid line
  - derived: solid thin line
  - inferred: dashed line, with a "≈" before the value
  - self-reported: dotted line with hollow markers
  - reference: a book glyph
  - Every value has a source chip that opens a provenance popover (adapter, device, classification, quality, citation).
- **Charts:** `<OrbitalChart>` wrappers over Recharts. They provide a baseline band (μ ± σ shaded), anomaly markers, a "since day N" change-point annotation, a synced cursor across stacked charts, and colours read from tokens.
- **Body map:** an original SVG figure with clickable regions (head/brain, eyes, heart, lungs, musculoskeletal, vestibular). Each region links to signals and the related HRP risks. This answers the challenge's clickable-figure suggestion.
- **Motion:** 200–320 ms ease-out. `prefers-reduced-motion` is respected everywhere.
- **Theme:** light / dark / system, persisted in SQLite prefs and applied before first paint (no flash).

### 6.1 Sections

| Section | Key content |
|---|---|
| Overview | MET clock, astronaut card, a Brain Monitor state tile, vitals tiles (HR, HRV, SpO₂, sleep, activity, wellbeing), alerts, a 180-day trajectory, today's recommendations |
| Physical Health | Sub-views per the matrix in §3, baseline comparisons, the body map |
| Brain & Mental Health | Monitor state, reasons and contributors, detector charts (EWMA/CUSUM), check-in and cognitive tasks (reaction-time and memory tasks of our own design, PVT-inspired), the Human Support entry point |
| Live Telemetry | Streaming intraday HR/RR/SpO₂/skin temp, with an adaptive-sampling indicator |
| Mission Challenges | Objectives, XP, levels, achievements, crew challenges |
| Health Reports | A printable/exportable (PDF via `webContents.printToPDF`) scientific report: summaries, trends, baseline comparisons, body composition and segmental views, methods appendix |
| Desktop Companion | Choose a companion, behaviour and reminder settings, show/hide |
| Mission Settings | Theme, scenario, data sources (and the NASA online toggle), escalation contacts, data export/reset, about/limitations |

---

## 7. Desktop companion (Workstream D)

### 7.1 Window

`BrowserWindow({ transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true, alwaysOnTop: pref, focusable: true, width: 220, height: 240, webPreferences: { preload: companion.js, sandbox: true, contextIsolation: true } })`

- **Click-through:** `setIgnoreMouseEvents(true, { forward: true })` while the pointer is over transparent pixels. The renderer toggles it off when the pointer enters the sprite's hit area, so the empty corners of the window never block the desktop.
- **Drag:** pointer events in the renderer send throttled `pet:move` deltas, and main calls `setPosition`, clamped to the display's `workArea`. We don't use `-webkit-app-region: drag`, because it swallows clicks.
- **Persistence:** position per display id, chosen species, visibility, always-on-top and reminder prefs. Positions are re-clamped on `display-removed` and `display-metrics-changed`.
- **Never block alerts:** the window uses the `'floating'` level (never `'screen-saver'`). The default position is bottom-right, away from the macOS notification area (top-right). Whenever an alert or escalation is active, the companion suppresses its own bubbles and shows only a small "open ORBITAL" cue.
- The companion can be hidden independently, from the tray/menu-bar item, the dashboard and its own menu.

### 7.2 Behaviour

- **State machine:** `idle → (look | stretch | blink | sleep) → idle`; event states are `react(click)`, `celebrate`, `encourage`, `remind`, `talk`, `quiet` (during an escalation).
- **Deterministic scheduler** (seeded) for idle variety. Respects quiet hours and a reminder cap (e.g. ≤ 1 per 90 minutes). One switch turns all reminders off.
- **Events from main:** `objective.completed`, `recovery.completed`, `break.suggested`, `checkin.available`, `alert.active` (go quiet). The companion never receives assessment *details*, only these coarse events.
- **Message catalogue** with tone rules enforced by a unit test. Banned patterns include "you should have", "failed", "lazy", "missed again", guilt framing and any diagnostic terms. Messages are invitational ("Fancy a stretch?"), never imperative.

### 7.3 Art-independent rendering

```ts
interface PetManifest {
  species: 'alien' | 'dog' | 'cat' | string;
  displayName: string;
  frame: { width: number; height: number };
  animations: Record<PetAnimation, { kind: 'spritesheet' | 'frames' | 'svg' | 'placeholder'; src?: string | string[]; fps: number; loop: boolean }>;
  expressions: Record<PetExpression, { overlay?: string }>;  // happy, calm, sleepy, curious, proud
  hitArea: { x: number; y: number; w: number; h: number };
}
```

The `AssetLoader` reads `assets/pets/<species>/manifest.json` through `orbital-asset://`. If an asset is missing, it falls back to the **placeholder renderer**: CSS/SVG shapes driven by the same animation names. Dropping in final artwork means replacing the files and the manifest, with no code change. The alien is an original design (a small rounded body, antenna, soft palette) and resembles no existing character.

---

## 8. Data sources & NASA integration (Workstream B)

```ts
interface DataSourceAdapter {
  id: string; kind: SourceKind; online: boolean;
  describe(): ProvenanceDoc;              // what it is, licence, limitations
  load(range: DayRange): Promise<HealthRecord[] | ReferenceItem[]>;
}
```

| Adapter | Kind | What it provides | Honesty constraints |
|---|---|---|---|
| `sim.v1` | synthetic | All physiological and psychological series | Always badged as SIMULATED |
| `user.entry` | user | Check-ins, BP, glucose, exercise logs, safety item | Classified self-reported or measured (cuff/fingerstick) |
| `nasa.hrp` | nasa / reference | **Curated offline snapshot** of the HRP 5 Hazards and Risks pages (titles, short summaries, URLs, retrieval date), mapped to our signals. Powers the body map, the "Why this matters in space" panels and the hazard context in reports. | Paraphrased summaries with links. Snapshot date shown. No values invented. |
| `nasa.osdr` (optional, online) | nasa | Study metadata from the verified OSDR endpoints (`osdr.nasa.gov/osdr/data/osd/meta/{id}`, `visualization.osdr.nasa.gov/biodata/api/v2/dataset/{id}/`), e.g. human-study assay types, shown as "related NASA research" | Off by default, cached, fetched via main only. Metadata only. **We don't present OSDR data as this astronaut's telemetry.** |
| `model.engine` | model | Assessments, inferred indices | Classification `inferred`, linked to the engine trace |

`docs/data-provenance.md` (to be written) will record every source, its licence or terms, retrieval date and limitations, including the fact that individual astronaut telemetry isn't publicly available.

---

## 9. Gamification (Workstream D, pure logic in `@orbital/gamification`)

- **What earns XP:** completion and consistency only. Check-ins completed, measurements taken on schedule, sleep-window regularity, hydration logging, prescribed exercise **completed as planned**, recovery and mindfulness sessions.
- **Safeguards:**
  - Exercise XP is **capped at the prescribed volume**. Nothing is earned for exceeding it.
  - **Rest days and recovery count toward streaks.**
  - No XP loss, no penalties, no leaderboards ranked by physical output.
  - **XP never depends on the *values* a person reports** (e.g. mood). Only completion counts, so self-reports aren't biased by the reward.
  - Streaks use a forgiving "14-day consistency" measure, so one missed day doesn't reset progress.
- Daily and weekly objectives, levels (a mission-themed rank ladder), achievements and personal milestones (e.g. "Day 100 in orbit").
- **Crew challenges** are *cooperative*: a shared crew goal with a synthetic 4-person crew.
- Deterministic rule evaluation over the event log, replayable for any mission day.

---

## 10. Work breakdown

The event page says Space Apps is **live now**, so the phases are sized in hours. Times assume four parallel streams after Phase 0.

### Phase 0: Foundations (lead, ~3 h, blocks everyone)
- 0.1 npm workspaces + electron-vite scaffold with two renderer entries; security baseline; `npm run dev` opens the dashboard and companion windows
- 0.2 `@orbital/contracts` v1 (§2) + IPC map + zod; `@orbital/signals` v1 (about 30 signals)
- 0.3 SQLite spike (`node:sqlite` vs better-sqlite3) + repository + prefs (theme persistence)
- 0.4 Design tokens + app shell (sidebar nav, title bar with SIMULATED badge, mission-day footer)
- 0.5 CI script: `typecheck`, `vitest`, `lint`

### Phase 1: Parallel MVP (~8–10 h)
| Stream | Owner | Deliverables | Done when |
|---|---|---|---|
| **A** Frontend & design system | dev A | Shell, theme switch, `<OrbitalChart>`, metric tiles, provenance chip, Overview and Physical Health on fixture data | Both themes polished on Overview |
| **B** Synthetic data & sources | dev B | `simulation` (3 scenarios, seeded), `MissionClock`, `sim.v1` + `user.entry` adapters, `nasa.hrp` snapshot | 180 days generated <500 ms; tests pass |
| **C** Brain engine | dev C | P0–P4 + P6, detectors, rules, template explainer, test suite | Scenario ground-truth tests pass |
| **D** Gamification & companion | dev D | Companion window (drag, click-through, persistence, state machine, placeholders, menu), gamification core | Pet lives on the desktop; XP rules tested |

### Phase 2: Integration (~4 h)
Wire the engine to the Brain & Mental Health section; live telemetry; challenges UI; companion events; scenario switching end to end.

### Phase 3: Depth & polish (~6 h)
Health Report + PDF export, body map, ML advisory (Isolation Forest), OSDR adapter, onboarding companion picker, motion polish, accessibility pass.

### Phase 4: Ship (~2 h)
macOS packaging (`.dmg`), demo script (healthy → psych-deterioration walkthrough), README, `docs/decision-engine.md`, `docs/data-provenance.md`, `docs/limitations.md`.

### Coordination rules
- Each stream owns its directories (§1.2). Cross-stream changes go through `contracts` PRs only.
- A branch per stream, rebased on `main` at least every 2 h. `main` must always run.
- If subagents are used, they get one stream each, **after** Phase 0 has frozen the contracts.

---

## 11. Decisions needed from the team

1. **Approve the overall architecture**, in particular that main owns state and the npm-workspaces monorepo.
2. **ML is advisory only** (it can never change YES/NO). Recommended. The alternative is letting ML raise NO to YES when corroborated, which I advise against.
3. **Colour coding is baseline-relative by default**, with absolute ranges only when cited. Recommended.
4. **Who owns streams A–D**, and **what is our submission deadline?** That decides whether Phase 3 items are in or out.
5. Should git be initialised now? The directory isn't a repository yet.
