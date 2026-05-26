# CommandDeck — Project Context for Claude Code

## What is this?

CommandDeck is an Electron-based desktop app for Linux (Ubuntu 22 primary target) that provides a visual "toggle board" for terminal commands. The core problem it solves: power users run the same commands every day and hate hunting through polluted shell history to find them.

It lives in the system tray and presents a card-based UI where commands can be toggled on/off, launched, or managed as foreground processes — with PID tracking, timestamps, output logging, and kill controls.

Built as an open-source project, Electron lets us ship fast and validate the concept first.

## Tech Stack

- **Runtime:** Electron (v42)
- **Frontend:** Vanilla JS, HTML, CSS (no framework — intentionally simple for now)
- **Fonts:** JetBrains Mono (code/mono) + Syne (headings) — bundled WOFF2 in `src/renderer/fonts/` (no CDN); `system-ui` for body/descriptive text (no bundle, set via `--font-body` CSS variable)
- **Drag-to-reorder:** SortableJS (loaded from `node_modules` via `<script>` tag, no bundler)
- **In-app terminal:** xterm.js v4 + xterm-addon-fit (loaded via `<script>` tags, no bundler); node-pty for PTY backend
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
│   ├── config-io.test.js       ← loadConfig, saveConfig, ensureConfigDir
│   ├── prefs.test.js           ← loadPrefs, savePrefs
│   ├── process-manager.test.js ← logLine, saveCurrentState, toggle state round-trip
│   ├── state.test.js           ← loadState, saveState
│   ├── tray-icon.test.js       ← tray icon SVG rendering
│   └── utils.test.js           ← migrateCommands, applyReorder
└── src/
    ├── main/                   ← Electron main process (CommonJS)
    │   ├── main.js             ← entry point: lifecycle + boot wiring only (~50 lines)
    │   ├── preload.js          ← contextBridge API surface (secure Node↔renderer bridge)
    │   ├── config-io.js        ← loadConfig, saveConfig, path constants
    │   ├── platform.js         ← killProcessTree, spawnShell, getAutostart, setAutostart, detectTerminalApp (all OS-varying behavior)
    │   ├── window.js           ← createWindow, createTray, toggleWindow, updateTrayIcon
    │   ├── process-manager.js  ← spawnCommand, kill, toggle state, liveProcesses Map
    │   ├── pty-manager.js      ← ptyCreate, ptyWrite, ptyResize, killAllPty
    │   ├── ipc-handlers.js     ← all ipcMain.handle() registrations (wiring + input validation)
    │   ├── validate-config.js  ← validateConfig() — pure schema validator for commands.json data
    │   ├── tray-icon.js        ← stateful tray icon renderer (SVG, no static assets)
    │   ├── prefs.js            ← loadPrefs, savePrefs, sanitizePrefs, DEFAULTS
    │   └── state.js            ← loadState, saveState (toggle persistence)
    └── renderer/               ← Electron renderer process (ES modules)
        ├── index.html          ← app shell, modal markup, drawer markup
        ├── style.css           ← full styling (CSS variables, dark theme default)
        ├── theme-light.css     ← light theme overrides ([data-theme="light"] variable block only)
        ├── app.js              ← entry point: state, boot, card events, IPC wiring (~280 lines)
        ├── utils.js            ← uid, formatTime, escHtml, badgeFor, migrateCommands, applyReorder, keyEventToAccelerator
        ├── cards.js            ← renderCard, renderCards, renderStats, filteredCommands
        ├── modal.js            ← openModal, closeModal, updateModalFields, tag chips
        ├── drawer.js           ← openDrawer, close/run-all listeners
        ├── terminal.js         ← initTerminal, switchToTerminal, terminalMap, XTERM_THEMES, setXtermTheme
        └── prefs-modal.js      ← openPrefsModal, closePrefsModal, hotkey recording, theme radio
```

## Design Language

- **Theme:** Dark by default (industrial/utilitarian — terminal meets control panel). A "Paper" light theme is also available, toggled in Preferences or inherited from the OS `prefers-color-scheme` setting.
- **Accent colors (dark):** `#4ade80` (terminal green, "running" state), `#22d3ee` (cyan, info/log), `#f87171` (red, danger/kill), `#fbbf24` (amber, launcher/edit)
- **Accent colors (light/Paper):** `#15803d` (darkened green for WCAG contrast), `#0369a1` (blue-cyan), `#dc2626` (red), `#b45309` (amber-brown)
- **Background layers (dark):** `--bg: #0c0e14`, `--bg2: #12151f`, `--bg3: #1a1e2e`
- **Background layers (light/Paper):** `--bg: #fafaf7`, `--bg2: #f2f2ec`, `--bg3: #e8e8e0`
- **Typography:** Syne 700 for headings (`--font-ui`), JetBrains Mono for commands/meta/code (`--font-mono`), system-ui for notes/body/descriptive text (`--font-body`)
- **Card anatomy:** top accent bar (green when running), label + note, command preview, meta (PID + timestamp), toggle/launch control, action buttons

## The Three Command Types

This is the core data model — get this right and everything else follows.

| Type | `type` field | Key fields | Behavior |
|---|---|---|---|
| Toggle | `"toggle"` | `onCmd`, `offCmd` | ON runs and exits (one-shot), OFF runs and exits. No persistent PID. Perfect for `pactl load/unload`. |
| Launcher | `"launcher"` | `launchCmd` | Spawns detached (`detached: true`, `unref()`). App lives on after CommandDeck closes. PID tracked until exit. |
| Foreground | `"foreground"` | `onCmd` | Spawns managed. stdout/stderr streamed to UI drawer and log file. Killable. |
| Cheatsheet | `"cheatsheet"` | `content` | Read-only reference card. No command runs. Has three actions: OPEN (system terminal), TERM (in-app terminal drawer), EDIT. Content is newline-separated; each line is a clickable snippet in the TERM drawer. |

## Config Schema (`~/.commanddeck/commands.json`)

```json
{
  "commands": [
    {
      "id": "abc123",           // uid(), base36 timestamp + random
      "label": "Audio Loopback",
      "note": "Routes mic to audio output (useful for hearing onself while using headphones)",
      "type": "toggle",         // "toggle" | "launcher" | "foreground" | "cheatsheet"
      "tags": ["Audio"],        // optional array; a command can have multiple tags
      "onCmd": "pactl load-module module-loopback latency_msec=1",
      "offCmd": "pactl unload-module module-loopback"
    },
    {
      "id": "def456",
      "label": "Steam",
      "type": "launcher",
      "tags": ["Gaming"],
      "launchCmd": "flatpak run com.valveSoftware.Steam"
    },
    {
      "id": "ghi789",
      "label": "Syncthing",
      "type": "foreground",
      "tags": ["Sync"],
      "onCmd": "syncthing -allow-newer-config"
    },
    {
      "id": "jkl012",
      "label": "Network Info",
      "note": "Commands for checking IP and network interfaces",
      "type": "cheatsheet",
      "tags": ["Network"],
      "content": "ip addr show\nip route\nss -tulnp"
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
| `runCommand({ commandId, type })` | Spawns or execs. `cmdString` is looked up from saved config by main process — renderer value is ignored. Returns `{ ok, pid?, startedAt?, logFile? }` |
| `killProcess(pid)` | SIGTERM to pid |
| `openLog(logFile)` | `shell.openPath` the log file |
| `openLogDir()` | Opens `~/.commanddeck/logs/` |
| `exportConfig()` | Opens native Save dialog, writes config to chosen path |
| `importConfig()` | Opens native Open dialog, confirms, loads config from chosen path |
| `minimize()` / `hide()` | Window controls |
| `loadPrefs()` | Returns parsed `prefs.json` |
| `savePrefs(data)` | Writes `prefs.json`, re-registers global hotkey |
| `getAutostart()` | Returns `true` if `~/.config/autostart/commanddeck.desktop` exists |
| `setAutostart(enabled)` | Writes or removes the autostart `.desktop` file |
| `openInTerminal({ content, cmdId })` | Opens user's system terminal emulator displaying cheatsheet content, then hands off to an interactive shell |
| `ptyCreate(commandId)` | Creates a PTY session for a cheatsheet card (idempotent — no-op if already exists) |
| `ptyWrite(commandId, data)` | Writes data/keystrokes to a PTY session |
| `ptyResize(commandId, cols, rows)` | Resizes a PTY session to match the xterm display |

Events from main → renderer via `ipcRenderer.on`:
- `process-exited` → `{ commandId, pid, code }`
- `process-output` → `{ commandId, pid, text }`
- `pty-data` → `{ commandId, data }` — PTY output chunk for a cheatsheet terminal session
- `pty-exit` → `{ commandId, exitCode }` — PTY session ended (shell exited)


## Developer Notes

- **No build step** — this is intentionally plain JS/HTML/CSS. No webpack, no transpilation. `npm start` runs directly.
- **Context isolation is ON** — never add `nodeIntegration: true`. All Node access goes through `preload.js` → `contextBridge`.
- **In-memory live state** — `liveProcesses` Map in `process-manager.js` and `liveMap` object in `app.js` are not persisted. App restart clears them. This is fine for now (foreground processes die with the app anyway; launchers are detached and survive but lose tracking).
- **`ELECTRON_RUN_AS_NODE` in VS Code** — VS Code's extension host sets `ELECTRON_RUN_AS_NODE=1` in its environment, which is inherited by all child processes including the integrated terminal. This silently puts Electron into plain Node.js mode: `process.type` is undefined, browser APIs are unavailable, and `require('electron')` returns the binary path string instead of the API. The `start` and `dev` scripts work around this with `env -u ELECTRON_RUN_AS_NODE electron .`. If you see `TypeError: Cannot read properties of undefined (reading 'whenReady')`, this is the cause — run from an external terminal or check that the env var is being unset.
- **Platform abstraction** — `src/main/platform.js` centralizes all OS-varying behavior. Do not put platform checks (`process.platform === 'win32'`) directly in other main-process files — add a function to `platform.js` instead. Windows branches in `platform.js` use lazy `require('electron')` (inside the function body, not at the top of the file) so the module loads cleanly in plain Node.js during tests.
- **Process kill behavior** — All spawned processes use `detached: true` so each becomes a process group leader. Kills are routed through `platform.killProcessTree(pid)` — on Linux this sends SIGTERM to the negative PID (process group), on Windows it uses `taskkill /T /F`. This ensures bash's children (the actual command) receive the signal, not just the bash wrapper. On quit, only non-launcher processes are stopped; launcher processes intentionally keep running. Note: with `detached: true`, foreground processes are removed from Node's controlling terminal session, so Ctrl+C in the terminal (during `npm start` development) will not propagate to foreground child processes — use the app's KILL button or quit instead.
- **Log file per run** — each invocation of a command creates a new log file with timestamp in the name. Old logs are never cleaned up automatically (future: log rotation).
- **node-pty native module** — uses Microsoft's `node-pty` (not `node-pty-prebuilt-multiarch`). It includes C++ source and is compiled by `electron-rebuild` on `npm install` (via `postinstall`). A `patch-package` patch in `patches/node-pty+1.1.0.patch` forces `-std=c++20` in `binding.gyp` — required because Electron 42 uses Node.js 24 headers which mandate C++20. Do not remove the patch or switch to `node-pty-prebuilt-multiarch`; the prebuilt package has no binary for Electron 42's ABI (v146) and its npm release omits the C++ source.
- **PTY session lifecycle** — `ptyProcesses` Map in `pty-manager.js` holds one PTY per cheatsheet `commandId`. `pty-create` is idempotent (skips if already exists). `pty-exit` event deletes the map entry so the next open re-creates cleanly. All PTY processes are killed in the `will-quit` handler.
- **xterm instances** — `terminalMap` in `terminal.js` holds `{ term, fitAddon, ready, pendingWrites }` per `commandId`. The entry is set (with `ready: false`) before `await ptyCreate` so concurrent drawer opens can queue snippet writes into `pendingWrites[]`. The global `onPtyData` listener in `app.js` flushes the queue on the first data event. `onPtyExit` deletes the map entry so the terminal re-initialises on next open.
- **Module architecture** — the renderer uses ES modules (`type="module"` on the `app.js` script tag). `app.js` is the entry point and owns shared state; all other renderer modules receive state via getter callbacks injected at boot (`initModal`, `initDrawer`, `initPrefsModal`). The main process stays CommonJS; `ipc-handlers.js` is a pure wiring layer and contains no business logic.
- **`utils.js` is a pure ES module** — `src/renderer/utils.js` uses `export function` declarations. Test files load it with `await import(...)` inside a `before()` hook (dynamic import from CommonJS). Do not add `module.exports` or a dual-env guard.
- **Tags vs. group** — the old `group: string` field is obsolete. The schema now uses `tags: string[]`. `migrateCommands()` in `utils.js` auto-converts old configs on `loadAll()` — no manual migration needed. Never write a `group` field to `commands.json`.
- **SortableJS instance** — `sortableInstance` in `cards.js` must be destroyed before every `renderCards()` call (innerHTML replacement detaches old DOM nodes). The empty-state path also destroys it. Do not call `Sortable.create()` without first calling `sortableInstance.destroy()`.
- **Drag reorder selector** — `handleDragEnd` uses `.card[data-id]` (not bare `[data-id]`) to read card order from the DOM. Card action buttons also carry `data-id`; the class scope prevents them being picked up as card roots.
- **Theming system** — theme is driven by a `data-theme` attribute on `<html>` (`"dark"` or `"light"`). `style.css` defines the dark default in `:root`; `theme-light.css` overrides variables under `[data-theme="light"]`. `initTheme(pref)` in `app.js` resolves the pref (`"system"` | `"light"` | `"dark"`), sets the attribute, and manages a `matchMedia` OS-change listener. The xterm.js terminal follows via `setXtermTheme(mode)` in `terminal.js`, which updates `term.options.theme` on all open terminals. Theme preference is stored as `prefs.theme` in `~/.commanddeck/prefs.json`. Tray icon is intentionally excluded — it lives in the OS tray, not the app window.
- **Security hardening (2026-05-21)** — A pre-publication security audit was completed and all findings fixed. Key invariants: (1) `run-command` handler ignores renderer-supplied `cmdString` and `label` — looks up both from saved config by `commandId`; (2) `kill-process` validates PID is a positive integer AND tracked in `liveProcesses` before signaling; (3) `open-external` only allows `https:` and `http:` protocols; (4) `open-log` confines paths to `LOG_DIR`; (5) `save-config`/`import-config` run `validateConfig()` before writing — rejects unknown IDs, types, or oversized fields; (6) `save-prefs` runs `sanitizePrefs()` — strips unknown keys and coerces types; (7) `pty-create` validates `commandId` is a known cheatsheet; (8) `will-navigate` blocks external navigation; CSP blocks inline scripts. See `src/main/validate-config.js` for the config schema.
