# Mochi · Privacy and safety

Status: **proposal, awaiting approval.** It extends `privacy-and-crew-wellbeing.md` (still valid) to the Mochi, Dr G Zero and Fable architecture.

## 1. Principles

1. **On-device by default.** Conversations, the journal, memory and health data are stored locally (SQLite, main process). The language model runs locally through Ollama on `127.0.0.1`. No telemetry.
2. **The astronaut controls what is stored.** Every stored item (chat turn, journal entry, memory, consent) is visible, editable and deletable by its owner.
3. **The model words; it never decides.** SCND decisions, escalation, alerts, restrictions and recommendations are deterministic. The model cannot create, change or suppress any of them.
4. **Fable coordinates activities; it does not surveil.** Companions exchange explicit, consented intents, never states, journals or health data.
5. **Honest labelling.** Synthetic data is always labelled. Model output, template output and safety replies are labelled internally and auditable.

## 2. Five information classes (shown on every value)

| Class | Example | May drive a SCND decision? |
|---|---|---|
| Measured | HR, SpO₂, BP from a device | Yes, after data-quality checks |
| Derived | HRV RMSSD, sleep efficiency, 7-day mean | Yes |
| Self-reported | Mood 0–10, "slept badly" in a check-in | Yes (as today), labelled |
| AI-generated hypothesis | "Journal mentions crew conflict more often lately" | **No.** Shown as a hypothesis with uncertainty; the astronaut can dismiss it |
| Confirmed assessment | SCND YES/NO/INSUFFICIENT with its rules and evidence | It *is* the decision |

Journal-derived signals and communication-pattern signals are **opt-in, off by default, and never used to reach a YES** unless validated in a later, separately approved phase. They appear in Journal analytics as hypotheses.

## 3. What the language model sees

| Always | Only with explicit, turn-level consent | Never |
|---|---|---|
| Persona and style rules, recent turns of *this* profile, confirmed memories, titles of today's approved recommendations, time of day / rest day | Journal text, during "talk about my journal" or "summarise my week" turns started by the astronaut | Raw health values, SCND state or reasons, alerts, other astronauts' anything, Fable proposals about others beyond the activity logistics |

**Output guard** (deterministic, after the model):
- strips reasoning text;
- enforces length and one question;
- blocks diagnostic or medical language ("you have", "depression", dosing…);
- blocks recommendations that aren't approved;
- removes stage directions.

A guard failure falls back to a labelled template.

## 4. Safety pathway (unchanged in principle; stronger placement)

- The on-device safety screen runs on **every** message **before** routing or the model.
- On an urgent phrase or a "talk to someone" request:
  - a fixed, serious reply and the human-support pathway open;
  - P0 escalation and an urgent alert;
  - the event is audited and Mochi goes quiet (no jokes, games or bubbles).
- The model is never asked to handle a crisis.
- No reply claims to be a clinician. Mochi says it's a companion and points to people.

## 5. Journal and memory

- **Recording:** a journal entry is created only when the astronaut chooses (in chat or the dashboard). The user's own words are stored verbatim. Any model-written summary is stored separately, labelled "generated summary", and can be edited or deleted.
- **Memory:** propose → confirm (as today). Nothing is remembered silently.
- **Analytics:** themes and mood trends are shown with uncertainty and the number of entries, as hypotheses.
- **No automatic sharing:** journal content never leaves the profile automatically. Exports are explicit, use the OS save dialog, and are tagged *synthetic* for demo profiles.

## 6. Fable rules

| Allowed between companions | Never |
|---|---|
| An astronaut's explicit intent ("open to a puzzle 19:00"), activity logistics, accept/decline, crew-level counts per week | Journal content, chat content, raw or derived health data, SCND outputs, emotional state, labels such as "isolated" or "low mood", inferences from silence |

- **Consent ledger:** each intent records who may see it (crew / one person / crew support), when it expires (by default end of day) and how it was given.
- **Opt-outs:** per activity type, and a global "Fable off". With Fable off, Mochi works fully alone.
- **"Personal space":** the astronaut is never invited or suggested.
- **Fable never infers.** A recommendation may make Mochi *ask* whether to look for company. Only the astronaut's yes creates an intent.

## 7. Sensors and activity

- **v1 collects no microphone, camera, screen, keystrokes or window titles.**
- **Optional "react to my activity":** uses only OS idle time, lock/unlock and sleep/wake. It is off by default, with a visible toggle.
- **Future sensors:** each needs its own permission prompt, a persistent visible indicator, a one-click off switch and a documented retention period. There is no passive listening, ever.

## 8. Threats and mitigations

| Threat | Mitigation |
|---|---|
| Renderer compromise reads data | `contextIsolation`, sandbox, no `nodeIntegration`; zod-validated allow-listed IPC per window role; the pet and chat windows have no data channels |
| Prompt injection via journal or chat makes the model claim a diagnosis or invent tasks | Model output is advisory text only; deterministic guard; recommendations come from the engine, not the model |
| Local model endpoint spoofed | Connect only to loopback; verify the model list and version; never send data elsewhere |
| Model weights and licensing | Not bundled; downloaded by Ollama from its registry with user consent; licence shown in setup (Qwen3 is published under Apache-2.0, to be re-verified at release) |
| Third-party character IP | Public builds use original artwork only (vision doc §8) |
| Synthetic data mistaken for real | "SIMULATED DATA" badge on every Dr G Zero page and in exports; demo profiles flagged |

## 9. Regulatory note

Mochi and Dr G Zero are a demonstration for NASA Space Apps. They are **not** medical devices and make no clinical claims. Thresholds are engineering defaults, documented and not clinically validated. NASA references explain context and are never presented as NASA endorsement.
