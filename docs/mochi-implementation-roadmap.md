# Mochi · Implementation roadmap

Status: **proposal, awaiting approval.** Each phase ends with tests run, a short demo (screenshots or a live run), and your review before the next phase starts. Nothing is committed without your approval.

Legend: **Exists** = in the repo and verified · **Modify** = change existing code · **New** = genuinely new.

---

## Phase A — Rebranding and architecture

- **Exists:** all ORBITAL code (241 name occurrences), contracts, IPC allow-list, package structure.
- **Modify:**
  - user-facing names (Mochi / Dr G Zero / Fable), `productName`, `appId`, menus, window titles, setup copy, README;
  - rename notes at the top of historical docs;
  - `.gitignore` for review output;
  - new IPC roles (`pet`, `chat`, `setup`) declared but unused;
  - profile display data made configurable (names per the IP decision).
- **New:** `@mochi/*` package scope (one mechanical commit); userData migration (copy ORBITAL DB on first run).
- **Tests:** all 209 existing tests unchanged and green; a new test that no user-facing string contains "ORBITAL" (allow-list for historical docs); a userData migration test (temp dirs).
- **Acceptance:** the app launches as "Mochi — A Little More Than a Pet"; the dashboard header reads "Dr G Zero"; smoke passes in both themes; history intact.
- **Privacy/security:** no data-flow changes; migration copies, never moves; DB stays local.

## Phase B — Desktop-first Mochi

- **Exists:** transparent always-on-top pet window, drag, menu, sleep/wake, blink, tail, chat panel, positive events, placeholders.
- **Modify:**
  - launch order (pet first; dashboard hidden until asked);
  - tray/menu-bar item to recall a hidden pet;
  - pet follows the active profile;
  - chat moves into its own anchored bubble window;
  - mission "Open" actions open Mochi's chat (bug fix).
- **New:**
  - all workspaces and full-screen visibility (macOS);
  - alpha-mask click-through;
  - multi-monitor persistence;
  - manifest v3 (expressions, reactions, personality prompt fields);
  - optional "react to my activity" (idle time only);
  - crew demo mode (five pets at once);
  - "open Dr G Zero at section X" commands from the pet.
- **Tests:**
  - manifest v3 validation;
  - window-role IPC denial (pet cannot read data);
  - smoke: pet visible before the dashboard;
  - click-through toggles over transparent pixels;
  - profile switch swaps the pet;
  - command routing ("show me my health" → dashboard/physical).
- **Acceptance:** fresh launch shows only Mochi; drag, hide and recall work; clicking opens chat; "Open Dr G Zero" opens the dashboard; transparent pixels pass clicks through on macOS. Windows is verified only once tested on Windows.
- **Privacy/security:** activity reaction is off by default; no sensors.

## Phase C — Real Ollama / Qwen3 integration

- **Exists:** a `CompanionLanguageModel` interface, eligibility rules, safety-first routing, `voice` labelling; Ollama 0.40.16 and `qwen3:4b` installed on the dev Mac. **No Ollama code.**
- **Modify:** `llm.ts` becomes a provider registry; Anthropic stays optional (decision); the model replies directly in chat mode (not only rephrasing), within the pipeline.
- **New:**
  - `OllamaProvider`: health check (`/api/version`, `/api/tags`), streaming `/api/chat`, keep-alive and pre-warm, timeouts and cancellation;
  - model and temperature settings;
  - reasoning filter;
  - output guard (length, one question, banned clinical language, no stage directions, no unapproved suggestions);
  - "simple mode" badge when unavailable;
  - streaming bubble UI;
  - setup screen section: detect, install instructions, `ollama pull <model>` with progress.
- **Tests:**
  - provider against a fake HTTP server (stream parsing, timeouts, errors, reasoning stripping);
  - guard unit tests (≥ 30 adversarial cases);
  - a **live integration test** against local Ollama (skipped with a reason if Ollama is absent; never faked);
  - latency measured and reported (first token, full reply);
  - transcript tests for the conversation style example in the brief.
- **Acceptance:** with Ollama running, Mochi's replies are model-generated (labelled `voice: model`), streamed, ≤ 35 words, no visible reasoning, first token < 1.5 s warm on this Mac. With Ollama stopped, a "simple mode" badge appears and nothing claims to be AI. The safety phrase never reaches the model (tested).
- **Privacy/security:** loopback only; context builder enforces the "never" list; turn-level consent for journal context.
- **Model decision:** verify a non-thinking Qwen3-4B instruct tag in the Ollama library. Otherwise keep `qwen3:4b` plus filter and accept the latency.

## Phase D — Journal and conversational intelligence

- **Exists:** journal flow in chat, provenance labels, memory proposals, export, privacy rules.
- **Modify:** create, edit and delete entries in the dashboard (bug fix); contextual journal invitations (time, last asked, declines, rest day); "wants space" detection (deterministic cues plus snooze).
- **New:** summaries of past entries (model, labelled, on demand); recurring themes and mood trend with uncertainty (Journal analytics, hypotheses only); per-profile chat history browser with deletion; consent ledger UI.
- **Tests:** consent required before storage; user text stored verbatim; generated summaries labelled and separate; deletion cascades; no journal text in model context without turn consent; invitation rate-limits; "leave me alone" → snooze honoured.
- **Acceptance:** the conversation example in the brief works end-to-end with the real model; a journal entry can be made, edited and deleted from both places; analytics show "based on N entries" with uncertainty.
- **Privacy/security:** journal-derived signals off by default and never a YES driver.

## Phase E — SCND integration and reporting (Dr G Zero)

- **Exists:** full SCND pipeline, intelligence report, alerts, knowledge links, evaluation.
- **Modify:** a report page in plain language: what was detected, contributing parameters, change from baseline, evidence, what's uncertain, recommended action; a weekly report; the five information classes on every value.
- **New:** optional consented signals (journal-derived, communication-pattern counts) as **hypothesis inputs only**; "What changed this week?" summary (deterministic text first, model wording optional and guarded).
- **Tests:** the report renders every required element for all five profiles; hypotheses never change state; weekly report deterministic; all existing SCND tests green.
- **Acceptance:** for each profile, someone non-technical can say what was found, why, and what to do, from one screen.
- **Privacy/security:** unchanged decision boundary; consented inputs are logged in the ledger.

## Phase F — Fable crew coordination

- **Exists:** CrewService (voluntary statuses, audience, personal space, simulated crewmates, companion invitation lines), crew puzzle, team ship.
- **Modify:** CrewService logic moves into `@mochi/fable` (pure) and a main-process `FableService`.
- **New:**
  - `FableBus` (in-process transport, interface ready for LAN);
  - consent ledger;
  - intents (activity, time window, audience, expiry);
  - matching engine (shared puzzle, group exercise, meal, recreation, experiment pairing, "wants company" with an audience);
  - proposals delivered to each participant's Mochi;
  - accept/decline;
  - crew demo mode showing pets coordinating;
  - Fable-off switch.
- **Tests:** a property test that no proposal or message payload contains journal, chat, health or SCND fields (schema-level); personal space never invited; opt-outs honoured; expiry; aggregates contain no per-person data; deterministic matching.
- **Acceptance:** in demo mode, Alex (CM-01) and Maya (CM-02) both opt in to a puzzle; Fable proposes it; both pets suggest it independently; the crew puzzle progresses.
- **Privacy/security:** Fable reads only the consent ledger and intents, never Dr G Zero.

## Phase G — Gamification and missions

- **Exists:** XP and levels, adaptive slot, route and map, rooms, pet home, crew puzzle and ship, two games with difficulty and history, invariants tests.
- **Modify:** remove the legacy cosy-evening conflict (bug fix); wellbeing missions (hydration, sleep routine, relaxation, measurement, journaling, social), still completion-only; Fable-backed crew missions.
- **New:** pet progression (unlockable animations and expressions in manifest v3); collectibles and furniture; one more short recreational game; team progression.
- **Tests:** all existing invariants (no biology, no penalties, rest counts, no health competition, deterioration not rewarded, safety overrides) extended to new missions; a negative-report test (reporting symptoms earns nothing extra).
- **Acceptance:** the game works with the pet hidden; all rules tested; screenshots in both themes.
- **Privacy/security:** crew views remain totals only.

## Phase H — Minimal Dr G Zero dashboard

- **Exists:** 12 sections, chart components, body map, intelligence panel, knowledge browser, games UI, light and dark tokens.
- **Modify:** a new information architecture.
  - **Home:** eight tiles (crew overview, mission timeline, wellbeing status, SCND summary, active recommendations, data completeness, alerts, crew activity).
  - **Detail areas:** Physical, Brain & wellbeing, Crew wellbeing, SCND intelligence, Mission progress, Gamification, Journal analytics, Data sources & references.
  - **Shared patterns:** the four-level status vocabulary, baseline-band charts with "what this means" and a table view.
- **New:** deep links from Mochi commands; expandable report cards.
- **Tests:** smoke assertions per area; each home tile links to its detail area; "show me my health" opens Physical; a11y checks (status never by colour alone).
- **Acceptance:** a first-time viewer understands the crew's state in under 30 seconds; no metric dump on the home screen; both themes.

## Phase I — Cross-platform installation and GitHub release

- **Exists:** nothing (no packaging).
- **New:**
  - electron-builder config: macOS (dmg, arm64 + x64, then universal) and Windows (NSIS, x64);
  - first-run setup: system check (OS, architecture, RAM ≥ 8 GB recommended, disk ≥ 4 GB free), Ollama detection, guided install link (we don't silently install system software), `ollama pull` with progress, model warm-up, then Mochi appears;
  - code signing and notarisation plan (needs an Apple Developer ID; Windows signing certificate optional, SmartScreen warning documented);
  - public README with screenshots, architecture, install, troubleshooting, privacy;
  - a CI workflow to build artefacts.
- **Tests:** a build matrix; a smoke run of the packaged app on macOS (this machine); **Windows x86_64 must be tested on a real Windows machine or VM before any claim**; a clean-machine install checklist.
- **Acceptance:** a downloaded installer on a clean Mac shows Mochi chatting through Qwen3 after setup. The Windows status is reported exactly as tested.
- **Privacy/security:** no model weights in the repo or installer; checksum verification for downloads; release notes list data locations.

---

## First milestone: "M1 — Mochi lives on the desktop and really talks" (proposed)

Scope (Phases A + B core + C core), small enough to demo live:

1. **Commit Phase 4** (with your approval) and branch `mochi/transformation`.
2. **Rebrand, user-facing pass:** Mochi / Dr G Zero names in the app; the five profiles' display names per your IP decision; the pet follows the active profile.
3. **Desktop-first launch:** only Mochi appears on start; tray item to show or hide; click opens chat; "Open Dr G Zero" / "show me my health" open the existing dashboard (not yet redesigned) at the right section.
4. **Real Ollama chat:** health check, streaming replies from the local model, reasoning filter and output guard, short-reply style, "simple mode" badge when Ollama is unavailable, model and temperature settings.
5. **Fixes:** the "chat with your companion" and "journal moment" mission links.
6. **Evidence:** a live demo on your Mac, short screenshots in both themes (not a long walkthrough), latency numbers, and tests (fake-server provider tests plus one live Ollama test).

**Explicitly not in M1:** Fable, dashboard redesign, new artwork, installers, journal analytics.

## Decisions needed from you before M1

1. **Commit Phase 4 now?** Recommended: yes, including the review harness, with its output in `.gitignore`.
2. **Demo identities and IP:** decided. The public build uses original fictional names and original artwork; any private relabelling stays in a git-ignored local file.
3. **Model:** try a non-thinking Qwen3-4B instruct variant as the default, keeping `qwen3:4b` plus filter as the fallback. Recommended: yes.
4. **Anthropic provider:** keep as an optional provider behind the interface, or remove? Recommended: keep, off by default.
5. **Internal package rename** (`@orbital/*` → `@mochi/*`): in Phase A, or defer until after M1? Recommended: defer, to keep M1 focused.
