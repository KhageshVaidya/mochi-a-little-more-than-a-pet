# ORBITAL

**Understand your health. Protect your mission.**

A standalone desktop health-intelligence app for astronauts on long-duration missions. Built for the NASA Space Apps Challenge 2026: *Create Health Monitoring Software for Astronauts on Space Missions*.

> ⚠️ ORBITAL is a research demonstrator. It does **not** diagnose, and every physiological value in this build is **synthetic** and labelled as such.

## Quick start

Requirements: macOS, Node ≥ 22.13.

```bash
npm install
npm run dev        # launch with hot reload (dashboard + desktop companion)
npm run check      # typecheck all projects + unit tests
npm run smoke      # build, launch the real app in light & dark, verify security/IPC/SQLite/crew/companion, save screenshots
npm run artwork:cutout -- <in.jpg> <out.png>   # transparent cutout for new companion artwork (preserves enclosed whites)
```

## Repository layout

```
packages/contracts     shared types + zod schemas (records, signals, assessments, IPC, companion, gamification)
packages/signals       signal registry, the engine's expandable "board"
packages/simulation    five-profile 180-day synthetic mission generator (Workstream B)
packages/data-sources  synthetic / user / NASA HRP / OSDR adapters  (Workstream B)
packages/engine        SCND-style deterministic wellbeing engine    (Workstream C)
packages/gamification  missions, XP, habitat, exploration, coop goals (Workstream D/E)
packages/companion     deterministic conversation engine & safety screen (Workstream B)
apps/desktop           Electron app: main (data service, IPC), preloads, dashboard and companion renderers
tests/integration      end-to-end scenario tests (simulation × engine)
docs/                  research review, GitHub research, architecture plan, decisions, workstreams
```

## Documentation

- [Research review](docs/research-review.md)
- [GitHub & library research](docs/github-research.md)
- [Architecture plan](docs/architecture-plan.md)
- [Decision log](docs/decisions.md)
- [Workstreams & ownership](docs/workstreams.md)
- [Synthetic crew & scenarios](docs/synthetic-scenarios.md)

## Status

- **Phase 0 (foundation): complete.** Electron shell, independent transparent companion window, hardened IPC, shared contracts, design system (light/dark), local SQLite.
- **Phase 0.5 (five-astronaut simulation): complete.** Five fictional crew members with reproducible 180-day synthetic histories, a deterministic Brain Health engine, and populated Overview, Crew, Physical Health, Brain & Mental Health, Live Telemetry and Health Reports. See [synthetic scenarios](docs/synthetic-scenarios.md).
- **Mochi, the official desktop companion: integrated.** Transparent cutout of the team's artwork, character-package manifests, menu, sleep/wake, celebrations and positive-only engagement events. See decision D-014.
- **Phase 2 (companion intelligence, gamification, crew wellbeing): implemented.** Corrected Mochi artwork with a blink/tail rig; dog, cat and alien (placeholder art); deterministic companion conversation with an optional small language model; a private journal and memory; tiered alerts with an append-only audit log; wellbeing pattern analysis; a layered body map; a gamification engine (missions, habitat, exploration, cooperative crew goals, two cognitive games); and voluntary crew activities. Design docs: [companion](docs/companion-architecture.md) · [SCND](docs/scnd-technical-explanation.md) · [gamification](docs/gamification-design.md) · [privacy & crew](docs/privacy-and-crew-wellbeing.md).
- Phase 3: offline, cited NASA HRP risk knowledge registry linked to alerts and a NASA Research & Risk Knowledge section (docs/nasa-hrp-integration.md).
- Phase 4: hybrid intelligence (statistics + advisory Isolation Forest, evaluated on held-out synthetic cohorts) and adaptive gamification (recommendations → optional missions, solar-system exploration, habitat, pet home, games with difficulty, crew cooperation). See docs/phase-4-*.md.
- Next (after review): Phase 5 / packaging.
