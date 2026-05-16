# Toggle State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist toggle ON/OFF state across app restarts, with a per-toggle "Auto-restore on startup" option and a visual "last session" indicator for unverified toggles.

**Architecture:** A new `src/state.js` module handles pure `loadState`/`saveState` I/O (testable, no Electron dependency). `main.js` replaces the in-memory `activeToggles` Set with `activeTogglesMeta` Map and `lastSessionToggles` Set, both persisted to `~/.commanddeck/state.json`. On startup, `restoreToggleState()` re-runs `onCmd` for auto-restore toggles and marks others as last-session. The renderer receives last-session entries via the augmented `getLiveProcesses()` IPC and displays an amber "last session" indicator.

**Tech Stack:** Node.js `fs` (sync), Electron IPC, `node:test` built-in test runner

---

## File Map

| File | Change |
|---|---|
| `src/state.js` | **Create** — pure `loadState(path)` / `saveState(path, ids)` functions |
| `test/state.test.js` | **Create** — unit tests for state I/O |
| `package.json` | **Modify** — add `test/state.test.js` to test script |
| `src/main.js` | **Modify** — STATE_PATH, state infrastructure, restoreToggleState, updated toggle handlers, updated getLiveProcesses |
| `src/renderer/app.js` | **Modify** — last-session meta in renderCard, autoRestore field in modal |
| `src/renderer/index.html` | **Modify** — add auto-restore checkbox row to modal |
| `src/renderer/style.css` | **Modify** — add `.meta-dot.last-session` and `.meta-last-session` styles, `.checkbox-label` style |

---

## Task 1: Create `src/state.js` and unit tests

**Files:**
- Create: `src/state.js`
- Create: `test/state.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Create `test/state.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadState, saveState } = require('../src/state');

function tmpPath() {
  return path.join(os.tmpdir(), `state-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('loadState returns empty toggles when file does not exist', () => {
  const result = loadState('/nonexistent/path/state.json');
  assert.deepEqual(result, { toggles: {} });
});

test('loadState returns empty toggles when file contains corrupt JSON', () => {
  const p = tmpPath();
  fs.writeFileSync(p, 'not valid json {{');
  try {
    const result = loadState(p);
    assert.deepEqual(result, { toggles: {} });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState writes all provided ids as true booleans', () => {
  const p = tmpPath();
  try {
    saveState(p, ['abc123', 'def456']);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: { abc123: true, def456: true } });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState with empty iterable writes empty toggles object', () => {
  const p = tmpPath();
  try {
    saveState(p, []);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: {} });
  } finally {
    fs.unlinkSync(p);
  }
});

test('loadState roundtrips saveState output correctly', () => {
  const p = tmpPath();
  try {
    saveState(p, ['x1', 'x2', 'x3']);
    const result = loadState(p);
    assert.deepEqual(result.toggles, { x1: true, x2: true, x3: true });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState accepts any iterable (Set, Map keys, generator)', () => {
  const p = tmpPath();
  try {
    const ids = new Set(['a', 'b', 'c']);
    saveState(p, ids);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: { a: true, b: true, c: true } });
  } finally {
    fs.unlinkSync(p);
  }
});
```

- [ ] **Step 2: Run tests — verify they fail with "Cannot find module '../src/state'"**

```bash
node --test test/state.test.js
```

Expected: all 6 tests fail with `Error: Cannot find module '../src/state'`

- [ ] **Step 3: Create `src/state.js`**

```js
const fs = require('fs');

function loadState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { toggles: {} };
  }
}

function saveState(statePath, activeIds) {
  const toggles = {};
  for (const id of activeIds) toggles[id] = true;
  fs.writeFileSync(statePath, JSON.stringify({ toggles }, null, 2));
}

module.exports = { loadState, saveState };
```

- [ ] **Step 4: Run tests — verify all 6 pass**

```bash
node --test test/state.test.js
```

Expected: `▶ 6 tests passed`

- [ ] **Step 5: Add state test to the test script in `package.json`**

Change the `"test"` line from:
```json
"test": "node --test test/tray-icon.test.js"
```
to:
```json
"test": "node --test test/tray-icon.test.js test/state.test.js"
```

- [ ] **Step 6: Run full suite — verify all tests pass**

```bash
npm test
```

Expected: all tray-icon tests + all 6 state tests pass, no failures.

- [ ] **Step 7: Commit**

```bash
git add src/state.js test/state.test.js package.json
git commit -m "feat: extract state I/O to src/state.js with unit tests"
```

---

## Task 2: Update `main.js` — state infrastructure

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the state module import and STATE_PATH**

At the top of `src/main.js`, after the existing `require` statements (around line 7), add:

```js
const { loadState, saveState } = require('./state');
```

After the existing `CONFIG_PATH` and `LOG_DIR` constants (around line 22–23), add:

```js
const STATE_PATH = path.join(os.homedir(), '.commanddeck', 'state.json');
```

- [ ] **Step 2: Replace `activeToggles` Set with two new structures**

Find line 19:
```js
const activeToggles = new Set();
```

Replace with:
```js
// commandId → { startedAt, logFile } — verified active this session
const activeTogglesMeta = new Map();
// commandIds active last session, not yet verified (remember-only)
const lastSessionToggles = new Set();
```

- [ ] **Step 3: Add `saveCurrentState()` helper**

After the `lastSessionToggles` declaration, add:

```js
function saveCurrentState() {
  saveState(STATE_PATH, [...activeTogglesMeta.keys(), ...lastSessionToggles]);
}
```

- [ ] **Step 4: Create `state.json` in `ensureConfigDir()`**

In `ensureConfigDir()` (around line 25–32), add a state file creation line after the `CONFIG_PATH` check:

```js
function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ commands: [] }, null, 2));
  }
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ toggles: {} }, null, 2));
  }
}
```

- [ ] **Step 5: Fix `updateTrayIcon()` to use the new structures**

Find in `updateTrayIcon()` (around line 130):
```js
const running = liveProcesses.size + activeToggles.size;
```

Replace with:
```js
const running = liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size;
```

- [ ] **Step 6: Verify the app still starts without errors**

```bash
npm start
```

Expected: app launches, tray icon appears, no console errors. Quit the app.

- [ ] **Step 7: Commit**

```bash
git add src/main.js
git commit -m "feat: add state infrastructure to main.js (STATE_PATH, activeTogglesMeta, lastSessionToggles)"
```

---

## Task 3: Update `main.js` — `restoreToggleState()` and startup call

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `restoreToggleState()` function**

Add this function after `updateTrayIcon()` (around line 132) and before the process helpers section:

```js
function restoreToggleState() {
  const state = loadState(STATE_PATH);
  const cfg = loadConfig();
  const commandMap = new Map(cfg.commands.map(c => [c.id, c]));

  for (const [commandId, active] of Object.entries(state.toggles)) {
    if (!active) continue;
    const cmd = commandMap.get(commandId);
    if (!cmd || cmd.type !== 'toggle') continue;

    if (cmd.autoRestore) {
      spawnCommand(commandId, cmd.label, cmd.onCmd, 'toggle-on');
    } else {
      lastSessionToggles.add(commandId);
    }
  }
  updateTrayIcon();
}
```

- [ ] **Step 2: Call `restoreToggleState()` in `app.whenReady()`**

Find the `app.whenReady().then(...)` block at the bottom of `src/main.js`:

```js
app.whenReady().then(() => {
  ensureConfigDir();
  createWindow();
  createTray();
  updateTrayIcon();
});
```

Replace with:

```js
app.whenReady().then(() => {
  ensureConfigDir();
  createWindow();
  createTray();
  restoreToggleState();
});
```

(`restoreToggleState` calls `updateTrayIcon()` itself — the separate call is no longer needed.)

- [ ] **Step 3: Verify auto-restore works end-to-end**

This requires a toggle command in your config. If you have one, manually:
1. Start the app (`npm start`)
2. Toggle a command ON
3. Quit the app (tray → Quit)
4. Open `~/.commanddeck/state.json` — verify the commandId appears under `"toggles"`
5. Open `~/.commanddeck/commands.json` — verify the command does NOT yet have `"autoRestore": true` (we haven't built that UI yet)

The toggle should appear as "last session" on next start (Task 5 adds the visual). For now, verify `state.json` is being written correctly.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: add restoreToggleState() called on app startup"
```

---

## Task 4: Update `main.js` — toggle-on/off handlers and `getLiveProcesses` IPC

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Update the toggle-on exit handler in `spawnCommand()`**

Find the line in the `child.on('exit', ...)` handler inside `spawnCommand()` (around line 200):

```js
if (type === 'toggle-on' && code === 0) activeToggles.add(commandId);
```

Replace with:

```js
if (type === 'toggle-on' && code === 0) {
  activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
  lastSessionToggles.delete(commandId);
  saveCurrentState();
}
```

- [ ] **Step 2: Update the toggle-off handler in the `run-command` IPC handler**

Find in `ipcMain.handle('run-command', ...)` (around line 244):

```js
if (result.ok) {
  activeToggles.delete(commandId);
  updateTrayIcon();
}
```

Replace with:

```js
if (result.ok) {
  activeTogglesMeta.delete(commandId);
  lastSessionToggles.delete(commandId);
  saveCurrentState();
  updateTrayIcon();
}
```

- [ ] **Step 3: Update `getLiveProcesses` IPC handler to include toggle entries**

Find `ipcMain.handle('get-live-processes', ...)` (around line 225):

```js
ipcMain.handle('get-live-processes', () => {
  const result = {};
  for (const [pid, entry] of liveProcesses.entries()) {
    result[entry.commandId] = result[entry.commandId] || [];
    result[entry.commandId].push({ pid, startedAt: entry.startedAt, logFile: entry.logFile });
  }
  return result;
});
```

Replace with:

```js
ipcMain.handle('get-live-processes', () => {
  const result = {};
  for (const [pid, entry] of liveProcesses.entries()) {
    result[entry.commandId] = result[entry.commandId] || [];
    result[entry.commandId].push({ pid, startedAt: entry.startedAt, logFile: entry.logFile });
  }
  for (const [commandId, meta] of activeTogglesMeta.entries()) {
    if (!result[commandId]) {
      result[commandId] = [{ pid: null, startedAt: meta.startedAt, logFile: meta.logFile, lastSession: false }];
    }
  }
  for (const commandId of lastSessionToggles) {
    if (!result[commandId]) {
      result[commandId] = [{ pid: null, startedAt: null, logFile: null, lastSession: true }];
    }
  }
  return result;
});
```

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
npm test
```

Expected: all tests still pass (state tests + tray icon tests).

- [ ] **Step 5: Smoke-test toggle on/off in the running app**

```bash
npm start
```

Toggle a command ON → OFF. Check `~/.commanddeck/state.json` updates correctly after each action (ON: commandId appears; OFF: commandId disappears). Quit the app.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: update toggle handlers and getLiveProcesses to use persistent state"
```

---

## Task 5: Update renderer — "last session" visual state in `renderCard()`

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add CSS for the last-session indicator**

In `src/renderer/style.css`, find the `.meta-dot` and `.meta-dot.live` rules. Add the following immediately after them:

```css
.meta-dot.last-session {
  background: var(--warn);
  opacity: 0.55;
}
.meta-last-session {
  color: var(--warn);
  opacity: 0.8;
  font-style: italic;
}
```

- [ ] **Step 2: Update `renderCard()` to extract the `lastSession` flag**

In `src/renderer/app.js`, at the top of the `renderCard(cmd)` function, after the existing variable declarations (`running`, `pid`, `startedAt`, `displayCmd`), add:

```js
const isLastSession = (liveMap[cmd.id] || [])[0]?.lastSession === true;
```

- [ ] **Step 3: Replace the `metaHtml` block with the three-state version**

Find the current `metaHtml` declaration in `renderCard()`:

```js
const metaHtml = running ? `
    <div class="card-meta">
      <div class="meta-dot live"></div>
      ${pid ? `<span class="meta-pid">PID ${pid}</span>` : ''}
      ${startedAt ? `<span class="meta-time">since ${formatTime(startedAt)}</span>` : ''}
    </div>
  ` : `<div class="card-meta"><div class="meta-dot"></div><span>idle</span></div>`;
```

Replace with:

```js
let metaHtml;
if (!running) {
  metaHtml = `<div class="card-meta"><div class="meta-dot"></div><span>idle</span></div>`;
} else if (isLastSession) {
  metaHtml = `<div class="card-meta"><div class="meta-dot last-session"></div><span class="meta-last-session">last session</span></div>`;
} else {
  metaHtml = `
    <div class="card-meta">
      <div class="meta-dot live"></div>
      ${pid ? `<span class="meta-pid">PID ${pid}</span>` : ''}
      ${startedAt ? `<span class="meta-time">since ${formatTime(startedAt)}</span>` : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Verify the last-session visual in the app**

```bash
npm start
```

If you have a toggle that was ON when you last quit (from Task 3/4 testing), it should now show:
- Amber dot + italic "last session" text in the meta line
- Toggle switch in the ON position
- Card header accent bar still green (running = true)

Toggle it OFF — it should return to idle. Toggle it ON — it should switch to the normal green "live" meta with a timestamp.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js src/renderer/style.css
git commit -m "feat: add last-session visual indicator to toggle cards"
```

---

## Task 6: Add "Auto-restore on startup" checkbox to the Edit modal

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add the checkbox row to the modal HTML**

In `src/renderer/index.html`, find the `f-off-row` div (around line 84):

```html
        <div id="f-off-row">
          <label>OFF Command <span class="required">*</span>
            <input type="text" id="f-off" placeholder="e.g. pactl unload-module module-loopback" />
          </label>
        </div>
```

Add the new row immediately after it:

```html
        <div id="f-auto-restore-row">
          <label class="checkbox-label">
            <input type="checkbox" id="f-auto-restore" />
            Auto-restore on startup
          </label>
        </div>
```

- [ ] **Step 2: Add `.checkbox-label` CSS**

In `src/renderer/style.css`, find the modal label styles. Add:

```css
.checkbox-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-mid);
}
.checkbox-label input[type="checkbox"] {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Show/hide the checkbox row in `updateModalFields()`**

In `src/renderer/app.js`, find `updateModalFields()`:

```js
function updateModalFields() {
  const type = document.getElementById('f-type').value;
  const onLabel = document.getElementById('f-on-label');
  const offRow = document.getElementById('f-off-row');
  if (type === 'toggle') {
    onLabel.firstChild.textContent = 'ON Command ';
    offRow.style.display = '';
  } else if (type === 'launcher') {
    onLabel.firstChild.textContent = 'Launch Command ';
    offRow.style.display = 'none';
  } else {
    onLabel.firstChild.textContent = 'Command ';
    offRow.style.display = 'none';
  }
}
```

Replace with:

```js
function updateModalFields() {
  const type = document.getElementById('f-type').value;
  const onLabel = document.getElementById('f-on-label');
  const offRow = document.getElementById('f-off-row');
  const autoRestoreRow = document.getElementById('f-auto-restore-row');
  if (type === 'toggle') {
    onLabel.firstChild.textContent = 'ON Command ';
    offRow.style.display = '';
    autoRestoreRow.style.display = '';
  } else if (type === 'launcher') {
    onLabel.firstChild.textContent = 'Launch Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  } else {
    onLabel.firstChild.textContent = 'Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  }
}
```

- [ ] **Step 4: Load `autoRestore` in `openModal()`**

In `src/renderer/app.js`, find `openModal(cmd = null)`. After the existing field assignments (`f-label`, `f-note`, `f-type`, `f-on`, `f-off`, `f-group`), add:

```js
document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
```

- [ ] **Step 5: Save `autoRestore` in the modal save handler**

In `src/renderer/app.js`, find the `modal-save` click handler. Find the `entry` object construction:

```js
  const entry = {
    id: editingId || uid(),
    label,
    note: document.getElementById('f-note').value.trim(),
    type,
    group: document.getElementById('f-group').value.trim(),
    ...(type === 'toggle'    ? { onCmd, offCmd: document.getElementById('f-off').value.trim() } : {}),
    ...(type === 'launcher'  ? { launchCmd: onCmd } : {}),
    ...(type === 'foreground'? { onCmd } : {}),
  };
```

Replace with:

```js
  const entry = {
    id: editingId || uid(),
    label,
    note: document.getElementById('f-note').value.trim(),
    type,
    group: document.getElementById('f-group').value.trim(),
    ...(type === 'toggle' ? {
      onCmd,
      offCmd: document.getElementById('f-off').value.trim(),
      autoRestore: document.getElementById('f-auto-restore').checked,
    } : {}),
    ...(type === 'launcher'  ? { launchCmd: onCmd } : {}),
    ...(type === 'foreground'? { onCmd } : {}),
  };
```

- [ ] **Step 6: Verify the checkbox in the UI**

```bash
npm start
```

1. Click "+ New Command", set type to "Toggle" — "Auto-restore on startup" checkbox should appear.
2. Switch type to "Launcher" or "Foreground" — checkbox should disappear.
3. Switch back to "Toggle" — checkbox should reappear, unchecked.
4. Create a toggle command with "Auto-restore on startup" checked. Save.
5. Open `~/.commanddeck/commands.json` — verify `"autoRestore": true` is present on the command.
6. Edit the command and uncheck the box. Save.
7. Verify `"autoRestore": false` in the JSON.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/index.html src/renderer/app.js src/renderer/style.css
git commit -m "feat: add auto-restore checkbox to toggle command modal"
```

---

## Task 7: End-to-end integration test and final commit

**Files:** none (manual verification only)

- [ ] **Step 1: Run the full test suite one last time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Full auto-restore scenario**

```bash
npm start
```

1. Edit a toggle command — check "Auto-restore on startup". Save.
2. Toggle it ON. Verify it shows green "live" meta.
3. Quit the app (tray → Quit).
4. Verify `~/.commanddeck/state.json` has the commandId under `"toggles"`.
5. Start the app again (`npm start`).
6. Verify the toggle card shows green "live" meta (auto-restore ran the `onCmd`).

- [ ] **Step 3: Full remember-only scenario**

1. Edit a different toggle command — leave "Auto-restore on startup" unchecked. Save.
2. Toggle it ON. Verify green "live" meta.
3. Quit the app.
4. Start the app again.
5. Verify that toggle shows amber dot + italic "last session" in the meta, toggle switch is ON.
6. Toggle it OFF — verify card returns to idle.
7. Quit and restart — verify the card now shows idle (state was cleared on toggle-off).

- [ ] **Step 4: Stale state robustness**

1. Manually add a fake commandId to `~/.commanddeck/state.json`:
   ```json
   { "toggles": { "fakeid999": true } }
   ```
2. Start the app.
3. Verify no crash — the stale entry is silently skipped.

- [ ] **Step 5: Update CLAUDE.md Known Gaps — mark item 3 done and note the follow-on**

In `CLAUDE.md`, in the Known Gaps section, replace item 3 (currently reads "Toggle state persistence — if the app restarts...") with:

```markdown
3. ~~**Toggle state persistence**~~ — **Done.** Per-toggle "Auto-restore on startup" checkbox. Auto-restore re-runs `onCmd` on startup; remember-only shows an amber "last session" indicator. State persisted in `~/.commanddeck/state.json` (app-managed, not exported).

   **Follow-on:** A `checkCmd` field per toggle (e.g., `pactl list short modules | grep module-loopback`) would allow the app to verify real system state rather than relying on last-known memory. Skipped as out of scope for this iteration.
```

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark toggle state persistence as done, note checkCmd follow-on"
```
