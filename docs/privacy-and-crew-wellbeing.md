# Privacy & Crew Wellbeing (Phase 2, Parts B3, C4 and D)

## 1. Non-negotiables

1. **No hidden emotional surveillance.** ORBITAL doesn't analyse private conversations, doesn't score interpersonal conflict, and never labels anyone emotionally unstable based on response frequency, silence or participation.
2. **Private by default.** Journal entries, memory items, chat history, Brain & Mental Health results and wellbeing self-reports belong to the individual. They never appear in crew views, rankings or administrator views.
3. **Voluntary by design.** Check-ins, journaling, crew activities and sharing are opt-in. Declining or not answering is neutral and never penalised.
4. **Inference is not fact.** Model-generated summaries and possibilities are labelled and stay unconfirmed unless the person confirms them.
5. **Deterministic safety.** Urgent safety handling is rule-based, never depends on an LLM, and is never softened or made playful.

## 2. Data classes and who can see them

| Data | Stored | Visible to | Leaves the device? |
|---|---|---|---|
| Physiological measurements (synthetic) | SQLite `records` | the individual; physical indicators in crew views | No |
| Wellbeing self-reports, Brain Health assessment | SQLite / computed | the individual only | No |
| Journal entries | SQLite `journal_entries` | the individual only | Only via the individual's own export |
| Memory items | SQLite `memory_items` | the individual only (inspect, edit, delete) | No |
| Companion chat | memory only (not persisted unless saved to the journal) | the individual | Only if the LLM is enabled: the current conversation turns, nothing else |
| Voluntary crew status | SQLite `crew_status` | the crew, **only the option the person chose to share** | No |
| Crew activity invitations / responses | SQLite `crew_activities` | the participants | No |
| Aggregate participation | computed | the crew (team level only) | No |
| Alert audit log | SQLite `alert_audit` | the individual; human review only per §4 | No |

## 3. Crew wellbeing features

- **Voluntary status:** "Up for company", "Open to an activity", "Need some personal space", "Would like support", or no status (the default). It expires at the end of the day. "Would like support" lets the person pick *who* sees it: a chosen crewmate, the crew-support contact, or the whole crew.
- **Activities:** puzzle, cognitive game, exercise together, recreational evening, shared meal, conversation. Anyone can propose; invitees accept or decline with one tap and no reason is asked for. Companions only suggest inviting people whose shared status is "Up for company" or "Open to an activity", and never anyone who chose "Need some personal space".
- **Companion-to-companion messages** carry only activity invitations and responses. Never journal content, moods or health data.
- **Aggregate participation:** the weekly crew-wide count of voluntary activities and check-ins, compared with the crew's own earlier weeks. A sustained drop suggests "a relaxed team check-in might be nice". It is **never** attributed to an individual, never linked to health, and never interpreted as low mood or conflict.

## 4. Alert tiers, escalation and audit

| Tier | Trigger (deterministic) | What happens | Tone |
|---|---|---|---|
| **Routine suggestion** | Simple rules (sleep below usual, measurement due) | Companion or dashboard suggestion; dismissible; rate-limited | Friendly, playful allowed |
| **Change worth monitoring** | A physical indicator's 7-day mean ≥ 2 SD from baseline; data completeness < 70% | Dashboard "watch" item with reasons | Calm, factual |
| **Human review recommended** | Brain Health monitor **YES** (R-BRAIN-01/02) | Recommends a private conference. The person decides whether to share the report with crew-support (consent recorded in the audit log). | Calm, factual, non-diagnostic |
| **Urgent safety** | "I'd like to talk to someone" / safety phrase in chat or journal (on-device rules) → P0 | Human-support pathway opens immediately with fixed text; companion goes quiet; audit event | Serious, warm, **never playful** |

**Audit log (`alert_audit`):** every alert with its tier, rule id, day, reasons and inputs hash; each acknowledgement; every share/no-share consent decision; every safety escalation. Entries are append-only, and the individual can view them.

**Human review requirements:** human review is recommended, never forced, except under a clearly defined mission emergency protocol. That protocol is outside this software's authority: ORBITAL records the decision but doesn't override the crew member.

**The LLM's role is limited** to rewording an existing alert's explanation in companion conversation. It can't create, suppress or change the severity of any alert.

## 5. Consent switches (all default OFF unless stated)

| Switch | Effect |
|---|---|
| Journaling enabled (**default ON**, can be disabled) | The companion offers a daily voluntary check-in conversation |
| Language model enabled | Ordinary companion wording via `claude-haiku-5-5`; only the current conversation turns are sent |
| Share structured check-in answers with the wellbeing monitor | The person's own 0–10 check-in answers given in chat count as self-reported records. Free text never does. |
| Share crew status | Shows the chosen status option to the chosen audience |
