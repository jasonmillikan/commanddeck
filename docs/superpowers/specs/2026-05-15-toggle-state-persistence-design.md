# Toggle State Persistence — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Gap item:** #3 — Toggle state persistence (app restart forgets which toggles were ON)

---

## Problem

Toggle commands are one-shot: the `onCmd` runs and exits immediately, leaving no persistent process. On restart, both `activeToggles` (main process) and `liveMap` (renderer) are empty, so all toggle cards appear OFF regardless of actual system state. The user has to remember which toggles were on and manually re-enable them.

---

## Decision: Per-Toggle Restore Behavior

Each toggle command has a user-configurable "Auto-restore on startup" flag. This was chosen over two alternatives:

- **Startup prompt** (list all previously-active toggles, let user pick which to restore) — rejected because it adds a startup interruption and still requires the user to know which ones are safe to re-run.
- **Visual memory only** (always remember state, never re-run) — rejected because it leaves auto-restore as a future gap even for clearly idempotent commands.

The checkbox approach was chosen as the minimal form: one field, two states (restore / remember-only), no modal clutter. The tradeoff is that users must configure this per command rather than making a one-time bulk decision. Documented here in case a startup-prompt flow proves more ergonomic in practice.

### Not in scope: verification

Toggle commands leave no running process, so there is no PID to check. Genuine verification would require an optional `checkCmd` field per toggle (e.g., `pactl list short modules | grep module-loopback`). This is a natural follow-on gap and should be added to the Known Gaps list when toggle state persistence is complete.

---

## Data Model

### `~/.commanddeck/state.json` (new file)

App-managed runtime state. Never exported with config, never user-edited.

```json
{
  "toggles": {
    "abc123": true,
    "def456": true
  }
}
```

- Keys are commandIds of toggles that were ON when the app last wrote state.
- Written on every toggle-on and toggle-off event.
- Created empty (`{ "toggles": {} }`) on first run via `ensureConfigDir()`.
- Stale entries (commandId no longer in config) are silently skipped on load — no cleanup needed.

### `autoRestore` field in `commands.json`

Added to toggle-type commands only. Optional, defaults to `false`.

```json
{
  "id": "abc123",
  "label": "Audio Loopback",
  "type": "toggle",
  "autoRestore": true,
  "onCmd": "pactl load-module module-loopback latency_msec=1",
  "offCmd": "pactl unload-module module-loopback"
}
```

Ignored on `launcher` and `foreground` commands.

---

## Architecture: Main Process (`src/main.js`)

### New constants / state

```js
const STATE_PATH = path.join(os.homedir(), '.commanddeck', 'state.json');

// Replaces the activeToggles Set — tracks verified-this-session toggles with metadata
// commandId → { startedAt, logFile }
const activeTogglesMeta = new Map();

// commandIds that were active last session but not auto-restored (remember-only)
const lastSessionToggles = new Set();
```

`activeTogglesMeta.size` replaces `activeToggles.size` in the tray icon count.

### `loadState()` / `saveState()`

Mirror `loadConfig` / `saveConfig`. `loadState()` returns `{ toggles: {} }` if the file is missing or corrupt.

`saveState()` writes the union of verified-this-session and last-session toggle commandIds. Both must be persisted — last-session toggles should survive multiple restarts without the user touching them:

```js
function saveState() {
  const toggles = {};
  for (const id of activeTogglesMeta.keys()) toggles[id] = true;
  for (const id of lastSessionToggles) toggles[id] = true;
  fs.writeFileSync(STATE_PATH, JSON.stringify({ toggles }, null, 2));
}
```

### `restoreToggleState()`

Called in `app.whenReady()` after `createWindow()`. Loads both config and state, then for each active commandId in state:

1. Find the command in config. If not found: skip (stale entry).
2. If `autoRestore: true`: call `spawnCommand(commandId, label, onCmd, 'toggle-on')`. The normal exit handler adds it to `activeTogglesMeta` and calls `saveState()`.
3. If `autoRestore: false` (or unset): add commandId to `lastSessionToggles`.

Auto-restore spawns happen before the renderer's first `getLiveProcesses()` call. Toggle-on commands are typically fast (sub-second), so they will usually have exited and landed in `activeTogglesMeta` by the time the renderer renders. If they haven't exited yet, they appear in `liveProcesses` with a real PID instead — the renderer shows them as ON either way, and the normal `process-exited` flow handles the transition. No special timing coordination needed.

### Updated exit handlers in `spawnCommand()`

When a `toggle-on` command exits with code 0 (existing `activeToggles.add(commandId)` line):

```js
// was: activeToggles.add(commandId)
activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
lastSessionToggles.delete(commandId); // clear any last-session marker
saveState();
```

When a `toggle-off` command succeeds (existing `activeToggles.delete(commandId)` line):

```js
// was: activeToggles.delete(commandId)
activeTogglesMeta.delete(commandId);
lastSessionToggles.delete(commandId);
saveState();
```

### Updated `getLiveProcesses()` IPC

Returns three sources merged under commandId keys:

1. Real live processes from `liveProcesses` Map (unchanged).
2. `activeTogglesMeta` entries: `{ pid: null, startedAt, logFile, lastSession: false }`.
3. `lastSessionToggles` entries: `{ pid: null, startedAt: null, logFile: null, lastSession: true }`.

No new IPC endpoints added.

---

## Architecture: Renderer (`src/renderer/app.js`)

### `loadAll()`

No change. `getLiveProcesses()` now returns last-session entries, so `liveMap` is correctly populated on startup without additional calls.

### `renderCard()` — meta HTML

Three visual states for toggle cards:

| State | Indicator | Color |
|---|---|---|
| Running (current session) | `● since HH:MM:SS` | `--accent` (green) |
| Last session (unverified) | `◌ last session` | `--accent-amber` (muted amber) |
| Idle | `○ idle` | muted/dim |

The `lastSession` flag comes from `liveMap[cmd.id][0]?.lastSession`. If true, render the amber "last session" meta; if false and entry exists, render normal running meta; if no entry, render idle.

### `startCommand()` / `stopCommand()`

No changes needed. When a last-session toggle is turned ON, it runs the normal flow and becomes a verified current-session entry in main (which writes state). When turned OFF, `liveMap[cmd.id] = []` clears it as usual.

---

## Architecture: Edit Dialog (`src/renderer/app.js` — modal section)

A new checkbox row added to the modal, visible only when type is `toggle`:

- **Label:** "Auto-restore on startup"
- **Field id:** `f-auto-restore`
- **Behavior:** Shown/hidden by `updateModalFields()` alongside the OFF command row.
- **Saved:** `autoRestore: document.getElementById('f-auto-restore').checked` in the modal save handler (only written when `type === 'toggle'`).
- **Loaded:** `document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false` in `openModal()`.

---

## File Changes Summary

| File | Change |
|---|---|
| `src/main.js` | `STATE_PATH`, `loadState()`, `saveState()`, `restoreToggleState()`, replace `activeToggles` Set with `activeTogglesMeta` Map + `lastSessionToggles` Set, update toggle-on/off exit handlers, augment `getLiveProcesses()` |
| `src/renderer/app.js` | Update `renderCard()` meta HTML for last-session state, add `f-auto-restore` checkbox to modal, update `openModal()` and modal save handler, update `updateModalFields()` |
| `src/renderer/index.html` | Add `f-auto-restore` checkbox row markup to modal |
| `~/.commanddeck/state.json` | Created automatically on first run |

No new IPC endpoints. No new npm dependencies.
