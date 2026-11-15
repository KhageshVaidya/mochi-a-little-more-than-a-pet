# @orbital/engine

**Owner:** Workstream C — Brain health intelligence engine

SCND-inspired deterministic decision engine: P0 safety → P1 data quality → P2 sufficiency → P3 detectors (z, EWMA, CUSUM, change point) → P4 rules → P5 ML advisory (cannot change state) → P6 assembly. Implements the interfaces in `@orbital/contracts/engine`. Design: docs/architecture-plan.md §4.

Rules:
- Pure TypeScript. No Electron, DOM or filesystem imports (keeps it testable and deterministic).
- Import shared types from `@orbital/contracts`; never redefine them. Contract changes go through the integration lead.
- Tests live in `test/` and run with `npm test` from the repo root.
