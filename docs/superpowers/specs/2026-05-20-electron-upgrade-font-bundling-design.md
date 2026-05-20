# Electron Upgrade + Font Bundling — Design Spec

**Date:** 2026-05-20
**Status:** Approved

## Problem

Two security/privacy issues identified during package audit:

1. **Electron 29.4.6 is outdated** — 17 CVEs accumulated since v29, including use-after-free callbacks, IPC issues, and permission handler bypasses. Risk is low for a local desktop app with context isolation, but upgrade is correct practice especially as the app targets macOS in addition to Linux.

2. **Fonts load from Google CDN on every launch** — the two `<link>` tags pointing to `fonts.googleapis.com` mean Google receives a connection event each time the app opens. Not a security issue but a privacy one; bundling fonts locally eliminates this.

---

## Part 1: Electron Upgrade (v29 → v42)

### Change

Bump `"electron": "^29.0.0"` to `"electron": "^42.0.0"` in `package.json`, then run `npm install`.

### Risk Assessment

**Low.** CommandDeck's Electron API surface is entirely stable core APIs:

| API | Status in v42 |
|-----|---------------|
| `BrowserWindow` | Unchanged |
| `Tray` + `nativeImage` | Unchanged |
| `ipcMain.handle()` | Unchanged |
| `contextBridge.exposeInMainWorld()` | Unchanged |
| `ipcRenderer.invoke()` / `.on()` | Unchanged |
| `dialog.showSaveDialog/OpenDialog/MessageBox/ErrorBox` | Unchanged |
| `Notification` | Unchanged |
| `shell.openPath()` | Unchanged |
| `globalShortcut.register/unregisterAll` | Unchanged |
| `webContents.send()` | Unchanged |

The npm "breaking change" flag is a blanket warning for any major version jump, not specific to these APIs.

### Verification

1. `npm test` — run existing unit tests (`tray-icon.test.js`, `utils.test.js`)
2. Manual smoke test: launch app, verify tray icon renders, open modal, drag-reorder a card, launch/kill a foreground process, trigger global hotkey

---

## Part 2: Font Bundling (CDN → local WOFF2 files)

### Fonts Required

| Family | Weights |
|--------|---------|
| JetBrains Mono | 400, 600, 700 |
| Syne | 400, 700, 800 |

6 WOFF2 files total.

### File Layout

```
src/renderer/fonts/
├── jetbrains-mono-400.woff2
├── jetbrains-mono-600.woff2
├── jetbrains-mono-700.woff2
├── syne-400.woff2
├── syne-700.woff2
└── syne-800.woff2
```

### Font Acquisition

Fetch the Google Fonts CSS2 API with a modern Chromium `User-Agent` header (required to receive WOFF2 responses). Parse the returned `@font-face` CSS to extract the actual font file URLs. Download each file to `src/renderer/fonts/`. All steps done programmatically via bash — no manual downloading.

### CSS Changes (`src/renderer/style.css`)

Add `@font-face` declarations at the top of `style.css` pointing to the local files:

```css
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  src: url('./fonts/jetbrains-mono-400.woff2') format('woff2');
}
/* ... repeat for 600, 700 */

@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 400;
  src: url('./fonts/syne-400.woff2') format('woff2');
}
/* ... repeat for 700, 800 */
```

Font family names remain identical — no other CSS changes needed.

### HTML Changes (`src/renderer/index.html`)

Remove these 2 lines:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
```

No replacement needed — `style.css` (already linked) will contain the `@font-face` declarations.

### Verification

Launch the app and visually confirm:
- JetBrains Mono renders on command text / meta / code areas
- Syne renders on headings and UI labels
- No network requests to `fonts.googleapis.com` or `fonts.gstatic.com` at launch (can verify with DevTools Network tab)

---

## Out of Scope

- Italic font variants (not used in the current stylesheet)
- Font subsetting (WOFF2 files will include full character sets — acceptable for a desktop app)
- Log rotation, packaging, or other backlog items
