# Security and privacy policy

Mochi is a demonstration project and has not been through an independent security audit.

## Reporting a vulnerability

Please **do not** open a public issue for security or privacy problems. Use GitHub's **private vulnerability reporting** (Security tab → *Report a vulnerability*) on this repository. Include steps to reproduce and the version affected. We aim to acknowledge reports within a week.

Particularly relevant:

- any path by which journal text, health values or SCND results could reach a language model, the network or another crew member;
- the renderer gaining access to Node or to IPC channels outside the allow-list;
- the Ollama client talking to anything other than loopback, or pulling a model that is not on the allow-list.

## Design summary

- Electron renderers are sandboxed with context isolation; preloads expose a typed, allow-listed IPC surface, validated with zod in the main process.
- All data is stored locally in SQLite. No accounts, no telemetry.
- Ollama is reached on `127.0.0.1` only. The optional Anthropic provider is off by default, needs a key the user enters, and never receives journal, health or assessment data.
- Builds may be unsigned; verify downloads come from this repository's Releases page.
