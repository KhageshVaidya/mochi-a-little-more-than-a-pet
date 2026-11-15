# @orbital/data-sources

**Owner:** Workstream B — Synthetic health data & NASA integration

Implements `RecordSource` / `ReferenceSource` adapters: `sim.v1`, `user.entry`, `nasa.hrp` (curated, cited offline snapshot), `nasa.osdr` (optional, online, metadata only). Design: docs/architecture-plan.md §8.

Rules:
- Pure TypeScript. No Electron, DOM or filesystem imports (keeps it testable and deterministic).
- Import shared types from `@orbital/contracts`; never redefine them. Contract changes go through the integration lead.
- Tests live in `test/` and run with `npm test` from the repo root.
