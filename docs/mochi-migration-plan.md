# Mochi · Migration plan from ORBITAL

Status: **proposal, awaiting approval.** Nothing has been renamed or moved yet.

## 0. Before anything else (needs your approval)

1. **Commit Phase 4 as it stands** (one checkpoint commit), so the transformation starts from a clean, recoverable base. The paused review harness (`apps/desktop/src/main/review.ts`, `scripts/review.mjs` and the 2-line hook in `index.ts`) can either be committed as dev tooling or kept out. `.review/` output and `.review-run.log` should go into `.gitignore`, not into Git. Recommendation: commit the harness, ignore its output.
2. **Branch:** create `mochi/transformation` from that commit. Each roadmap phase is reviewed, then merged.
3. No rewinds, resets, cleans or history rewrites. Original artwork (`mochi-reference.jpg`, SHA-pinned) and research documents are untouched.

## 1. Reuse matrix

| Existing piece | Verdict | Notes |
|---|---|---|
| Contracts (zod schemas, IPC allow-list) | **Keep**, extend | Add pet/chat/setup roles; chat turns, Fable, consent and model-settings schemas |
| Signals registry, simulation, cohorts | **Keep** | Synthetic data stays labelled; profile display names change via data |
| SCND engine (P0–P6, confirmation rule, trend, Isolation Forest, report) | **Keep unchanged**: this is Dr G Zero's core | Only naming and docs change |
| NASA HRP registry | **Keep** | Moves into "Data sources & research references" |
| Recommendations | **Keep** | Add journal-consented and Fable-derived *suggestion kinds* later (still approved-only) |
| Gamification | **Keep, extend** | Pet progression (animations, expressions), wellbeing missions (hydration and others), crew missions via Fable. Fix the legacy cosy-evening slot conflict |
| Companion window and character packages | **Keep, extend** | Manifest v3 (expressions, reactions, personality prompt fields); overlay improvements (all workspaces, alpha hit-testing, separate chat bubble window) |
| Dialogue engine, phrasebank, safety screen | **Keep as the deterministic layer** | Becomes the router and fallback around the model, not the main voice |
| `main/llm.ts` (Anthropic rephraser) | **Redesign** | Becomes one provider behind the `LocalModel` interface; **Ollama becomes the default** and Anthropic is optional or removed (decision) |
| Journal and memory | **Keep, redesign UX** | Create entries from the dashboard, edit and delete, summaries, themes; consent ledger |
| CrewService | **Redesign → Fable** | Its consent rules (audience, personal space, logistics-only messages) are the seed of Fable's rules |
| Dashboard (12 sections) | **Redesign** | New information architecture: 8-tile home and 8 detail areas; reuse charts, body map, intelligence panel, knowledge browser, games |
| Smoke and review harnesses | **Keep** | Update assertions to the new IA; review harness stays opt-in and short |
| Docs: research, decisions, phase reports | **Keep as history** | Add a one-line rename note at the top; no rewriting |

## 2. Rename strategy (ORBITAL → Mochi / Dr G Zero / Fable)

241 occurrences of "ORBITAL" were found across code and docs. They're handled in three passes:

| Pass | Scope | Risk |
|---|---|---|
| 1. User-facing | Window titles, app menu, dashboard header and copy, companion lines, setup screens, `productName`, `appId` (`space.mochi.app`), README | Low; covered by smoke assertions |
| 2. Internal identifiers | Package scope `@orbital/*` → `@mochi/*`, CSS token prefix, `window.orbital` bridge → `window.mochi` / `window.drg`, custom protocol `orbital-asset://` → `mochi-asset://` | Medium; one mechanical commit, full test and smoke run, no behaviour change |
| 3. Documents | New `mochi-*` docs; historical docs keep "ORBITAL" plus a rename note | None |

**User data path.** Electron's `userData` folder follows the app name. On first launch of Mochi, detect an existing ORBITAL profile folder and copy (not move) its SQLite database into the new location. Report the copy in the setup screen.

## 3. Profiles

| Internal ID (kept) | Public display name · scenario | Companion |
|---|---|---|
| CM-01 | Alex Morgan · healthy adaptation | Mochi (default) |
| CM-02 | Maya Chen · sleep disruption | Comet (dog, original) |
| CM-03 | Daniel Reed · physical deconditioning | Cat (original) |
| CM-04 | Sofia Patel · wellbeing change | Alien (original) |
| CM-05 | James Wilson · incomplete telemetry | New original companion (planned) |

A git-ignored local file may relabel profiles for a private demonstration; it is never packaged or published.

Scenarios, seeds and all tests stay keyed to CM-01 to CM-05, so the renaming is pure data. Each profile already has separate journal, memory, chat sessions, engagement events and progression keyed by `subject_id`. The pet window must switch with the profile, which it does not do today: the companion selection is global.

## 4. Known bugs to fix during migration (from the Phase 4 review)

1. "Journal moment" → the Journal page has no "new entry". Add composition in the dashboard and in Mochi's chat.
2. "Chat with your companion" mission → opens settings. It should open Mochi's chat bubble.
3. The legacy `sleepBelowUsual → cosy evening` slot duplicates the adaptive recovery mission and hides prescribed exercise. Remove the legacy substitution and let adaptive missions handle it.
4. Mochi's opener ranks "achievement today" above the approved suggestion. Merge the two into one line.
5. The pet's companion choice isn't per profile.
6. The `.review/` output isn't ignored by Git.

## 5. What gets deleted

Nothing in this migration deletes working features. The only removals are the legacy cosy-evening substitution (§4.3) and, if you decide so, the Anthropic provider (kept behind the interface by default).
