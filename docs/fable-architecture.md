# Fable — companion coordination (architecture)

> **Status: planned (roadmap Phase F).** Fable as described here is **not implemented yet**. Today's build has its precursor: voluntary crew statuses, shared activity invitations between companions, crew puzzles and a team expedition (all simulated for the other four crew members, and all shown as crew totals only).

## Purpose

Every astronaut has their own companion. Fable lets those companions **coordinate activities the astronauts have agreed to** (a puzzle, a shared meal, group exercise, a game night) so the crew stays connected. Fable coordinates activities, not surveillance.

## What exists today (precursor, implemented)

| Feature | Where | Behaviour |
|---|---|---|
| Voluntary status ("open to an activity", "up for company", "personal space", "would like support") | Crew page | Chosen by the astronaut, with an audience (crew / one person / crew support). Expires daily |
| Activity invitations | Crew page | Only to people who said they're open; never to anyone who chose personal space |
| Companion-to-companion messages | Crew page | Activity logistics only ("Comet says Maya is in!") |
| Crew puzzle, team expedition, co-op goals | Mission Challenges → Crew | Crew totals only; no per-person breakdowns, no health data |

## Target design

```
Astronaut ──(explicit choice)──▶ Mochi ──intent──▶ Fable ConsentLedger ──▶ CoordinationEngine ──proposal──▶ each participant's companion
   "I'm up for a puzzle at 19:00"                  who may see it,          match consenting people,           "Maya's up for a puzzle at 
                                                   expiry, how given        time window, activity                19:00 too — want in?"
```

| Component | Responsibility | Never touches |
|---|---|---|
| ConsentLedger | Stores intents: activity, time window, audience, expiry, provenance | Journals, chat, health data |
| CoordinationEngine | Deterministic matching of compatible, consenting intents into proposals | SCND outputs, emotional states |
| FableBus | Transport. In-process today (all demo crew on one machine); the same interface works over a crew LAN later | — |
| Companion | Presents proposals in its own voice; relays accept or decline | Other people's private data |
| CrewAggregates | Weekly crew-level counts for Dr G Zero's crew page | Per-person data |

## Example: a puzzle night

1. Astronaut A tells their companion "I'm up for a puzzle tonight". The companion records an intent with audience *crew*, expiring at midnight.
2. Astronaut B independently sets "open to an activity" and allows puzzles.
3. Fable matches the two intents and sends a proposal to both companions.
4. Each companion asks its astronaut. Both accept, and the crew puzzle starts.
5. No journal text, no health value, no SCND decision and no emotional label is ever exchanged.

## Privacy rules (enforced by schema)

- Proposals and messages carry **activity logistics only**. A schema-level test rejects any payload containing journal, chat, health or assessment fields.
- **Personal space** means never invited or suggested.
- No inference from silence or behaviour. A wellbeing recommendation may make a companion *ask* "want me to see if anyone's up for a game?", and only the astronaut's "yes" creates an intent.
- Opt-out per activity type, and a global "Fable off". Mochi works fully without Fable.

See also: [mochi-architecture.md](mochi-architecture.md), [mochi-privacy-and-safety.md](mochi-privacy-and-safety.md), [privacy-and-crew-wellbeing.md](privacy-and-crew-wellbeing.md).
