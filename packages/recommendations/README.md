# @orbital/recommendations

Phase 4 recommendation engine. Pure TypeScript.

`recommend(approved, ctx) → RecommendationSet` turns the decision engine's **ApprovedOutputs** into optional, explained activity recommendations. It never sees ML output, journal text or raw health values. Design: docs/phase-4-intelligence-design.md §5, docs/phase-4-adaptive-gamification.md.
