# Companion Architecture (Phase 2)

## 1. Audit: what exists (2026-11-15)

| Part | Where | State |
|---|---|---|
| Independent transparent overlay window, drag, click-through, per-display position persistence | `apps/desktop/src/main/windows.ts`, `index.ts` | Working, smoke-tested |
| Character package v1 (`manifest.json`, zod-validated) | `assets/pets/mochi/`, `contracts/src/companion.ts`, `main/companion-assets.ts` | Mochi only |
| Read-only `orbital-asset://` protocol | `main/companion-assets.ts` | Tested: traversal, extensions, symlinks |
| Behaviour: menu, sleep/wake, auto-nap, idle bounce, positive-only events | `renderer/companion/src/Companion.tsx` | Working |
| Artwork | `mochi.png` cutout of the untouched `mochi-reference.jpg` | **Bug (A1):** the enclosed white tail-tip patch was preserved, but the team wants it filled with fur colour |
| Conversation, journal, memory, LLM | — | Not present |

## 2. Character packages v2

```
assets/pets/<id>/
  manifest.json        schemaVersion 2
  <artwork files>      PNG layers (raster rigs) or SVG state images (vector rigs)
```

A manifest declares:
- **identity:** `id`, `displayName`, `species`, `official`, `placeholder` (true when the artwork is not team-supplied)
- **artwork + display box:** contain-fitted and bottom-anchored. Never stretched.
- **`rig`:** how the character is animated without redrawing it
  - `raster-layered` (Mochi): a body layer, an optional tail layer with a pivot (the tail rotates on its own), and eye positions for blink lids sampled from the fur colour.
  - `svg-states` (dog, cat, alien): one SVG per state (idle, sleep, happy). Each SVG animates its own parts internally (tail, ears, eyelids, antenna).
- **`motion`:** a species motion profile, so each species moves differently (§3)
- **`animations`:** the state → definition map (unchanged from v1, so existing code keeps working)
- **`interactions`, `personality`:** menu, auto-nap, idle cadence, traits, and a **phrasebank** (§4)

New expressions later = new PNG/SVG files referenced from the manifest. No code change.

## 3. Animation system

| Species | Idle | Tail / body | Blink | Happy / celebrate | Sleep |
|---|---|---|---|---|---|
| Mochi (raster) | float + breathe | tail layer swings ±6° about its base | fur-coloured lid overlay over the drawn eyes, every 3–6 s | hop + sparkles; curious tilt (whole-figure ±3°, since the head isn't a separate layer) | slow breathe, z's |
| Dog (svg) | panting chest + head bob | fast tail wag (±20°, 0.35 s) | eyelids | bouncy double hop, ears up | curled breathing |
| Cat (svg) | slow sway | tail S-curl (slow) | slow blink | stretch then hop | loaf pose breathing |
| Alien (svg) | hover bob (no ground contact) | antenna glow pulse + sway | eyelids | spin-hop + glow | dimmed hover |

All motion is transform-only and respects `prefers-reduced-motion`.

## 4. Conversation engine: `@orbital/companion` (pure TS)

```
user text / UI action ──► SafetyScreen ──(urgent)──► fixed, non-playful human-support script + EscalationEvent
                     │
                     └─► IntentRouter (rules) ──► DialoguePolicy (state machine: chat | check-in | journal | suggestion)
                                                   │
                                     CompanionContext (coarse facts only)
                                                   │
                         Phrasebank (template variation, no-repeat memory)  ──►  reply
                                                   │ optional
                         LanguageModel provider (rephrase / small talk, constrained) ──► reply (or template on failure)
```

- **SafetyScreen runs first, on device, and is deterministic.** Phrases indicating risk of harm or an urgent need for help bypass personality, games and the LLM. They produce a fixed message, open the human-support pathway (P0) and log an audit event. **Never playful.**
- **CompanionContext** holds coarse, derived facts only: `sleepBelowUsual`, `activityBelowUsual`, `measurementDue`, `exerciseDoneToday`, `restDay`, `achievementsToday`, `timeOfDay`, the astronaut's first name, and remembered preferences the user approved. **No raw values, no journal text, no assessment state.**
- **Unsolicited advice is rate-limited** (one suggestion per 90 minutes, per type, at most) and is never offered while an alert is active.
- **Phrasebank:** per-companion message variants with slot fillers; it avoids repeating the last 5 lines per category.

### 4.1 Language-model providers (main process only)

```ts
interface CompanionLanguageModel {
  id: 'templates' | 'anthropic-small' | 'anthropic-deep';
  available(): Promise<boolean>;
  reply(req: { persona: Persona; turns: ChatTurn[]; context: SharedContext }, signal: AbortSignal): Promise<string>;
}
```

| Provider | Model (configurable; checked against the Models API at startup) | Use |
|---|---|---|
| `templates` (default, always available) | none | All behaviour works offline and deterministically |
| `anthropic-small` | `claude-haiku-5-5`, effort `low` | Ordinary chat phrasing, ≤ 2.5 s timeout |
| `anthropic-deep` | `claude-opus-5-5`, effort `medium`, server-side refusal fallback | Reserved for future complex reasoning; off by default |

**Rules:**
- The LLM is **off by default**, and the user must enable it explicitly.
- Only the current conversation turns and the persona are sent. **Journal entries, memory items, health values and assessment results are never sent.** No consent tier exists for that, because no approved privacy architecture exists yet.
- Any failure, timeout or refusal falls back to templates.
- The LLM never creates, suppresses or changes an alert or an SCND decision. It only produces companion wording, after deterministic routing has already decided the intent.

## 5. Journal & memory

| Store (SQLite) | Contents | Provenance tags |
|---|---|---|
| `journal_entries` | day, Q&A turns, user-picked feelings, user-described events, optional summary | `reported-emotion` · `reported-event` · `model-summary` (labelled, editable) · `model-possibility` (never shown as fact; the user can confirm or dismiss) |
| `memory_items` | preference, favourite game, interest, goal, previously suggested activity, companion preference | `user-stated` or `user-confirmed`; nothing is stored silently |

- The user can skip questions, end early, edit, delete, view history, export (Markdown/JSON via a save dialog) and disable journaling.
- The journal is **never** visible in crew views, never sent to an LLM, and never used by SCND unless the user turns on "share structured check-in answers with the wellbeing monitor". That setting is off by default, and even then free text is never parsed for clinical meaning.

## 6. APIs (IPC, zod-validated)

`companion:catalog` · `companion:manifest` · `companion:emit` · `companion:chat` (send → reply) · `companion:checkin` · `journal:list/get/save/delete/export` · `memory:list/save/delete` · `llm:status` / `llm:configure`.
