# Preferences Panel, Global Hotkey & Desktop Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preferences panel modal, a configurable global hotkey for show/hide, and desktop notifications on unexpected process exits.

**Architecture:** A new `src/prefs.js` module (mirrors `src/state.js`) owns all prefs file I/O. Main process loads prefs at startup, registers the global shortcut, and fires `Notification` events on unexpected exits — all three using the same module-level `prefs` variable that `save-prefs` updates in-place. The renderer gains a preferences modal (same pattern as the command-edit modal) with a press-to-record hotkey field.

**Tech Stack:** Electron `globalShortcut`, Electron `Notification`, Node.js `fs`, vanilla JS/HTML/CSS, Node built-in test runner (`node --test`).

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `src/prefs.js` | Load/save/defaults for `prefs.json` |
| Create | `test/prefs.test.js` | Unit tests for `src/prefs.js` |
| Modify | `src/main.js` | Prefs loading, hotkey registration, notifications, IPC handlers |
| Modify | `src/preload.js` | `loadPrefs` / `savePrefs` bridge entries |
| Modify | `src/renderer/index.html` | Gear button + preferences modal markup |
| Modify | `src/renderer/style.css` | Hotkey row, field error, section label styles |
| Modify | `src/renderer/app.js` | Prefs state, modal open/close/save, hotkey recording |
| Modify | `package.json` | Widen test glob to pick up new test file |

---

## Task 1: Create `src/prefs.js` (TDD)

**Files:**
- Create: `src/prefs.js`
- Create: `test/prefs.test.js`
- Modify: `package.json` (test script)

- [ ] **Step 1: Widen the test glob in `package.json`**

Replace the hardcoded test file list so new test files are picked up automatically:

```json
"test": "node --test test/*.test.js"
```

- [ ] **Step 2: Write the failing tests in `test/prefs.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadPrefs, savePrefs, DEFAULTS } = require('../src/prefs');

test('loadPrefs returns defaults when file is missing', () => {
  const result = loadPrefs('/nonexistent/path/prefs.json');
  assert.deepEqual(result, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
});

test('loadPrefs merges saved data over defaults', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ hotkey: 'Ctrl+Space', notify: { onCrash: false } }));
  const result = loadPrefs(tmp);
  assert.equal(result.hotkey, 'Ctrl+Space');
  assert.equal(result.notify.onCrash, false);
  assert.equal(result.notify.onUnexpectedExit, DEFAULTS.notify.onUnexpectedExit);
  fs.unlinkSync(tmp);
});

test('savePrefs writes JSON to disk', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  const data = { hotkey: 'Super+D', notify: { onCrash: true, onUnexpectedExit: false } };
  savePrefs(tmp, data);
  assert.deepEqual(JSON.parse(fs.readFileSync(tmp, 'utf8')), data);
  fs.unlinkSync(tmp);
});

test('loadPrefs handles malformed JSON gracefully', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, 'not valid json {{ ');
  const result = loadPrefs(tmp);
  assert.deepEqual(result, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
  fs.unlinkSync(tmp);
});
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
npm test
```

Expected: `ReferenceError` or `Cannot find module '../src/prefs'`

- [ ] **Step 4: Create `src/prefs.js`**

```js
const fs = require('fs');

const DEFAULTS = {
  hotkey: 'Super+D',
  notify: {
    onCrash: true,
    onUnexpectedExit: false,
  },
};

function loadPrefs(prefsPath) {
  try {
    const data = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    return {
      ...DEFAULTS,
      ...data,
      notify: { ...DEFAULTS.notify, ...(data.notify || {}) },
    };
  } catch {
    return { ...DEFAULTS, notify: { ...DEFAULTS.notify } };
  }
}

function savePrefs(prefsPath, data) {
  fs.writeFileSync(prefsPath, JSON.stringify(data, null, 2));
}

module.exports = { loadPrefs, savePrefs, DEFAULTS };
```

- [ ] **Step 5: Run tests — confirm all 4 pass**

```bash
npm test
```

Expected output (timing values will differ):
```
▶ loadPrefs returns defaults when file is missing
  ✔ loadPrefs returns defaults when file is missing
▶ loadPrefs merges saved data over defaults
  ✔ loadPrefs merges saved data over defaults
▶ savePrefs writes JSON to disk
  ✔ savePrefs writes JSON to disk
▶ loadPrefs handles malformed JSON gracefully
  ✔ loadPrefs handles malformed JSON gracefully

ℹ tests 4
ℹ pass 4
ℹ fail 0
```

- [ ] **Step 6: Commit**

```bash
git add src/prefs.js test/prefs.test.js package.json
git commit -m "feat: add prefs.js module with load/save/defaults for prefs.json"
```

---

## Task 2: Wire prefs into `main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `globalShortcut` and `Notification` to the electron import (line 1)**

Change:
```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
```
To:
```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, globalShortcut, Notification } = require('electron');
```

- [ ] **Step 2: Require `prefs.js` and add `PREFS_PATH` constant**

After the existing `require('./state')` line, add:
```js
const { loadPrefs, savePrefs } = require('./prefs');
```

After the `STATE_PATH` constant (line 22), add:
```js
const PREFS_PATH = path.join(os.homedir(), '.commanddeck', 'prefs.json');
```

- [ ] **Step 3: Add module-level `prefs` variable**

After the `const killedByUser = new Set();` line, add:
```js
let prefs = {};
```

- [ ] **Step 4: Create `prefs.json` in `ensureConfigDir()`**

Inside `ensureConfigDir()`, after the `STATE_PATH` existence check, add:
```js
  if (!fs.existsSync(PREFS_PATH)) {
    fs.writeFileSync(PREFS_PATH, JSON.stringify({
      hotkey: 'Super+D',
      notify: { onCrash: true, onUnexpectedExit: false },
    }, null, 2));
  }
```

- [ ] **Step 5: Load prefs in `app.whenReady()`**

Change the `app.whenReady()` block:
```js
app.whenReady().then(() => {
  ensureConfigDir();
  prefs = loadPrefs(PREFS_PATH);
  createWindow();
  createTray();
  restoreToggleState();
});
```

- [ ] **Step 6: Add `load-prefs` IPC handler** (alongside the other ipcMain.handle calls)

```js
ipcMain.handle('load-prefs', () => loadPrefs(PREFS_PATH));
```

- [ ] **Step 7: Smoke-test — run the app and confirm it starts cleanly**

```bash
npm start
```

Expected: App starts, no errors in console, `~/.commanddeck/prefs.json` is created with default content.

Check the file exists:
```bash
cat ~/.commanddeck/prefs.json
```

Expected:
```json
{
  "hotkey": "Super+D",
  "notify": {
    "onCrash": true,
    "onUnexpectedExit": false
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: load prefs.json at startup and expose load-prefs IPC handler"
```

---

## Task 3: Global hotkey in `main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `toggleWindow` function**

Add before the `createWindow` function:
```js
function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}
```

- [ ] **Step 2: Register hotkey in `app.whenReady()`**

Update the block to register after `createTray()`:
```js
app.whenReady().then(() => {
  ensureConfigDir();
  prefs = loadPrefs(PREFS_PATH);
  createWindow();
  createTray();
  if (prefs.hotkey) globalShortcut.register(prefs.hotkey, toggleWindow);
  restoreToggleState();
});
```

- [ ] **Step 3: Add `will-quit` cleanup**

After the existing `app.on('window-all-closed', ...)` handler, add:
```js
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

- [ ] **Step 4: Add `save-prefs` IPC handler**

Alongside the other `ipcMain.handle` calls, add:
```js
ipcMain.handle('save-prefs', (_, data) => {
  globalShortcut.unregisterAll();
  prefs = { ...data };
  savePrefs(PREFS_PATH, prefs);
  if (prefs.hotkey) {
    const ok = globalShortcut.register(prefs.hotkey, toggleWindow);
    if (!ok) return { ok: false, error: 'hotkey_conflict' };
  }
  return { ok: true };
});
```

- [ ] **Step 5: Smoke-test the hotkey**

```bash
npm start
```

Expected: Press `Super+D` (with the app hidden via the tray) — the window should appear. Press again — it hides.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat: register global hotkey on startup, re-register via save-prefs IPC"
```

---

## Task 4: Desktop notifications in `main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `notifyProcessExit` helper**

Add this function just before `spawnCommand`:
```js
function notifyProcessExit(label, code, wasUserKilled, type) {
  if (wasUserKilled || type === 'toggle-on') return;
  let body;
  if (code !== 0 && prefs.notify?.onCrash) {
    body = `"${label}" stopped with an error (code ${code})`;
  } else if (code === 0 && prefs.notify?.onUnexpectedExit) {
    body = `"${label}" exited unexpectedly`;
  }
  if (!body) return;
  const n = new Notification({ title: 'CommandDeck', body });
  n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  n.show();
}
```

- [ ] **Step 2: Call `notifyProcessExit` in the launcher exit handler**

In the launcher `child.on('exit', ...)` block, add the call after the `alertState` update:

```js
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      mainWindow?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled) {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      updateTrayIcon();
    });
```

- [ ] **Step 3: Call `notifyProcessExit` in the foreground exit handler**

In the foreground `child.on('exit', ...)` block, add the call after the `alertState` update (and before the `toggle-on` state tracking):

```js
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      mainWindow?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled && type !== 'toggle-on') {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      if (type === 'toggle-on' && code === 0) {
        activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
        lastSessionToggles.delete(commandId);
        saveCurrentState();
      } else if (type === 'toggle-on') {
        lastSessionToggles.delete(commandId);
        saveCurrentState();
      }
      updateTrayIcon();
    });
```

- [ ] **Step 4: Smoke-test notifications**

```bash
npm start
```

To test: Start a foreground command with a bad command (e.g. `exit 1`) — you should see a system notification saying it stopped with an error. Clicking the notification should bring CommandDeck to the foreground.

To test unexpected clean exit: temporarily set `onUnexpectedExit: true` in `~/.commanddeck/prefs.json`, start a command that exits cleanly (e.g. `echo hello`), and verify the "exited unexpectedly" notification appears.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: fire desktop notifications on unexpected process exits"
```

---

## Task 5: Preload bridge additions

**Files:**
- Modify: `src/preload.js`

- [ ] **Step 1: Add `loadPrefs` and `savePrefs` to the contextBridge**

In `src/preload.js`, add two entries to the existing `contextBridge.exposeInMainWorld('api', { ... })` object — place them after the existing `importConfig` entry:

```js
  // Preferences
  loadPrefs: () => ipcRenderer.invoke('load-prefs'),
  savePrefs: (data) => ipcRenderer.invoke('save-prefs', data),
```

- [ ] **Step 2: Confirm the full preload now looks like this**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Process management
  getLiveProcesses: () => ipcRenderer.invoke('get-live-processes'),
  runCommand: (opts) => ipcRenderer.invoke('run-command', opts),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', { pid }),

  // Logs
  openLog: (logFile) => ipcRenderer.invoke('open-log', { logFile }),
  openLogDir: () => ipcRenderer.invoke('open-log-dir'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  hide: () => ipcRenderer.invoke('window-hide'),

  // Import / Export
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // Preferences
  loadPrefs: () => ipcRenderer.invoke('load-prefs'),
  savePrefs: (data) => ipcRenderer.invoke('save-prefs', data),

  // Events from main → renderer
  onProcessExited: (cb) => ipcRenderer.on('process-exited', (_, data) => cb(data)),
  onProcessOutput: (cb) => ipcRenderer.on('process-output', (_, data) => cb(data)),
});
```

- [ ] **Step 3: Commit**

```bash
git add src/preload.js
git commit -m "feat: expose loadPrefs and savePrefs on the contextBridge"
```

---

## Task 6: Preferences modal markup in `index.html`

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add the gear button to the titlebar**

In the `.titlebar-controls` div, add the gear button before `btn-minimize`:

```html
      <button class="tb-btn" id="btn-prefs" title="Preferences">⚙</button>
      <button class="tb-btn" id="btn-minimize" title="Minimize">−</button>
      <button class="tb-btn tb-btn-close" id="btn-hide" title="Hide to tray">×</button>
```

- [ ] **Step 2: Add the preferences modal**

After the closing `</div>` of the command modal (after `<!-- Modal: Add/Edit Command -->`), add:

```html
  <!-- Modal: Preferences -->
  <div class="modal-backdrop" id="prefs-backdrop">
    <div class="modal" id="prefs-modal">
      <div class="modal-header">
        <span>Preferences</span>
        <button class="modal-close" id="prefs-close">×</button>
      </div>
      <div class="modal-body">
        <label>Global Hotkey
          <div class="hotkey-row">
            <input type="text" id="p-hotkey" readonly placeholder="None" />
            <button class="btn-secondary" id="p-hotkey-record">Record</button>
            <button class="btn-secondary" id="p-hotkey-clear">×</button>
          </div>
          <span class="field-error" id="p-hotkey-error"></span>
        </label>
        <div class="prefs-section-label">NOTIFICATIONS</div>
        <label class="checkbox-label">
          <input type="checkbox" id="p-notify-crash" />
          Notify when a process crashes (non-zero exit)
        </label>
        <label class="checkbox-label">
          <input type="checkbox" id="p-notify-unexpected" />
          Notify when a process exits unexpectedly (zero exit)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="prefs-cancel">Cancel</button>
        <button class="btn-primary" id="prefs-save">Save Preferences</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add preferences modal markup and gear button to titlebar"
```

---

## Task 7: Preferences modal styles in `style.css`

**Files:**
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add hotkey row, field error, and section label styles**

Append to the end of `style.css`, before the closing `/* ── Animations` block (or at the very end):

```css
/* ── Preferences modal ─────────────────────────────────────────────────────── */
.hotkey-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.hotkey-row input {
  flex: 1;
  cursor: default;
}
.hotkey-row input.recording {
  border-color: var(--warn);
  color: var(--warn);
}
.hotkey-row input.recording::placeholder {
  color: var(--warn);
  opacity: 0.7;
}
.field-error {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--danger);
  min-height: 16px;
  display: block;
}
.prefs-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  padding-top: 4px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/style.css
git commit -m "feat: add preferences modal styles (hotkey row, field error, section label)"
```

---

## Task 8: Preferences modal logic in `app.js`

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add prefs state variable at the top**

After the existing state variables at the top of `app.js` (after `let drawerLogFile = null;`), add:

```js
let prefs = { hotkey: '', notify: { onCrash: true, onUnexpectedExit: false } };
```

- [ ] **Step 2: Load prefs on boot**

Update `loadAll()` to also load prefs:

```js
async function loadAll() {
  config = await window.api.loadConfig();
  liveMap = await window.api.getLiveProcesses();
  prefs = await window.api.loadPrefs();
  renderAll();
}
```

- [ ] **Step 3: Add the hotkey-to-accelerator translation function**

Add this after the `escHtml` helper function:

```js
function keyEventToAccelerator(e) {
  const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS']);
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  const isFunctionKey = /^F\d+$/.test(key);
  if (parts.length === 0 && !isFunctionKey) return null;

  return [...parts, key].join('+');
}
```

- [ ] **Step 4: Add hotkey recording state and functions**

Add after `keyEventToAccelerator`:

```js
let hotkeyRecording = false;
let hotkeyRecordPrev = '';

function startHotkeyRecording() {
  hotkeyRecording = true;
  hotkeyRecordPrev = document.getElementById('p-hotkey').value;
  const input = document.getElementById('p-hotkey');
  input.value = '';
  input.placeholder = 'Press keys…';
  input.classList.add('recording');
  document.getElementById('p-hotkey-record').textContent = 'Cancel';
  document.addEventListener('keydown', handleHotkeyCapture);
}

function stopHotkeyRecording(revert = false) {
  if (!hotkeyRecording) return;
  hotkeyRecording = false;
  const input = document.getElementById('p-hotkey');
  input.classList.remove('recording');
  input.placeholder = 'None';
  document.getElementById('p-hotkey-record').textContent = 'Record';
  document.removeEventListener('keydown', handleHotkeyCapture);
  if (revert) input.value = hotkeyRecordPrev;
}

function handleHotkeyCapture(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopHotkeyRecording(true); return; }
  const acc = keyEventToAccelerator(e);
  if (!acc) return;
  document.getElementById('p-hotkey').value = acc;
  stopHotkeyRecording();
}
```

- [ ] **Step 5: Add `openPrefsModal` and `closePrefsModal`**

```js
function openPrefsModal() {
  document.getElementById('p-hotkey').value = prefs.hotkey || '';
  document.getElementById('p-hotkey-error').textContent = '';
  document.getElementById('p-notify-crash').checked = prefs.notify.onCrash;
  document.getElementById('p-notify-unexpected').checked = prefs.notify.onUnexpectedExit;
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.add('open');
}

function closePrefsModal() {
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.remove('open');
}
```

- [ ] **Step 6: Wire up all preferences modal event listeners**

Add in the `// ─── Titlebar controls` section alongside the other button listeners:

```js
document.getElementById('btn-prefs').addEventListener('click', openPrefsModal);
document.getElementById('prefs-close').addEventListener('click', closePrefsModal);
document.getElementById('prefs-cancel').addEventListener('click', closePrefsModal);
document.getElementById('prefs-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closePrefsModal();
});
document.getElementById('p-hotkey-record').addEventListener('click', () => {
  if (hotkeyRecording) stopHotkeyRecording(true);
  else startHotkeyRecording();
});
document.getElementById('p-hotkey-clear').addEventListener('click', () => {
  stopHotkeyRecording();
  document.getElementById('p-hotkey').value = '';
});
document.getElementById('prefs-save').addEventListener('click', async () => {
  const hotkey = document.getElementById('p-hotkey').value.trim();
  const updated = {
    hotkey,
    notify: {
      onCrash: document.getElementById('p-notify-crash').checked,
      onUnexpectedExit: document.getElementById('p-notify-unexpected').checked,
    },
  };
  const result = await window.api.savePrefs(updated);
  if (!result.ok && result.error === 'hotkey_conflict') {
    document.getElementById('p-hotkey-error').textContent = 'That shortcut is already in use — try another.';
    return;
  }
  prefs = updated;
  closePrefsModal();
});
```

- [ ] **Step 7: Full smoke-test**

```bash
npm start
```

Run through the following checklist manually:

1. Click the `⚙` button in the titlebar — preferences modal opens.
2. Click `Record`, press `Super+D` — the field shows `Super+D`, recording stops.
3. Click `×` next to the hotkey field — field clears (hotkey will be disabled on save).
4. Click `Save Preferences` with empty hotkey — prefs saved, no hotkey registered.
5. Re-open prefs, record `Super+D` again, save — verify `Super+D` toggles the window from outside the app.
6. Try to record a hotkey already claimed by the system — verify the inline error appears and the modal stays open.
7. Check the notification toggles — enable "Notify on unexpected exit", save, then run a foreground command that exits cleanly (e.g. `echo hello`) — verify the notification fires.
8. Click the notification — verify the CommandDeck window comes to the front.
9. Run `cat ~/.commanddeck/prefs.json` — verify it reflects the saved values.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: add preferences modal with hotkey recording and notification toggles"
```

---

## Done

All 8 tasks complete. The feature branch is ready for review via `superpowers:requesting-code-review` or merging via `superpowers:finishing-a-development-branch`.
