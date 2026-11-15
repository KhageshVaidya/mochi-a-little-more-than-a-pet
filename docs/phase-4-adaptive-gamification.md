# ORBITAL — Phase 4 adaptive gamification

Phase 4 extends the existing `@orbital/gamification` engine. It is not a second engine. Everything is pure and deterministic, and is evaluated in the main process (`game-service.ts`).

## 1. Reward architecture (rules, all tested)

| Rule | How it is enforced |
|---|---|
| XP for participation and completion, never biology | `evaluateProgress(subject, events, day, opts)` receives **completion facts** only, with no health records (tested on the function's signature). Exercise XP is capped at the prescription |
| Rest and recovery count | `rest.day` 30 XP, `recovery.session`/`mindfulness.session` 25 XP; rest days and recovery feed exploration and room unlocks |
| Asking for support counts | `help.requested` 20 XP, achievement "Reaching out", counts as a *connection* point, and completes the human-support adaptive mission |
| Missing activities never remove rewards | No negative XP, no decay, no streaks. Tested: XP and unlocks are monotonic over 40 days with gaps |
| Deterioration is never rewarded | An adaptive mission **replaces** the rotating daily slot (same +10 bonus), so 3 daily missions are always on offer. Tested: maximum achievable XP is identical with or without each of the 13 recommendation kinds |
| No public mental-health leaderboard | Crew mechanics show crew totals only; no per-person fields (tested) |
| No manipulative notifications | The companion mentions a new suggestion only if reminders are on, at most once every 20 minutes, with "only if it sounds nice" wording |

New completion facts: `movement.break` 15 XP, `journal.written` 20, `companion.chat` 10, `recreation.session` 20, `crew-puzzle.contributed` 10, `companion.played` 5. All have daily caps. Journal and chat facts are recorded once per day and never depend on *what* was written or said.

## 2. Adaptive missions

Recommendations from `@orbital/recommendations` (see `phase-4-intelligence-design.md` §6) are persisted per day when offered. The top one becomes today's **adaptive mission**, which:
- shows an "Adaptive · optional" badge;
- gives a plain-language reason, e.g. "offered because: recent sleep and fatigue data differ from your usual";
- links to the action (log it, open the journal, open the companion).

Past offers are kept, so mission progress persists across restarts.

| Detected (approved output) | Offered | Completed by |
|---|---|---|
| Sleep/fatigue change | Recovery expedition · Wind-down hour · Cosy sleep routine | recovery or mindfulness session |
| Reduced activity / physical trend | Short movement break · Movement exploration quest · Optional prescribed session | movement break / prescribed exercise |
| Cognition change | A restful break (games only when not in sustained change) | rest day, recovery, mindfulness |
| Wellbeing change / YES | Journal moment · Something you enjoy · Chat with your companion | journal entry, recreation, crew activity, companion chat |
| Missing measurements | Measurement catch-up | measurement or check-in |
| Support requested | Talk with someone you trust (only this; games suppressed) | asking for support |

Restrictions (Today tab, e.g. set by a crew surgeon): `None`, `Light only` (no optional session) or `No exercise` (no movement suggestions). Rest days never get movement suggestions.

## 3. Space exploration

- **Route:** a 9-stop solar-system route: Moon → Mars → Phobos → Ceres → Europa → Titan → Uranus → Triton → Pluto. Each stop has a short, accurate offline fact and a map position (log-scaled distance from the Sun).
- **Needs:** each destination needs a **balanced mix** of cognitive, recovery, exercise and **connection** points. Connection points come from journal entries, crew time, recreation, companion chats, asking for support, and the crew puzzle. Training alone cannot finish the route. The first stop needs no connection points, because the synthetic history contains none.
- **Exploration history:** the day each destination was first reached.
- **Unlockable environments:** each destination unlocks a view (e.g. "Martian sunset") used in the pet home, plus decorations such as the Moon-rock replica, Mars globe and Europa ice lamp.

## 4. Habitat building

There are seven rooms. Room IDs are stable, so existing placements persist:
- Sleeping quarters
- Galley
- Gym
- Hydroponic garden
- Research laboratory
- Recreation room
- **Pet living space** (new)

Rooms unlock through completion facts, and several have alternative routes (rest days for the garden and pet space, movement breaks for the gym). Decorations unlock through achievements and destinations: 16 decorations in total, 7 of them new.

## 5. Companion progression

The pet home shows the selected companion's original artwork, contain-fitted, with equipped items **beside** it. The artwork is never altered, in line with the Phase 1 rule.
- **Items:**
  - toys: Star ball, Comet ribbon wand
  - accessories: Orbit scarf, Mini space helmet
  - decorations: Moon cushion, Tiny hydroponic plant
  - environments: lunar, Martian, Europan
- **Companion achievements:** Hello friend, Good companions, Playtime.
- **Interaction:** "Play with …" bounces the pet in the dashboard and sends `toy.played` to the desktop companion, which celebrates.
- **Hidden companion:** everything works with the companion window hidden. The pet space can be unlocked by rest days. Smoke test: logging with the companion hidden still earns XP.

## 6. Cognitive games

| Game | Measures | Easy | Standard | Hard | Keyboard |
|---|---|---|---|---|---|
| Signal Catch | attention / reaction time (median ms) | 3 trials, slow onset | 5 trials | 7 trials, wider random delays | Space / Enter |
| Constellation Memory | working memory (longest sequence) | start 2, 850 ms per star | start 3, 650 ms | start 4, 480 ms, 4×4 grid | number keys 1–9 |

Early responses simply retry, with no penalty. Personal history is shown as a sparkline per difficulty, with best and last scores. Personal bests are tracked per difficulty. Scores are saved as the user's own entered measurements and are **never** used on their own for any wellbeing or mental-health decision. They are not in the SCND baseline.

## 7. Crew cooperation

All crew mechanics show **crew totals only**:
- **Shared goals per week:** cognitive challenges, recharge, connection, **cooperative exercise** (prescribed sessions; no extra credit for more) and **group recreation**.
- **Shared puzzle:** a weekly picture (e.g. "Earthrise") revealed one piece per two crew contributions.
- **Team expedition:** one shared ship moved by the whole crew's points.

## 8. Companion communication

The companion relays approved recommendation **titles verbatim**:
- on opening: "I have an idea for today, if you fancy it: “Recovery expedition”. Totally optional!"
- on request: "what should I do today?" lists all of today's ideas, or says there are none.

These lines are never sent to the language model (`llmEligible: false`). The companion cannot create, rank or alter recommendations.

## 9. UI

The Mission Challenges page now has tabs:
- **Today:** missions, "Why these suggestions?" with each item's basis and anything suppressed, logging, restrictions.
- **Explore:** solar-system map, needs, history, environments.
- **Habitat & pet:** rooms, decorations, pet home.
- **Games:** difficulty, games, history.
- **Crew:** cooperative goals, puzzle, team ship.
- **Rewards:** level, XP breakdown, goals, achievements.

Light and dark themes are checked by `npm run smoke`.

## Tests

- `packages/gamification/test/adaptive.test.ts` (12): slot replacement and same bonus; XP invariance across all recommendation kinds; no biology in rewards; rest and support complete missions; monotonic rewards; route, history and environments; connection required beyond the first stop; required rooms; pet space without the companion; companion items and equip validation; crew totals only; contract validity.
- `packages/recommendations/test/recommendations.test.ts` (13).
- The original 9 gamification tests still pass.
