# Gamification Design (Phase 2, Part E)

## 1. Principles (binding)

1. **Reward consistency and care, never output.** XP comes from *completing* things (check-ins, prescribed exercise up to the prescription, recovery, rest, cognitive games, crew activities), never from the *values* a person reports or a body produces.
2. **Rest and recovery are achievements.** Scheduled rest days, recovery sessions and asking for help earn rewards on the same footing as exercise.
3. **No punishment.** No XP loss, no streak loss, no decay, no "you missed" messages. Illness, fatigue, low energy, boundaries and requests for help are never penalised.
4. **No public health rankings, no individual mental-health scores.** Crew mechanics are cooperative only.
5. **Independent of the companion.** `@orbital/gamification` is a pure engine. The companion only *listens* to its events.
6. **Not manipulative:** no loot boxes, no variable-ratio rewards, no countdown pressure, and reminders are capped.

## 2. Engine: `@orbital/gamification`

```
EngagementEvent[]  ──►  evaluateProgress(events, catalogue, asOfDay)  ──►  ProgressState
   (completion facts)       pure, deterministic                        XP, level, achievements, base unlocks,
                                                                        exploration position, mission status
```

**Event sources**, every one tagged with its provenance:
- **Synthetic history** (`source: simulation`): derived from the crew member's simulated records. A check-in record = check-in completed; an exercise log = a session (capped at the prescription); a scheduled rest day = rest; a weekly measurement = measurement completed.
- **In-app actions** (`source: user`): cognitive games played in ORBITAL, missions marked complete, recovery or mindfulness sessions logged, crew activities joined.

### 2.1 XP and levels
| Event | XP | Cap |
|---|---|---|
| Daily check-in completed | 20 | 1/day |
| Scheduled measurement completed | 15 | per scheduled measurement |
| Exercise session | 1 XP per prescribed minute | capped at the prescription; extra minutes earn 0 |
| Scheduled rest day | 30 | 1/day |
| Recovery / mindfulness session | 25 | 2/day |
| Cognitive game played | 15 (+10 personal best) | 3/day |
| Crew activity joined | 25 | 2/day |
| Daily mission completed | +10 bonus | — |

Levels follow a gentle curve (`xpForLevel(n) = 100·n·(n+1)/2`). Ranks: Cadet → Specialist → Navigator → Pilot → Mission Lead → Explorer → Pathfinder.

### 2.2 Missions
- **Daily (3/day):** generated deterministically from (day, crew member) and **adapted to context**. A low-sleep day offers a "cosy evening" recovery mission instead of an exercise one. Rest days offer a rest mission.
- **Weekly (2/week):** for example "4 check-ins this week", "2 cognitive games".
- **Personal goals:** chosen by the astronaut from a list. Targets are completion counts, never body values.

### 2.3 Habitat (base building)
Rooms unlock from **categories** of healthy activity: Quarters (rest), Gym (exercise), Greenhouse (recovery/mindfulness), Observatory (cognitive games), Galley (check-ins), Lounge (crew activities). Decorations and plants unlock from achievements. The astronaut places unlocked items; the layout is persisted.

### 2.4 Exploration
A route of real Solar System destinations: Moon → Mars → Phobos → Ceres → Europa → Titan. Progress points come from cognitive challenges, recovery activities and exercise missions, so each destination needs a mix of categories. Exercise alone can't finish the route. Reaching a destination unlocks its environment and a short NASA-inspired fact (static text, no external calls).

### 2.5 Crew cooperative missions
Shared goals summed across the crew (for example "Crew: 20 cognitive games this week", "Crew: 10 recovery sessions"). The UI shows the crew total only. **No per-person breakdown, no ranking.**

### 2.6 Companion integration
The engine emits `CompanionEvent`s (objective completed, cognitive achievement, recovery, rest, milestone). The companion reacts if it's visible. Every mechanic works with the companion hidden.

## 3. APIs
`game:progress` (ProgressState for the selected crew member/day) · `game:missions` · `game:complete` (mark a mission or log an activity) · `game:play` (record a cognitive game result) · `game:habitat:place` · `game:goals:set`.
