# Installing Mochi

Mochi is a desktop app for **macOS** and **Windows**. Its conversations run on a small language model *on your own computer* through **Ollama**. There is no account and no API key, and nothing is sent to the cloud.

> **Status:** demonstration release for NASA Space Apps 2026. Builds are **unsigned** unless a release says otherwise. All astronaut health data in the app is **synthetic**. Mochi is not a medical device.

## System requirements

| | Minimum | Tested |
|---|---|---|
| macOS | 12 Monterey or later, Apple Silicon or Intel | macOS 27 on an Apple M1, 16 GB RAM (Apple Silicon build natively, Intel build under Rosetta) |
| Windows | Windows 10/11, 64-bit (x86_64) | **Not yet tested on real Windows**: see the release notes |
| Memory | 8 GB RAM recommended | The conversation model uses about **3.2 GB** while loaded (measured, 4,096-token context) |
| Disk | About 4 GB free | Model download **2.5 GB**, app about 120 MB (macOS DMG size) |

Without Ollama, Mochi still works in **simple mode**: built-in replies with a visible "Simple mode" badge.

## 1. Download Mochi

From the [Releases page](https://github.com/KhageshVaidya/mochi-a-little-more-than-a-pet/releases) (or the [website](https://khageshvaidya.github.io/mochi-a-little-more-than-a-pet/)), download:

- **macOS, Apple Silicon (M1/M2/M3/M4):** `Mochi-<version>-mac-arm64-unsigned.dmg`
- **macOS, Intel:** `Mochi-<version>-mac-x64-unsigned.dmg`
- **Windows 64-bit:** `Mochi-<version>-win-x64-unsigned.exe`

Each release lists SHA-256 checksums in `SHA256SUMS.txt`. To verify a download: `shasum -a 256 <file>` (macOS) or `Get-FileHash <file>` (PowerShell).

## 2. Install

### macOS

1. Open the `.dmg` and drag **Mochi** into **Applications**.
2. Because development builds are not signed or notarised, macOS blocks the first launch. Open **System Settings → Privacy & Security**, scroll to the message about Mochi and click **Open Anyway**. Alternatively, Control-click Mochi in Applications and choose **Open**.
3. Mochi appears on your desktop. A small Mochi icon also appears in the menu bar: Chat, Show/Hide, Open Dr G Zero, Quit.

### Windows

1. Run `Mochi-<version>-win-x64-unsigned.exe`.
2. Because the installer is not code-signed, Windows SmartScreen may show "Windows protected your PC". Click **More info → Run anyway** only if you downloaded it from the official project Releases page.
3. Follow the installer. Mochi appears on your desktop and in the system tray.

## 3. First launch: set up the local AI

If the conversation model isn't ready, Mochi opens a short **Set up Mochi's local AI** guide:

1. **Install and start Ollama.** The guide's button opens <https://ollama.com/download>. Install it, open it once, then press **Check again**.
2. **Download the model.** Tick "Yes, download about 2.5 GB now", then press **Download model**. Mochi never downloads it without that confirmation. You can also use a terminal:
   ```
   ollama pull qwen3:4b-instruct-2507-q4_K_M
   ```
3. **Say hello.** Mochi asks the model for one real reply to prove it works.
4. **Meet Mochi.** Click Mochi on your desktop to chat.

You can skip setup and use simple mode, then come back later from Mochi's chat ("Set up") or **Dr G Zero → Settings → Conversational AI**.

### Models

| Role | Model | Notes |
|---|---|---|
| Preferred | `qwen3:4b-instruct-2507-q4_K_M` | Non-thinking build. On an Apple M1, first words in about 0.3 s, a full reply in about 0.9 s (median, warm) |
| Fallback | `qwen3:4b` | Hybrid thinking model. Its reasoning is hidden, but replies take about 14 s and often time out. Not recommended for chat |

The model runs on `http://127.0.0.1:11434` (your own computer). Mochi refuses non-local addresses. **No model is bundled in the installer.**

### Using a different local model

**Dr G Zero → Settings → Conversational AI → Conversation model** accepts any Ollama model name (installed models are suggested). Small instruct models (3–8B) work best. Download it from the setup guide or with `ollama pull <name>`. Mochi's safety screen, prompt allow-list and output guard apply to every model. Download size and memory use depend on the model you choose. **Reset** returns to the default.

## Network and permissions

- **Network:** needed only to download Mochi, Ollama and the model. After that, Mochi works fully offline. The optional Anthropic provider (off by default) needs internet and an API key.
- **macOS:** unsigned builds need **Open Anyway** once (see above). Mochi asks for no camera, microphone, location, contacts or accessibility permissions.
- **Windows:** SmartScreen warns about unsigned installers (see above). The firewall is not involved: Ollama listens on your own computer only.

## 4. Using Mochi

- **Click** Mochi to chat. **Right-click** for its menu. **Drag** to move it.
- Say **"open Dr G Zero"** or **"show me my health"** to open the dashboard.
- Everything is optional. Nothing is ever taken away, and rest counts.

## Uninstalling

- **macOS:** delete Mochi from Applications. Optionally delete `~/Library/Application Support/@orbital/desktop` (local data; the folder keeps its pre-rename name in this release).
- **Windows:** use *Settings → Apps → Mochi → Uninstall*. Optionally delete `%APPDATA%\@orbital\desktop` (local data).
- **Ollama and the model** are separate. Remove the model with `ollama rm qwen3:4b-instruct-2507-q4_K_M`.
