# Design: Preferences Panel, Global Hotkey & Desktop Notifications

**Date:** 2026-05-19
**Status:** Approved

## Overview

Three tightly related features implemented together:

1. A **preferences panel** (modal) as a home for user-configurable app settings
2. A **global hotkey** to show/hide the CommandDeck window from anywhere
3. **Desktop notifications** when foreground or launcher processes exit unexpectedly

The preferences panel is intentionally minimal — it hosts only these two settings for now, with room for future additions (config file location, autostart, etc.).

---

## 1. Data Model & Storage

New file: `~/.commanddeck/prefs.json`

Created with defaults on first run alongside `commands.json` and `state.json` inside the existing `ensureConfigDir()` call.

```json
{
  "hotkey": "Super+D",
  "notify": {
    "onCrash": true,
    "onUnexpectedExit": false
  }
}
```

- `hotkey` — Electron accelerator string (`"Super+D"`, `"Ctrl+Shift+Space"`, `""` to disable). Stored in the format Electron consumes directly — no translation at rest.
- `notify.onCrash` — fire a notification when a process exits with a non-zero code (red-alert condition). Default `true`.
- `notify.onUnexpectedExit` — fire a notification when a process exits with code 0 but wasn't user-killed (amber-alert condition). Default `false` to avoid spamming users of short-lived launchers.

### IPC additions

| Handler | Direction | Description |
|---|---|---|
| `load-prefs` | renderer → main | Returns parsed `prefs.json` (or defaults if absent) |
| `save-prefs` | renderer → main | Writes `prefs.json`, re-registers hotkey, returns `{ ok, error? }` |

Two new entries in `preload.js`: `loadPrefs()` and `savePrefs(data)`.

---

## 2. Global Hotkey (main process)

### Registration

- `globalShortcut` added to the `require('electron')` imports in `main.js`
- Prefs loaded once at startup into a module-level `let prefs` variable
- On `app.whenReady()`, after `createWindow()` / `createTray()`: `globalShortcut.register(prefs.hotkey, toggleWindow)`
- `toggleWindow` reuses the same show/hide logic as the existing tray click handler
- Empty `hotkey` string → skip registration (hotkey disabled)
- `app.on('will-quit')` → `globalShortcut.unregisterAll()`

### Re-registration on prefs save

The `save-prefs` IPC handler:
1. Unregisters the current shortcut (if any)
2. Updates the in-memory `prefs` variable
3. Writes `prefs.json`
4. Attempts to register the new hotkey
5. Returns `{ ok: true }` on success, `{ ok: false, error: 'hotkey_conflict' }` if `globalShortcut.register()` returns `false`

---

## 3. Desktop Notifications (main process)

`Notification` added to the `require('electron')` imports.

Notifications fire from within the existing exit handlers in `spawnCommand()`. Guard logic (checked in order):

1. `wasUserKilled` → skip
2. `type === 'toggle-on'` → skip (expected one-shot)
3. `code !== 0` AND `prefs.notify.onCrash` → fire crash notification
4. `code === 0` AND `prefs.notify.onUnexpectedExit` → fire unexpected-exit notification

Notification content:

| Condition | Body |
|---|---|
| Crash | `"${label}" stopped with an error (code ${code})` |
| Unexpected clean exit | `"${label}" exited unexpectedly` |

- **Title:** `CommandDeck` (both cases)
- **Click handler:** `mainWindow.show(); mainWindow.focus()`

Prefs are read from the module-level `prefs` variable (updated in-place on save) — no disk read on each exit event.

---

## 4. Preferences Modal (renderer)

### Entry point

A gear button (`⚙`) in the titlebar, placed alongside the existing minimize/hide controls. Loads prefs on boot alongside `loadAll()` into a renderer-side `prefs` variable.

### Modal structure

Follows the existing command-edit modal pattern: backdrop overlay, modal card, title bar, form fields, Save / Cancel buttons.

**Hotkey field:**
- Read-only text input showing the current accelerator string (e.g. `"Super+D"`)
- `[Record]` button beside it — click enters listening mode
  - Placeholder changes to `"Press keys…"`
  - `keydown` listener attaches to `document`
  - On keydown: combo translated to Electron accelerator format and written to the field
    - `event.metaKey` → `Super`
    - `event.ctrlKey` → `Ctrl`
    - `event.altKey` → `Alt`
    - `event.shiftKey` → `Shift`
    - `event.key` normalized to title case for named keys (`" "` → `Space`, `"F1"` → `F1`, etc.)
  - Modifier-only keypresses (e.g. pressing just `Ctrl`) are ignored — Electron requires at least one non-modifier key
  - `Escape` cancels and reverts to previous value
- `[×]` button clears the field (sets hotkey to `""`, disabling it)
- If save returns `{ ok: false, error: 'hotkey_conflict' }`: inline error below the field — `"That shortcut is already in use — try another."`

**Notification toggles:**
- `[x] Notify when a process crashes (non-zero exit)`
- `[ ] Notify when a process exits unexpectedly (zero exit)`

### Save flow

1. Call `window.api.savePrefs(prefs)`
2. Await response
3. On `hotkey_conflict`: stay open, show inline error
4. On success: close modal

### Markup

Preferences modal markup added to `index.html` alongside the existing command modal. No new files needed in the renderer.

---

## Out of Scope (deferred)

- Config file location (path relocation + migration logic)
- Autostart `.desktop` file toggle
- Theme / appearance settings
