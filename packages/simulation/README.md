# @orbital/simulation

**Owner:** Workstream B — Synthetic health data & NASA integration

180-day seeded mission generator: latent-state model, three scenarios (healthy-adaptation, physical-deterioration, psych-deterioration), realistic gaps/artefacts, lazy intraday telemetry. Emits `HealthRecord[]` with `source.kind = 'synthetic'`. Design: docs/architecture-plan.md §5.

Rules:
- Pure TypeScript. No Electron, DOM or filesystem imports (keeps it testable and deterministic).
- Import shared types from `@orbital/contracts`; never redefine them. Contract changes go through the integration lead.
- Tests live in `test/` and run with `npm test` from the repo root.
