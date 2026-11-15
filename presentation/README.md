# Mochi — NASA Space Apps 2026 presentation

| File | What |
|---|---|
| `mochi-space-apps.pptx` | Editable 7-slide deck (native shapes, speaker notes on every slide) |
| `mochi-space-apps.pdf` | PDF export |
| `screenshots/` | The original, full-resolution app captures used in the deck (synthetic data, fictional crew) |
| `build-deck.mjs` | Source: regenerates the .pptx |

```bash
npm install
npm run build                                       # → mochi-space-apps.pptx
SITE_URL=https://<owner>.github.io/<repo>/ REPO_URL=https://github.com/<owner>/<repo> npm run build   # real QR code + live links
PUBLIC_NAMES=1 npm run build                        # Fable example uses the public crew names (Alex, Maya)
```

PDF: open the .pptx in Keynote or PowerPoint and export as PDF (this is how the included PDF was made, with Keynote).
Fonts: Trebuchet MS (headings) and Arial (body), available on macOS, Windows and in Office.
