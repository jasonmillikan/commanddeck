# Native File Dialogs — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Scope:** Replace `prompt()` / `alert()` import/export flow with native Electron dialogs

---

## Problem

Export and import currently use `prompt()` for file paths and `alert()` for feedback. These are browser-style popups that feel out of place in a desktop app, require the user to type full paths manually, and don't survive packaging cleanly as a polished UX.

## Goal

Replace the import/export flow end-to-end with native OS file dialogs (`dialog` from Electron), so the experience matches what users expect from a desktop application — in both dev (`npm start`) and packaged (`.deb`, AppImage, Snap) builds.

---

## Architecture

The renderer buttons fire zero-argument IPC calls. All file I/O, dialog presentation, and confirmation logic lives in the main process. The renderer only receives a structured result.

```
Renderer (app.js)                 Main Process (main.js)
─────────────────                 ──────────────────────
btn-export click  ──── IPC ────▶  show Save dialog
                                  write file
                  ◀─── result ──  { ok, cancelled? }

btn-import click  ──── IPC ────▶  show Open dialog
                                  read + parse file
                                  show confirmation dialog
                                  save config
                  ◀─── result ──  { ok, data?, cancelled? }
```

---

## Components

### `main.js`

- Add `dialog` to the existing `require('electron')` destructure (top of file).
- Replace `ipcMain.handle('export-config', ...)` with a new handler:
  1. Call `dialog.showSaveDialog(mainWindow, { defaultPath, filters })` where `defaultPath` is `~/commanddeck-backup-YYYY-MM-DD.json` (built with `os.homedir()` + current date) and `filters` restricts to `.json`.
  2. If `cancelled` or no `filePath` returned, return `{ ok: false, cancelled: true }`.
  3. Write current config to the chosen path via `fs.writeFileSync`.
  4. On error, show `dialog.showErrorBox` and return `{ ok: false, error }`.
  5. On success, return `{ ok: true }`.
- Replace `ipcMain.handle('import-config', ...)` with a new handler:
  1. Call `dialog.showOpenDialog(mainWindow, { filters, properties: ['openFile'] })`.
  2. If cancelled or no file selected, return `{ ok: false, cancelled: true }`.
  3. Read and `JSON.parse` the selected file. On parse error, show `dialog.showErrorBox` and return `{ ok: false, error }`.
  4. Count current commands from `loadConfig()` and show `dialog.showMessageBox` confirmation: *"This will replace your N current commands. Continue?"*
  5. If user declines, return `{ ok: false, cancelled: true }`.
  6. Call `saveConfig(data)` and return `{ ok: true, data }`.

### `preload.js`

- `exportConfig`: drop `filePath` argument → `() => ipcRenderer.invoke('export-config')`
- `importConfig`: drop `filePath` argument → `() => ipcRenderer.invoke('import-config')`

### `app.js`

- **Export handler** (lines 392–401): Remove `prompt()`, path construction, and `alert()`. Replace with: call `window.api.exportConfig()`, do nothing on success or cancel (silent), error is handled natively in main.
- **Import handler** (lines 404–410): Remove `prompt()`, `~` expansion, and `alert()`. Replace with: call `window.api.importConfig()`, on `result.ok` set `config = result.data` and call `renderAll()`, otherwise do nothing.

---

## Error Handling

| Outcome | Handling |
|---|---|
| User cancels file picker | Silent — renderer does nothing |
| User cancels import confirmation | Silent — config unchanged |
| File write fails | `dialog.showErrorBox` in main; renderer gets `{ ok: false }` and ignores |
| File read / parse fails | `dialog.showErrorBox` in main; renderer gets `{ ok: false }` and ignores |
| Export success | Silent — user chose the location, no extra confirmation needed |
| Import success | Renderer updates `config` and calls `renderAll()` |

---

## Out of Scope

- Profiles / multiple named configurations (tracked separately as a future feature)
- Log rotation or cleanup
- Any changes to config schema or data model

---

## Packaging Compatibility

`dialog` is a core Electron API. It uses the OS native file picker (GTK on Ubuntu/Linux) and works identically under `npm start` and in packaged builds. Default paths use `os.homedir()` — the same pattern already used for `CONFIG_PATH` in `main.js`.
