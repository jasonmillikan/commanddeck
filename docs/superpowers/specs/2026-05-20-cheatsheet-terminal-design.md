# Design: Cheatsheet Terminal Integration

**Date:** 2026-05-20
**Status:** Approved

## Overview

Three related changes that transform cheatsheet cards from read-only reference into interactive terminal workspaces:

1. **DEL moved to modal** — delete action removed from all card types, replaced with a red button in the edit modal footer
2. **System terminal button** — `OPEN` button on cheatsheet cards spawns the user's preferred terminal with cheatsheet content visible
3. **In-app terminal** — `TERM` button on cheatsheet cards opens a persistent per-card PTY session in the drawer, with a clickable snippet panel above the terminal

---

## Feature 1: DEL Moved to Modal (All Card Types)

### Behavior

The `DEL` button is removed from the card action row for all card types (toggle, launcher, foreground, cheatsheet). Deletion now happens inside the edit modal.

- A red "Delete" button appears in the **bottom-left** of the modal footer
- Only visible when **editing** an existing command (`editingId` is set) — hidden for new commands
- Clicking fires the same `confirm("Delete "${label}"?")` dialog as before
- On confirm: deletes the command, closes the modal, re-renders

### Changes

**`src/renderer/app.js`**
- Remove `data-action="delete"` buttons from all four `renderCard()` branches (cheatsheet early-return + toggle/launcher/foreground action rows)
- In `handleCardAction()`: remove the `'delete'` branch (no longer reachable from cards)
- In the modal footer (wired via `modal-save` area): add delete button handler that reads `editingId`, fires confirm, deletes, closes modal
- Show/hide delete button based on `editingId` in `openModal()` and `closeModal()`

**`src/renderer/index.html`**
- Add `<button class="btn-danger" id="modal-delete">Delete</button>` to the modal footer, before the Cancel/Save pair

**`src/renderer/style.css`**
- Add `.btn-danger { background: transparent; color: var(--danger); border: 1px solid rgba(248,113,113,0.3); }` and `:hover` state

---

## Feature 2: System Terminal Button

### Behavior

A new `OPEN` button on cheatsheet cards spawns the user's system terminal with the cheatsheet content displayed and an interactive shell ready.

**Detection order:**
1. `$TERMINAL` environment variable
2. Try in order: `kitty`, `alacritty`, `gnome-terminal`, `xfce4-terminal`, `konsole`, `xterm`
3. macOS fallback: `open -a Terminal` via `osascript`
4. Nothing found: Electron `Notification` — "No terminal emulator detected — set the `$TERMINAL` environment variable"

**Spawn behavior:**
- Write cheatsheet `content` to a temp file: `path.join(os.tmpdir(), 'commanddeck-<id>.sh')`
- Linux (non-Terminal.app): `<terminal> -- bash -c "cat <tmpfile>; exec $SHELL"`
  - `cat` prints commands above the prompt; `exec $SHELL` hands over to interactive session
- macOS: `osascript -e 'tell application "Terminal" to do script "cat <tmpfile>; exec $SHELL"'`
- Windows: `start cmd /K type <tmpfile>`
- Temp file cleaned up after 30 seconds

No sudo or elevated privileges required. PTY, temp dir writes, and spawning terminals are all standard user-level operations.

### Changes

**`src/main.js`**
- Add `ipcMain.handle('open-in-terminal', async (_, { content, cmdId }) => { ... })`:
  - Writes temp file
  - Detects terminal
  - Spawns terminal process
  - Schedules temp file cleanup after 30s
  - Returns `{ ok: true }` or `{ ok: false, reason: 'no_terminal' }`

**`src/preload.js`**
- Expose `openInTerminal: (content, cmdId) => ipcRenderer.invoke('open-in-terminal', { content, cmdId })`

**`src/renderer/app.js`**
- Add `'open'` to `handleCardAction()` → calls `window.api.openInTerminal(cmd.content, cmd.id)`, shows notification on `no_terminal`
- Add `'term'` to `handleCardAction()` → calls `openDrawer(cmd)` in terminal mode
- Add `OPEN` and `TERM` buttons to cheatsheet `renderCard()` branch; card body becomes `data-action="term"`

---

## Feature 3: In-App Terminal

### Dependencies

| Package | Role | Type |
|---|---|---|
| `xterm` | Terminal renderer (pure JS) | `dependencies` |
| `xterm-addon-fit` | Auto-sizes terminal to container | `dependencies` |
| `node-pty-prebuilt-multiarch` | PTY backend (prebuilt binaries) | `dependencies` |
| `electron-rebuild` | Relinks native module for Electron | `devDependencies` |

`electron-rebuild` is added as a `postinstall` script in `package.json` so `npm install` handles everything.

xterm and xterm-addon-fit are loaded via `<script>`/`<link>` tags from `node_modules` (same pattern as SortableJS).

### PTY Lifecycle (Main Process)

- One PTY per cheatsheet card, identified by `commandId`
- Created lazily on first `pty-create` call for that ID
- Shell: `process.env.SHELL || '/bin/bash'` on Linux/Mac; `powershell.exe` on Windows
- All PTYs killed on `app.on('before-quit')`
- Stored in a `Map<commandId, ptyProcess>` in `main.js`

### IPC Channels

| Channel | Direction | Payload | Description |
|---|---|---|---|
| `pty-create` | renderer → main | `{ commandId }` | Spawn shell for this card (idempotent) |
| `pty-write` | renderer → main | `{ commandId, data }` | Send keystrokes/paste to PTY |
| `pty-resize` | renderer → main | `{ commandId, cols, rows }` | Resize PTY |
| `pty-data` | main → renderer | `{ commandId, data }` | Terminal output, routed to correct xterm instance |

**`src/preload.js`** exposes:
```js
ptyCreate:  (commandId) => ipcRenderer.invoke('pty-create', { commandId })
ptyWrite:   (commandId, data) => ipcRenderer.invoke('pty-write', { commandId, data })
ptyResize:  (commandId, cols, rows) => ipcRenderer.invoke('pty-resize', { commandId, cols, rows })
onPtyData:  (cb) => ipcRenderer.on('pty-data', (_, payload) => cb(payload))
```

### Renderer Side

**xterm instances:** One `Terminal` instance per cheatsheet card, created lazily. Each lives in a `<div id="terminal-${cmd.id}" class="terminal-instance">` inside `#drawer-terminals`. Only the active card's div is visible at a time.

**Global pty-data routing:** A single `window.api.onPtyData` listener is registered once at app startup (not per-card). It maintains a `terminalMap = Map<commandId, Terminal>` and routes incoming data to the correct xterm instance:
```js
const terminalMap = new Map(); // commandId → Terminal instance
window.api.onPtyData(({ commandId, data }) => {
  terminalMap.get(commandId)?.write(data);
});
```

**Initialization (per card, on first open):**
```js
const term = new Terminal({ theme: { background: '#12151f', foreground: '#e2e8f0' }, fontFamily: 'JetBrains Mono, monospace', fontSize: 13 });
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(containerDiv);
fitAddon.fit();
term.onData(data => window.api.ptyWrite(cmd.id, data));
terminalMap.set(cmd.id, term);
await window.api.ptyCreate(cmd.id);
```

**Switching cards:** hide old `terminal-instance` div, show new one, call `fitAddon.fit()`.

**Drawer resize:** existing `initDrawerResize()` `onUp` handler calls `fitAddon.fit()` on the active terminal after resize.

### Drawer Layout (Terminal Mode)

```
[resize handle]
[drawer-header: ▸ Label | [Run all] | [×] ]
[drawer-snippet-panel]
  <each line of cmd.content as a clickable row>
[drawer-terminals]
  <div id="terminal-{id}"> ... xterm canvas ... </div>
  <div id="terminal-{id2}" style="display:none"> ... </div>
```

**Snippet panel behavior:**
- Rendered fresh each time a cheatsheet terminal opens (content may have been edited)
- Click a line → `window.api.ptyWrite(cmd.id, line)` (no trailing newline — user reviews and hits Enter)
- "Run all" → sends each non-empty line followed by `\r` (carriage return, which PTY interprets as Enter); blank lines are skipped

**Mode switching in `openDrawer(cmd)`:**
- `cheatsheet` + `TERM` action: hide `#drawer-output`, hide `drawer-open-log`, show `#drawer-snippet-panel` + `#drawer-terminals`, show `drawer-run-all`
- All other cases (existing behavior): show `#drawer-output`, show/hide `drawer-open-log` per type, hide `#drawer-snippet-panel` + `#drawer-terminals`, hide `drawer-run-all`

### Card Button Changes (Cheatsheet)

Old: `VIEW · EDIT · DEL`
New: `OPEN · TERM · EDIT`

Card body click (`data-action="term"`) opens the in-app terminal (replaces old `data-action="view"`).

---

## What Is Not Changing

- Non-cheatsheet card rendering (except DEL removal)
- The existing `#drawer-output` pre and foreground output streaming
- `state.json`, `commands.json` schema — no new fields on cheatsheet entries
- Tray icon logic
- The drawer resize handle and height persistence
- `prefs.json` — no new preferences (terminal app detection is automatic)
