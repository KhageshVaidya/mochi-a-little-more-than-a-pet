# Privacy

Mochi is designed so that an astronaut's companion is on their side. This page summarises what Mochi stores, what it never shares, and what leaves the computer.

## The short version

- **Everything stays on your computer.** There is no account, no cloud service and no telemetry.
- **The language model never sees your journal or health data,** and never makes or changes a health decision.
- **Nothing is downloaded or sent without your say-so.** The model download needs your explicit confirmation; the optional Anthropic provider is off by default.
- **Mochi never diagnoses** and there is no hidden emotional monitoring.

## What is stored, and where

All data is stored locally in SQLite in the app's data folder (`~/Library/Application Support/@orbital/desktop` on macOS, `%APPDATA%\@orbital\desktop` on Windows):

| Data | Purpose | Who can see it |
|---|---|---|
| Journal entries | Your private reflections, stored verbatim | Only you. Never sent to a model, never shared with crew or Fable |
| Confirmed memories | Small facts you asked Mochi to remember | You (view and delete in Journal & Memory). Used in the model prompt only after you confirm them |
| Chat history | Recent conversation turns | Only you. Ordinary chat turns may be sent to the local model for context |
| Check-ins and (synthetic) physiological data | Dr G Zero's SCND analysis | Only you. In this demonstration all physiological data is synthetic |
| Progress, games, preferences | Gamification and settings | Only you |

To erase everything, quit Mochi and delete the data folder.

## What the model receives

The conversation context is built from an **allow-list** (`packages/companion/src/prompt.ts`, covered by tests):

- **Allowed:** Mochi's persona, coarse context (time of day, rest day), titles of approved suggestions, memories you confirmed, and ordinary chat turns.
- **Never:** journal text, check-in answers, health values, SCND results, safety conversations.

With the default setup, the model runs in **Ollama on your own computer** (`127.0.0.1`); Mochi refuses non-local Ollama addresses.

## Network use

| When | What | Can you avoid it? |
|---|---|---|
| Installing | Downloading Mochi and Ollama | — |
| First-run setup | Ollama downloads the model you confirmed | Yes: skip setup and use simple mode |
| Optional Anthropic provider | Allow-listed chat turns only, to Anthropic's API | Off by default; needs your API key |

Mochi has no analytics, crash reporting or update checks. Links you click (the Ollama download page, NASA sources in the knowledge browser) open in your normal web browser.

## Crew and Fable

- Crew features use **voluntary statuses** you choose ("open to an activity", "personal space"), with an audience and a daily expiry.
- Crew views show **totals only**: no per-person breakdowns, rankings or health data.
- Fable (planned) shares **activity intents only**. It never shares journals, chats, health data, SCND results or emotional state, and "personal space" means never invited. See [fable-architecture.md](fable-architecture.md).

## Safety

- A safety screen runs before anything else. Requests for help get a fixed reply and the human-support pathway, never a generated one.
- SCND decisions are deterministic code. A **YES** suggests a private conversation with crew support; **you decide** whether to share anything.
- Mochi does not diagnose depression or any other condition, and is not a medical device.

More detail: [mochi-privacy-and-safety.md](mochi-privacy-and-safety.md) · [privacy-and-crew-wellbeing.md](privacy-and-crew-wellbeing.md) · [../SECURITY.md](../SECURITY.md)
