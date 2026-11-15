# @orbital/gamification

**Owner:** Workstream D — Gamification & desktop companion

Hybrid engagement layer: objectives, XP, levels, achievements, adaptive missions, cognitive games, cooperative crew challenges and a space-exploration journey. Invariants in `@orbital/contracts/gamification`. Design: docs/architecture-plan.md §9.

Rules:
- Pure TypeScript. No Electron, DOM or filesystem imports (keeps it testable and deterministic).
- Import shared types from `@orbital/contracts`; never redefine them. Contract changes go through the integration lead.
- Tests live in `test/` and run with `npm test` from the repo root.
