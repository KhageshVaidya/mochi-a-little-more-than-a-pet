# Architecture

> **Dr G Zero thinks. Fable connects. Mochi brings it to life.**

Mochi is a single Electron desktop app. Everything runs on the user's computer: the companion, the wellbeing engine, the database and (optionally) the language model through Ollama.

```
┌──────────────────────────────── Your computer ────────────────────────────────┐
│                                                                                │
│   MOCHI  (companion and interaction layer)          DR G ZERO  (dashboard)     │
│   transparent always-on-top window                  opened from Mochi          │
│   chat · play · journal · memory · suggestions      SCND results · trends      │
│            │                                                 ▲                 │
│            ▼ typed, allow-listed IPC (zod-validated)          │                 │
│   ┌────────────────────────── Main process ───────────────────┴──────────────┐ │
│   │ Safety screen → deterministic router → prompt allow-list → model → guard │ │
│   │                                     │                                    │ │
│   │ SCND engine (deterministic) ── recommendations ── gamification           │ │
│   │ NASA HRP knowledge registry (offline)       Local SQLite (node:sqlite)   │ │
│   └─────────────────────────────────────┼────────────────────────────────────┘ │
│                                         ▼                                      │
│                      Ollama on 127.0.0.1 · Qwen3 4B (optional)                 │
│                                                                                │
│   FABLE (planned): companion-to-companion coordination of agreed activities    │
└────────────────────────────────────────────────────────────────────────────────┘
```

## The three layers

| Layer | Responsibility | Status |
|---|---|---|
| **Mochi** | The companion and interaction layer: desktop pet, chat, mini-games, private journal, confirmed memories, gentle suggestions, and the way into the dashboard ("open Dr G Zero", "show me my health"). | Implemented |
| **Dr G Zero** | SCND intelligence: personal baselines, data quality, statistical detection, the YES / NO / INSUFFICIENT DATA decision, recommendations, safety and explanations. Shown in the Dr G Zero dashboard. | Implemented |
| **Fable** | Coordination between companions for activities people opt into, sharing intents only. | Precursor implemented (voluntary statuses, invitations, crew puzzles on one computer). Full layer planned: [fable-architecture.md](fable-architecture.md) |

## How a conversation turn works

1. **Safety screen** first. Requests for help get a fixed, serious reply and the human-support pathway. They never reach a model.
2. **Deterministic router**: commands ("open Dr G Zero"), journal prompts and memory confirmations are handled in code.
3. **Prompt allow-list** (`packages/companion/src/prompt.ts`): only persona, coarse context, approved suggestion titles, confirmed memories and ordinary chat turns. Journal text, health values, SCND results and safety turns cannot enter.
4. **Model**: Ollama on loopback (default `qwen3:4b-instruct-2507-q4_K_M`, configurable), streamed.
5. **Output guard** (`packages/companion/src/guard.ts`): strips reasoning, enforces length and one question, blocks clinical language. If anything fails, Mochi falls back to a built-in reply in **simple mode**, which is always labelled.

## How Dr G Zero reaches a decision

Data collection → personal baseline (days 10–37, robust spread) → data quality (exclusions, coverage ≥ 0.7, ≥ 5 reliable domains) → statistical detection (persistence, EWMA and CUSUM must agree) → SCND rules (≥ 2 core domains, or one strong domain on ≥ 10 of 14 days at z ≥ 2, confirmed over 3 days) → recommendation → Mochi words it kindly.

An Isolation Forest and a trend detector add **advisory** insight but can never change the decision. Details: [scnd-technical-explanation.md](scnd-technical-explanation.md), [phase-4-intelligence-design.md](phase-4-intelligence-design.md).

## Code map

| Path | Contents |
|---|---|
| `packages/contracts` | Shared types and zod schemas (records, signals, assessments, IPC, preferences, companion, gamification) |
| `packages/signals` | Signal registry |
| `packages/simulation` | Five fictional crew members, 180-day synthetic missions |
| `packages/data-sources` | Synthetic data and the offline NASA HRP knowledge registry |
| `packages/engine` | SCND engine, trend detector, Isolation Forest advisory |
| `packages/recommendations` | Recommendation selection and wording rules |
| `packages/gamification` | Missions, progression, exploration, habitat, crew goals |
| `packages/companion` | Router, safety screen, prompt allow-list, output guard, phrasebank |
| `apps/desktop` | Electron main process (storage, IPC, AI service), preloads, Dr G Zero and companion renderers |
| `site/` | GitHub Pages landing page |
| `presentation/` | 7-slide deck source and exports |

Technology: Electron 45, React 19, TypeScript, zod 4, vitest, electron-vite, electron-builder. The internal package scope `@orbital/*` is from the project's earlier name.

## Security boundaries

- Renderers are sandboxed with context isolation and no Node integration. Preloads expose an allow-listed, typed IPC surface; the main process validates every payload with zod.
- The AI client only talks to loopback addresses and only pulls configured models.
- See [PRIVACY.md](PRIVACY.md) and [../SECURITY.md](../SECURITY.md).

## Further reading

[mochi-architecture.md](mochi-architecture.md) (detailed target architecture) · [architecture-plan.md](architecture-plan.md) · [decisions.md](decisions.md) · [companion-architecture.md](companion-architecture.md) · [gamification-design.md](gamification-design.md)
