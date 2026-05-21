# Design: Maximize Button, Drawer Resize, Cheatsheet Type

**Date:** 2026-05-20
**Status:** Approved

## Overview

Three independent UI features:
1. **Maximize button** — toggle maximize/restore from the custom titlebar
2. **Log panel resize** — drag the output drawer to any height; persisted across sessions
3. **Cheatsheet command type** — read-only reference cards whose content displays in the existing output drawer

---

## Feature 1: Maximize Button

### Behavior
A button in the custom titlebar toggles the window between maximized and normal (restored) state. The icon reflects current state: `□` when normal, `❐` when maximized. Electron fires `maximize`/`unmaximize` events that keep the icon in sync even when the window is maximized via other means (e.g. tiling WM).

### Changes

**`src/main.js`**
- Add `ipcMain.handle('window-maximize', () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); })`.
- In `createWindow()`, wire `mainWindow.on('maximize', ...)` and `mainWindow.on('unmaximize', ...)` to push state to renderer: `mainWindow.webContents.send('window-maximized', bool)`.

**`src/preload.js`**
- Expose `toggleMaximize: () => ipcRenderer.invoke('window-maximize')`.
- Expose `onWindowMaximized: (cb) => ipcRenderer.on('window-maximized', (_, v) => cb(v))`.

**`src/renderer/index.html`**
- Add `<button class="tb-btn" id="btn-maximize" title="Maximize">□</button>` between `btn-minimize` and `btn-hide` in `.titlebar-controls`.

**`src/renderer/app.js`**
- Wire `btn-maximize` click → `window.api.toggleMaximize()`.
- Listen via `window.api.onWindowMaximized(isMax => { btn.textContent = isMax ? '❐' : '□'; })`.

---

## Feature 2: Log Panel Resize

### Behavior
A 5px drag handle sits at the top edge of the output drawer. Dragging it resizes the drawer height, clamped between 100px and 60% of the window height. On `mouseup`, the new height is saved to `prefs.json` and restored on next launch. Default height remains 240px.

### Changes

**`src/renderer/index.html`**
- Add `<div class="drawer-resize-handle" id="drawer-resize-handle"></div>` as the first child of `.drawer` (above `.drawer-header`).

**`src/renderer/style.css`**
- Remove `height: 240px` from `.drawer` (height applied via inline style from JS).
- Add `.drawer-resize-handle` styles: `height: 5px; cursor: ns-resize; flex-shrink: 0; background: transparent; transition: background 0.15s;` with `:hover { background: var(--border2); }`.

**`src/prefs.js`**
- Add `drawerHeight: 240` to `DEFAULTS`.

**`src/renderer/app.js`**
- On boot (`loadAll()`), apply `document.getElementById('output-drawer').style.height = prefs.drawerHeight + 'px'`.
- Attach `mousedown` on `#drawer-resize-handle`:
  - On `mousemove` (document): compute `newHeight = window.innerHeight - e.clientY`, clamped to `[100, window.innerHeight * 0.6]`, apply as inline style.
  - On `mouseup` (document): remove listeners, save `{ ...prefs, drawerHeight: newHeight }` via `window.api.savePrefs(...)`, update local `prefs.drawerHeight`.

---

## Feature 3: Cheatsheet Type

### Schema
```json
{
  "id": "abc123",
  "type": "cheatsheet",
  "label": "Git Workflows",
  "note": "Day-to-day git commands",
  "tags": ["Dev"],
  "content": "git add -p\ngit commit -m '...'\ngit push"
}
```
No `onCmd`, `offCmd`, `launchCmd`, or `autoRestore` fields.

### Card Anatomy
- **Top accent bar:** uses `--border2` (inactive, same as default — cheatsheets are never "running")
- **Header:** label, note, `SHEET` badge (violet `#a78bfa`)
- **Content preview:** first line of `content` in the `.card-cmd` slot, ellipsed — serves as a preview
- **No meta row** (no idle/PID state — cheatsheets have no process)
- **No toggle/start control**
- **Card body:** `data-action="view"` so clicking anywhere on the body opens the drawer
- **Action buttons:** VIEW, EDIT, DEL (no LOG, no KILL)

### Drawer Behavior
- `openDrawer(cmd)` always sets `#drawer-open-log` visibility based on `cmd.type === 'cheatsheet'` (hidden for cheatsheets, visible for all others) — no separate restore step needed on close.
- For cheatsheets: sets `#drawer-output` to `cmd.content` directly.
- Drawer title: `▸ Label` (same pattern as other types).

### Modal Changes

**`src/renderer/index.html`**
- Add `<div id="f-content-row"><label>Content <span class="required">*</span><textarea id="f-content" rows="6" placeholder="Enter reference content…"></textarea></label></div>` in `.modal-body`, after the type selector.
- Add `"cheatsheet"` option to `#f-type` select: `<option value="cheatsheet">Cheatsheet (read-only reference)</option>`.

**`src/renderer/style.css`**
- Add `.badge-cheatsheet { background: rgba(167,139,250,0.12); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }`.
- Style `#f-content` textarea: same appearance as other modal inputs, `resize: vertical`, `font-family: var(--font-mono)`.

**`src/renderer/app.js`**
- `badgeFor()`: add `cheatsheet` → `badge-cheatsheet` / `SHEET`.
- `updateModalFields()`: when type is `cheatsheet`, hide `f-on-row`, `f-off-row`, `f-auto-restore-row`; show `f-content-row`. For all other types, hide `f-content-row`.
- `openModal()`: populate `#f-content` with `cmd.content || ''`.
- `modal-save` handler: when type is `cheatsheet`, require label + content (not `onCmd`); build entry with `content` field; omit command fields.
- `renderCard()`: handle `cheatsheet` type — no `card-cmd` command display (use content preview instead), no meta, no control row, card body gets `data-action="view"`, actions are VIEW/EDIT/DEL.
- `handleCardAction()`: add `'view'` action → calls `openDrawer(cmd)`.
- `filteredCommands()`: extend search to include `(cmd.content || '').toLowerCase().includes(q)`.

### CLAUDE.md Updates
- Add `cheatsheet` row to the command types table.
- Add `content` field to the config schema example.
- Remove item #7 (card tags as collapsible sections) from Known Gaps.

---

## What Is Not Changing
- No new IPC channels beyond `window-maximize` and the existing `save-prefs`.
- No migration needed in `migrateCommands()` — cheatsheet is a new type, not a rename.
- No changes to `tray-icon.js` — cheatsheets are never "running" so they don't affect the live process count.
- No changes to `state.json` handling — cheatsheets have no toggle state.
