# Mochi · Architecture proposal

Status: **proposal, awaiting approval.** It builds on the existing Electron + TypeScript monorepo; most of the intelligence already exists and is tested.

## 1. Verified starting point (2026-11-15)

| Area | Reality, verified in code and the running app |
|---|---|
| Git | HEAD `9a24464` (Phase 3). Phase 4 is implemented but **uncommitted** (55 changed or untracked files, including the paused review harness). 201 → 209 tests passing; smoke passes in both themes |
| Desktop companion | Real transparent, frameless, always-on-top window (320×460). Drag, menu, sleep/wake, blink, tail swish, chat panel, positive-only events. Mochi (team artwork) plus dog, cat and alien placeholders as character packages (manifest v2) |
| Conversation | Deterministic dialogue engine, phrasebank and safety screen (`@orbital/companion`). Optional LLM rephrasing is **Anthropic API only, off by default** (`main/llm.ts`) |
| **Ollama / Qwen3** | **No integration exists in the codebase.** Ollama 0.40.16 and `qwen3:4b` (Q4_K_M, 2.5 GB) are installed on this Mac. Measured: about 22 tokens/s warm, 6.4 s cold load. **`think:false` and `/no_think` do not suppress the reasoning;** it arrives as ordinary content |
| SCND / Dr G Zero core | `@orbital/engine`: P0–P6 deterministic pipeline, confirmation rule, trend detector, Isolation Forest advisory (P5, frozen snapshot), intelligence report, alerts, patterns. Evaluated on held-out synthetic cohorts |
| Recommendations | `@orbital/recommendations`: consumes strict `ApprovedOutputs` (no ML), safety-first, restriction-aware |
| Gamification | `@orbital/gamification`: XP from completion only, adaptive slot, 9-stop route, 7 rooms, pet home, crew puzzle, team ship, two games with difficulty |
| Crew social | `CrewService`: voluntary statuses with audience control, simulated crewmates, companion-to-companion invitation messages. **This is a proto-Fable** |
| NASA knowledge | Offline cited HRP registry (17 risks), linked to alerts |
| Dashboard | 12-section React dashboard ("ORBITAL"); dense |
| Known gaps (Phase 4 review) | Journal mission "Open" leads to a page that can't create entries; "chat with your companion" opens settings, not chat; legacy cosy-evening slot duplicates adaptive recovery and hides exercise for CM-03; achievement line takes priority over suggestion in Mochi's opener |
| Packaging | **None.** No electron-builder config, no installer, no signing. Development and testing so far have been on macOS arm64 only |

## 2. Target architecture

```
┌──────────────────────────── Electron main process (the only integrator) ─────────────────────────────┐
│                                                                                                       │
│  ┌─ Mochi runtime ─────────────┐   ┌─ Dr G Zero ──────────────────────┐   ┌─ Fable ──────────────────┐  │
│  │ CompanionDirector (per pet) │   │ DataService (sim + user records) │   │ ConsentLedger            │  │
│  │ ConversationPipeline        │◀──┤ SCND engine (deterministic)      │   │ CoordinationEngine       │  │
│  │  safety → router → context  │   │ IntelligenceService (stats + ML) │──▶│ (proposals, matching)    │  │
│  │  → LocalModel → output guard│   │ RecommendationEngine             │   │ FableBus (transport)     │  │
│  │ JournalService · Memory     │   │ ReportService (weekly, SCND)     │   │ CrewAggregates           │  │
│  └─────────────┬───────────────┘   └───────────────┬──────────────────┘   └───────────┬──────────────┘  │
│                │      ┌─ Play ──────────────────┐  │                                   │                 │
│                │      │ GameService (pure rules)│◀─┘ approved recs only                │                 │
│                │      └─────────────────────────┘                                      │                 │
│  ┌─ Platform ──┴─────────────────────────────────────────────────────────────────────────┴────────────┐ │
│  │ LocalModelService (Ollama provider) · Storage (SQLite) · Prefs · ProfileManager · Setup/Health ·    │ │
│  │ WindowManager (overlay, chat, dashboard, setup) · ActivitySignals (opt-in idle time only) · IPC     │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────────────┘
        pet overlay window          chat bubble window             Dr G Zero window          first-run setup window
        (transparent, top, all     (anchored to pet, stream)      (dashboard, on request)   (system checks, Ollama)
         spaces, click-through)
```

### Boundaries (each a package with explicit zod contracts)

| Boundary | Package (proposed) | From today | Owns | Never touches |
|---|---|---|---|---|
| Contracts | `@mochi/contracts` | `@orbital/contracts` (renamed later; see migration) | All schemas, IPC map | — |
| Character packages | `assets/pets/<id>/manifest.json` + `@mochi/characters` | manifest v2 | Art, animations, expressions, personality, interaction rules | Health data |
| Mochi mind | `@mochi/companion` | `@orbital/companion` | Intent routing, safety screen, journal flow, prompt building, output guard | SCND decisions |
| Local model | `@mochi/local-model` (pure interface) + main `OllamaProvider` | new (replaces `llm.ts` as the default provider) | Health checks, streaming, model config | Journal unless the astronaut opted in for that turn; health values |
| Dr G Zero core | `@mochi/scnd` (= `@orbital/engine`) + `signals`, `simulation`, `data-sources` | existing | Assessments, reports, approved outputs | LLM |
| Recommendations | `@mochi/recommendations` | existing | Approved outputs → optional activities | ML output, journal |
| Play | `@mochi/gamification` | existing | Rewards, missions, exploration, habitat, pet progression | Body values |
| Fable | `@mochi/fable` (pure) + main `FableService` | new; absorbs `CrewService` logic | Consent ledger, proposals, matching, aggregates | Journals, raw health data, emotional states |
| Dashboard | renderer `dr-g-zero` | redesign of today's dashboard | Presentation only | Database (IPC only) |

## 3. Conversation pipeline (Mochi ↔ Ollama)

```
user text ─▶ (1) Safety screen ── urgent ─▶ fixed safety reply + human-support pathway (never the model)
              │ deterministic, on-device, runs first, every turn
              ▼
          (2) Intent router ── command ─▶ "open Dr G Zero", "weekly report", "hide", "play a game"… (deterministic actions)
              │               journal ─▶ JournalService flow (consent-first, user text stored verbatim)
              ▼               memory  ─▶ propose → astronaut confirms → store
          (3) Context builder: persona + style rules + last N turns of THIS profile + confirmed memories +
              titles of today's APPROVED recommendations + coarse context (time of day, rest day).
              Never: raw health values, SCND state, other astronauts' data, journal text (unless the
              astronaut is in an explicit "talk about my journal" turn).
              ▼
          (4) LocalModelService.stream(model, messages, {temperature, num_predict, stop})
              ▼
          (5) Output guard (streaming): drop reasoning, enforce ≤ 2 sentences / ~35 words and ≤ 1 question,
              block medical/diagnostic language, block invented recommendations, strip stage directions
              ▼
          (6) Chat bubble streams tokens; the turn is stored in this profile's history (deletable)
```

- **Model choice.** `qwen3:4b` is a hybrid *thinking* model, and on this Mac its reasoning cannot be switched off reliably. Proposed default: **a non-thinking Qwen3-4B instruct variant from the Ollama library**, to be verified in Phase C. The fallback is `qwen3:4b` with a streaming reasoning filter (discard everything up to and including `</think>`, cap tokens) and a per-model "reasoning style" setting. The model is chosen in settings, so it stays replaceable.
- **Latency budget.** First token in under 1.5 s warm, a full reply in under 3 s warm. Achieved with `keep_alive` on, the model pre-warmed at launch, short system prompt, `num_predict` of about 80, and streaming display.
- **When the model is unavailable** (not installed, not running, too slow): Mochi says "I'm in simple mode right now", visibly badged, and uses the existing deterministic phrasebank. Health checks retry in the background. **No template is ever presented as model output.** Each turn records `voice: 'model' | 'template' | 'safety'` (this field already exists).
- **Safety and decisions** never go through the model. The model can reword an approved recommendation, but only within a guard that checks the approved title is present and nothing new has been added.

## 4. Dr G Zero ↔ Mochi ↔ Fable data flow

```
records ─▶ Dr G Zero: SCND (YES/NO/INSUFFICIENT) + statistics + ML advisory ─▶ IntelligenceReport
                                    │
                                    ├─▶ ApprovedOutputs (strict, no ML) ─▶ Recommendations ─▶ Missions/Rewards
                                    │                                              │
                                    │                                              └─▶ Mochi: titles only (worded by the model, guarded)
                                    └─▶ Alerts: urgent → fixed copy, Mochi goes quiet; human review → private, the astronaut decides to share

Mochi ─(astronaut's explicit choices only)─▶ Fable: "open to puzzle tonight", "joined group exercise", "wants company (audience: Sofia)"
Fable ─▶ CoordinationEngine: match consenting people + compatible times + activity ─▶ proposal ─▶ each participant's Mochi
Fable ─▶ crew aggregates (counts per week, never per person) ─▶ Dr G Zero crew page
```

Fable never reads Dr G Zero's health outputs. A wellbeing recommendation such as "recreation" can make Mochi *ask* "Want me to see if anyone's up for a game?". Only the astronaut's "yes" creates a Fable intent.

## 5. Multiple companions and profiles

- **ProfileManager:** five demo profiles (internal IDs CM-01 to CM-05 kept for data and test continuity; display names and companions are configurable data). One active profile per install in normal use.
- **One CompanionDirector per visible pet.** Normal mode shows one pet, the active astronaut's. **Crew demo mode** (for the Space Apps demo) can show all five pets at once on one machine, so Fable conversations are visible.
- The intelligence engine is shared, never duplicated per pet.
- **Character manifest v3** (extends v2): `displayName`, `artwork` (layers/frames), `animations` (idle, blink, tail, sleep, play, happy, curious, listen, think), `expressions`, `reactions` (event → animation + optional line), `personality` (traits, humour level, verbosity, style examples for the prompt), `interaction` (menu, double-click, drag), `voice` (sign-off, interjections). Validated with zod in main.

## 6. Desktop overlay design

| Need | macOS | Windows x86_64 |
|---|---|---|
| Float above apps | `setAlwaysOnTop(true, 'floating')`; `'screen-saver'` level only in demo mode | `setAlwaysOnTop(true, 'screen-saver')` |
| All desktops / full-screen apps | `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` | n/a (no Spaces); full-screen exclusive apps may still cover it |
| Transparent and shaped | `transparent: true, frame: false, hasShadow: false` (already done) | Same; DWM composition required; test per-monitor DPI |
| Click-through except the pet | `setIgnoreMouseEvents(true, { forward: true })`, toggled by hit-testing the art's alpha mask | Same; `forward` is supported |
| Notifications without stealing focus | `showInactive()`, a bubble inside the overlay (no OS toast by default) | Same |
| Reacting to activity | `powerMonitor.getSystemIdleTime()`, lock/resume and display-sleep events: **opt-in, no keystroke or window-title capture** | Same API |
| Multiple monitors | Persist display ID + position; clamp to the work area on display change | Same |

## 7. Storage, IPC, security

- **Storage:** SQLite in main only. Every table is keyed by `subject_id`; profile deletion cascades. New tables: `chat_turns`, `fable_intents`, `fable_proposals`, `consents`, `model_settings`. The audit table stays append-only.
- **IPC:** zod-validated allow-list per window role; new roles `pet`, `chat`, `setup`. The pet and chat windows can never call Dr G Zero data channels; they can only request "open dashboard at section X".
- **Network:** main process only, `http://127.0.0.1:11434` (Ollama) plus optional explicitly enabled sources. Renderer CSP stays strict. No telemetry.
- **No microphone or camera in v1.** Any future sensor needs explicit permission and a visible indicator (see the privacy document).

## 8. Key trade-offs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| LLM placement | Local Ollama via main | Cloud API | Privacy, offline, demo independence; cost is speed and quality on small hardware |
| Thinking model | Non-thinking instruct variant (to verify) | `qwen3:4b` plus filter | Reasoning cannot be disabled on the installed build; a filter adds 10–20 s of hidden tokens |
| Fable transport | In-process bus with an interface | Real networked service now | All five demo astronauts run on one machine; the interface allows LAN/WebSocket later without changing the rules |
| Package rename | User-facing first, `@orbital/*` → `@mochi/*` in one mechanical commit later | Rename everything immediately | Avoids breaking 209 tests and history while the product changes |
| Dashboard | Rebuild home and IA, reuse components | Restyle all 12 sections | The reference's clarity comes from information architecture, not colour |
