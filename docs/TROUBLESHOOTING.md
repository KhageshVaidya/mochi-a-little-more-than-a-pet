# Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Mochi's chat says **Simple mode, Local AI unavailable** | Ollama isn't installed or isn't running | Install Ollama from <https://ollama.com/download>, open it, then click **Set up** in Mochi's chat or **Check again** in Dr G Zero → Settings. Mochi re-checks automatically every 30 s |
| **Local model not installed** | The model hasn't been downloaded | Use the setup guide, or run `ollama pull qwen3:4b-instruct-2507-q4_K_M` |
| **AI is turned off** | Provider set to Off | Dr G Zero → Settings → Conversational AI → **Ollama (local)** |
| The first reply after launch is slow (2–5 s) | The model is loading into memory | Normal. Later replies take about 0.3–1 s. Mochi keeps the model loaded for 30 minutes |
| Replies are very slow (more than 10 s) | Only the fallback `qwen3:4b` is installed, or the machine is low on memory | Install the preferred model (see above). Close memory-heavy apps; the model needs about 3.2 GB |
| macOS: "Mochi can't be opened because Apple cannot check it…" | Unsigned development build | System Settings → Privacy & Security → **Open Anyway** (see INSTALLATION.md) |
| Windows: "Windows protected your PC" | Unsigned installer (SmartScreen) | **More info → Run anyway**, only for downloads from the official Releases page |
| I can't see Mochi | Hidden, or off-screen after a display change | Menu-bar / tray icon → **Show Mochi**. Mochi is kept inside the visible screen area when displays change |
| Clicking Mochi doesn't open the chat | Interactions are switched off | Dr G Zero → Desktop Companion → enable **Companion interactions** |
| I want to start fresh | — | Quit Mochi and delete its data folder (see INSTALLATION.md → Uninstalling) |
| Download stops at "pulling manifest" | No internet, or the Ollama registry is unreachable | Check your connection and retry. Only the model download needs internet; chatting doesn't |

## Diagnostics for developers

- `npm run check`: type checks and all tests.
- `npm run smoke`: launches the real app in light and dark mode and asserts about 53 checks per theme.
- `MOCHI_LIVE=1 npx vitest run apps/desktop/src/main/mochi-live-ollama.test.ts`: real multi-turn conversations with your local model.

## Reporting a problem

Open an issue with your OS and architecture, the Mochi version, the Ollama version (`ollama --version`), and what Mochi's chat or Settings showed. **Never paste journal entries or personal health information into an issue.**
