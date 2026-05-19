# CommandDeck — Project Context for Claude Code

## What is this?

CommandDeck is an Electron-based desktop app for Linux (Ubuntu 22 primary target) that provides a visual "toggle board" for terminal commands. The core problem it solves: power users run the same commands every day and hate hunting through polluted shell history to find them.

It lives in the system tray and presents a card-based UI where commands can be toggled on/off, launched, or managed as foreground processes — with PID tracking, timestamps, output logging, and kill controls.

Built as an open-source project, Electron lets us ship fast and validate the concept first.

## Tech Stack

- **Runtime:** Electron (v29+)
- **Frontend:** Vanilla JS, HTML, CSS (no framework — intentionally simple for now)
- **Fonts:** JetBrains Mono (code/mono) + Syne (UI) via Google Fonts
- **Config storage:** `~/.commanddeck/commands.json` (plain JSON, human-readable, git-friendly)
- **Log storage:** `~/.commanddeck/logs/` (one timestamped `.log` file per command run)
- **IPC:** Electron's contextBridge + ipcMain/ipcRenderer (context isolation enabled)
- **Process management:** Node.js `child_process` — `spawn` for long-running, `exec` for one-shots

## Project Structure

```
commanddeck/
├── CLAUDE.md              ← you are here
├── README.md
├── package.json
├── test/
│   └── tray-icon.test.js  ← unit tests for tray icon renderer (node --test)
└── src/
    ├── main.js            ← Electron main process (window, tray, IPC, process mgmt)
    ├── preload.js         ← contextBridge API surface (secure Node↔renderer bridge)
    ├── tray-icon.js       ← stateful tray icon renderer (RGBA pixel buffer, no static assets)
    └── renderer/
        ├── index.html     ← app shell, modal markup, drawer markup
        ├── style.css      ← full styling (CSS variables, dark theme)
        └── app.js         ← all UI logic, state, card rendering, event handling
```

## Design Language

- **Theme:** Dark, industrial/utilitarian. Think terminal meets control panel.
- **Accent colors:** `#4ade80` (terminal green, "running" state), `#22d3ee` (cyan, info/log), `#f87171` (red, danger/kill), `#fbbf24` (amber, launcher/edit)
- **Background layers:** `--bg: #0c0e14`, `--bg2: #12151f`, `--bg3: #1a1e2e`
- **Typography:** Syne 800 for headings, JetBrains Mono for commands/meta/code
- **Card anatomy:** top accent bar (green when running), label + note, command preview, meta (PID + timestamp), toggle/launch control, action buttons

## The Three Command Types

This is the core data model — get this right and everything else follows.

| Type | `type` field | Key fields | Behavior |
|---|---|---|---|
| Toggle | `"toggle"` | `onCmd`, `offCmd` | ON runs and exits (one-shot), OFF runs and exits. No persistent PID. Perfect for `pactl load/unload`. |
| Launcher | `"launcher"` | `launchCmd` | Spawns detached (`detached: true`, `unref()`). App lives on after CommandDeck closes. PID tracked until exit. |
| Foreground | `"foreground"` | `onCmd` | Spawns managed. stdout/stderr streamed to UI drawer and log file. Killable. |

## Config Schema (`~/.commanddeck/commands.json`)

```json
{
  "commands": [
    {
      "id": "abc123",           // uid(), base36 timestamp + random
      "label": "Audio Loopback",
      "note": "Routes mic to audio output (useful for hearing onself while using headphones)",
      "type": "toggle",         // "toggle" | "launcher" | "foreground"
      "group": "Audio",         // optional, used for sidebar grouping
      "onCmd": "pactl load-module module-loopback latency_msec=1",
      "offCmd": "pactl unload-module module-loopback"
    },
    {
      "id": "def456",
      "label": "Steam",
      "type": "launcher",
      "group": "Gaming",
      "launchCmd": "flatpak run com.valveSoftware.Steam"
    },
    {
      "id": "ghi789",
      "label": "Syncthing",
      "type": "foreground",
      "group": "Sync",
      "onCmd": "syncthing -allow-newer-config"
    }
  ]
}
```

## IPC API Surface (preload.js → main.js)

All calls go through `window.api.*`:

| Method | Description |
|---|---|
| `loadConfig()` | Returns parsed `commands.json` |
| `saveConfig(data)` | Writes `commands.json` |
| `getLiveProcesses()` | Returns `{ commandId: [{ pid, startedAt, logFile }] }` |
| `runCommand({ commandId, label, cmdString, type })` | Spawns or execs. Returns `{ ok, pid?, startedAt?, logFile? }` |
| `killProcess(pid)` | SIGTERM to pid |
| `openLog(logFile)` | `shell.openPath` the log file |
| `openLogDir()` | Opens `~/.commanddeck/logs/` |
| `exportConfig()` | Opens native Save dialog, writes config to chosen path |
| `importConfig()` | Opens native Open dialog, confirms, loads config from chosen path |
| `minimize()` / `hide()` | Window controls |

Events from main → renderer via `ipcRenderer.on`:
- `process-exited` → `{ commandId, pid, code }`
- `process-output` → `{ commandId, pid, text }`

## Known Gaps / Improvement Areas

These were identified at the end of the prototype session — good starting points:

1. ~~**Native file dialog**~~ — **Done.** Export uses `dialog.showSaveDialog` with a suggested default filename; import uses `dialog.showOpenDialog` + a `dialog.showMessageBox` confirmation. All file I/O and dialogs live in the main process. No `prompt()` or `alert()` calls remain in the renderer.

2. ~~**Tray icon missing**~~ — **Done.** Stateful 2×2 grid icon in `src/tray-icon.js`. Generates RGBA pixel buffers at runtime (no static assets). Reflects live process count (filled squares) and shows a red/amber badge on unexpected exits. Active toggles count toward the filled-square total.

3. ~~**Toggle state persistence**~~ — **Done.** Per-toggle "Auto-restore on startup" checkbox (stored as `autoRestore: true` in commands.json). Auto-restore re-runs `onCmd` on startup; remember-only toggles show an amber "last session" indicator. State persisted in `~/.commanddeck/state.json` (app-managed, never exported).

   **Follow-on:** A `checkCmd` field per toggle (e.g., `pactl list short modules | grep module-loopback`) would allow the app to verify real system state rather than relying on last-known memory. Skipped as out of scope for this iteration.

4. **Autostart `.desktop` file** — UI option to enable/disable autostart by writing to `~/.config/autostart/commanddeck.desktop`.

5. **Desktop notifications** — notify when a foreground process exits unexpectedly (Electron's `Notification` API).

6. **Drag-to-reorder cards** — currently order is insertion order. HTML5 drag-and-drop or a library like Sortable.js.

7. **Card groups as collapsible sections** — currently groups just filter; could render as labeled collapsible sections on the board.

8. **Import/export UX** — use native file dialogs, add a "share board" export format.

9. **Keyboard shortcuts** — global hotkey to show/hide window (Electron `globalShortcut`).

10. **Packaging** — `.deb`, AppImage, or Snap for distribution. `electron-builder` is the standard tool.

## Developer Notes

- **No build step** — this is intentionally plain JS/HTML/CSS. No webpack, no transpilation. `npm start` runs directly.
- **Context isolation is ON** — never add `nodeIntegration: true`. All Node access goes through `preload.js` → `contextBridge`.
- **In-memory live state** — `liveProcesses` Map in `main.js` and `liveMap` object in `app.js` are not persisted. App restart clears them. This is fine for now (foreground processes die with the app anyway; launchers are detached and survive but lose tracking).
- **Log file per run** — each invocation of a command creates a new log file with timestamp in the name. Old logs are never cleaned up automatically (future: log rotation).
- **`app.js` is a single file** — fine for prototype, but as features grow, consider splitting into modules: `state.js`, `cards.js`, `modal.js`, `drawer.js`.