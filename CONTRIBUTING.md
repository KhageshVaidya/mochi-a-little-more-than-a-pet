# Contributing to Mochi

Thanks for helping. Mochi is a NASA Space Apps demonstration about astronaut wellbeing, so a few rules matter more than usual.

## Ground rules

1. **No diagnosis.** Nothing may diagnose depression, anxiety or any other condition, or present a model's output as a medical judgement.
2. **The model never decides.** SCND decisions (YES / NO / INSUFFICIENT DATA) come from deterministic code in `packages/engine`. Language models may only phrase things, and their output always passes `guardReply`.
3. **Privacy by construction.** Journal entries, health values and SCND results must never reach a language model prompt or an external service. New prompt content goes through the allow-list in `packages/companion/src/prompt.ts`.
4. **Synthetic data only.** Never add real people's health data, including your own.
5. **Rest is never punished.** Gamification rewards taking part; health metrics are never scores or rankings.
6. **Cite real sources.** No invented references, and no claim that NASA recommends something unless a NASA source says so.
7. **Original artwork only.** Do not contribute characters, names or art you don't own the rights to. See [ASSETS.md](ASSETS.md). Code contributions are accepted under the MIT License; the Mochi character artwork is copyrighted and not open-licensed.

## Workflow

```bash
npm install
npm run check   # must pass: type checks + unit tests
npm run smoke   # on macOS: real app in light and dark
```

- Keep pull requests focused, and describe what you tested.
- Add or update tests with behaviour changes (vitest, next to the code).
- UI changes: include light and dark screenshots.
- New dependencies must have a permissive licence. Run `node tools/license-audit.mjs` and commit the updated `THIRD_PARTY_NOTICES.md`.

## Reporting problems

Open an issue with your OS, Mochi version, whether Ollama is installed (and which model), and steps to reproduce. For security or privacy issues, follow [SECURITY.md](SECURITY.md) instead.
