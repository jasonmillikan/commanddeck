# Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 12 security findings from the 2026-05-21 audit (2 critical, 3 high, 5 medium, 2 low) before open-source publication.

**Architecture:** Each fix is a targeted, minimal change. Two new pure functions (`validateConfig`, `sanitizePrefs`) are extracted into existing modules for testability. All other changes are inline handler updates in `ipc-handlers.js`, a one-line CSP addition, and a navigation guard in `window.js`.

**Tech Stack:** Node.js CommonJS (main process), Vanilla ES module JS (renderer), Electron IPC, `node:test` + `node:assert/strict` for tests.

---

## File Map

| File | Change |
|---|---|
| `src/renderer/app.js` | CRIT-1: add `escHtml` import, escape tag strings in `renderGroups()` |
| `src/main/validate-config.js` | NEW: `validateConfig(data)` pure function |
| `src/main/prefs.js` | MED-3: add `sanitizePrefs(data)` export |
| `src/main/ipc-handlers.js` | CRIT-2, HIGH-1, HIGH-2, HIGH-3, MED-1, MED-2, MED-3, MED-4, LOW-4 |
| `src/main/window.js` | MED-5: navigation/popup guard |
| `src/renderer/index.html` | LOW-1: CSP meta tag |
| `src/main/main.js` | LOW-4: call `cleanupTempFiles()` on `will-quit` |
| `test/security.test.js` | NEW: tests for `validateConfig` |
| `test/prefs.test.js` | MED-3: tests for `sanitizePrefs` |

---

## Task 1 — CRIT-1: Fix XSS via unescaped tag names in `renderGroups()`

**Finding:** `src/renderer/app.js` ~line 69 interpolates tag strings directly into `innerHTML` with no escaping. A config with a tag like `"><img src=x onerror=...>` triggers XSS with full `window.api` (→ RCE) access.

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add `escHtml` to the import on line 1**

Current line 1:
```js
import { migrateCommands, applyReorder } from './utils.js';
```

Replace with:
```js
import { migrateCommands, applyReorder, escHtml } from './utils.js';
```

- [ ] **Step 2: Escape tag strings in `renderGroups()`**

Current block (lines 69–72):
```js
  el.innerHTML = tags.map(t => `
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${t}">
      ${t === 'all' ? 'All Commands' : t}
    </div>
  `).join('');
```

Replace with:
```js
  el.innerHTML = tags.map(t => `
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${escHtml(t)}">
      ${t === 'all' ? 'All Commands' : escHtml(t)}
    </div>
  `).join('');
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "fix: escape tag names in renderGroups to prevent XSS (CRIT-1)"
```

---

## Task 2 — Create `validateConfig()` module (enables MED-1, MED-2, LOW-2)

**Finding:** Imported and saved configs have no schema validation. Malicious tag names (CRIT-1 vector) can persist to disk and trigger XSS on next launch. IDs from imported configs may contain HTML-injectable characters used in `data-id` attributes.

**Files:**
- Create: `src/main/validate-config.js`
- Create: `test/security.test.js`

- [ ] **Step 1: Write the failing tests in `test/security.test.js`**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/main/validate-config');

test('validateConfig: accepts valid minimal config', () => {
  const data = { commands: [{ id: 'abc123', label: 'Test', type: 'toggle' }] };
  const result = validateConfig(data);
  assert.equal(result.ok, true);
});

test('validateConfig: rejects non-object input', () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig('string').ok, false);
  assert.equal(validateConfig([]).ok, false);
});

test('validateConfig: rejects missing commands array', () => {
  assert.equal(validateConfig({}).ok, false);
  assert.equal(validateConfig({ commands: 'nope' }).ok, false);
});

test('validateConfig: rejects command with invalid id', () => {
  const badId = { commands: [{ id: 'CAPS-NOT-OK', label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(badId).ok, false);

  const htmlId = { commands: [{ id: '<script>', label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(htmlId).ok, false);

  const longId = { commands: [{ id: 'a'.repeat(33), label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(longId).ok, false);
});

test('validateConfig: rejects command with missing or non-string label', () => {
  const noLabel = { commands: [{ id: 'abc', type: 'toggle' }] };
  assert.equal(validateConfig(noLabel).ok, false);

  const numLabel = { commands: [{ id: 'abc', label: 42, type: 'toggle' }] };
  assert.equal(validateConfig(numLabel).ok, false);
});

test('validateConfig: rejects command with unknown type', () => {
  const bad = { commands: [{ id: 'abc', label: 'X', type: 'daemon' }] };
  assert.equal(validateConfig(bad).ok, false);
});

test('validateConfig: rejects command with string field over 500 chars', () => {
  const long = 'x'.repeat(501);
  const data = { commands: [{ id: 'abc', label: long, type: 'toggle' }] };
  assert.equal(validateConfig(data).ok, false);
});

test('validateConfig: rejects tags that are not an array of strings', () => {
  const badTags = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: [42] }] };
  assert.equal(validateConfig(badTags).ok, false);

  const objTags = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: {} }] };
  assert.equal(validateConfig(objTags).ok, false);
});

test('validateConfig: accepts all known command types with correct optional fields', () => {
  const commands = [
    { id: 'a1', label: 'Toggle', type: 'toggle', onCmd: 'cmd on', offCmd: 'cmd off', tags: ['Audio'] },
    { id: 'b2', label: 'Launcher', type: 'launcher', launchCmd: 'steam', tags: [] },
    { id: 'c3', label: 'Foreground', type: 'foreground', onCmd: 'syncthing', note: 'runs syncthing' },
    { id: 'd4', label: 'Sheet', type: 'cheatsheet', content: 'ip addr\nip route' },
  ];
  assert.equal(validateConfig({ commands }).ok, true);
});

test('validateConfig: rejects tag string with invalid characters', () => {
  const bad = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: ['<script>'] }] };
  assert.equal(validateConfig(bad).ok, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -A 3 'security'
```

Expected: `Error: Cannot find module '../src/main/validate-config'`

- [ ] **Step 3: Create `src/main/validate-config.js`**

```js
const VALID_ID   = /^[0-9a-z]{1,32}$/;
const VALID_TAG  = /^[0-9a-zA-Z\s\-_]{1,50}$/;
const VALID_TYPE = new Set(['toggle', 'launcher', 'foreground', 'cheatsheet']);
const MAX_STR    = 500;

const STRING_FIELDS = ['label', 'note', 'onCmd', 'offCmd', 'launchCmd', 'content'];

function validateConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'config must be an object' };
  }
  if (!Array.isArray(data.commands)) {
    return { ok: false, error: 'commands must be an array' };
  }
  for (const cmd of data.commands) {
    if (!cmd || typeof cmd !== 'object') {
      return { ok: false, error: 'each command must be an object' };
    }
    if (typeof cmd.id !== 'string' || !VALID_ID.test(cmd.id)) {
      return { ok: false, error: `invalid id: ${cmd.id}` };
    }
    if (typeof cmd.label !== 'string' || cmd.label.length === 0 || cmd.label.length > MAX_STR) {
      return { ok: false, error: `invalid label on command ${cmd.id}` };
    }
    if (!VALID_TYPE.has(cmd.type)) {
      return { ok: false, error: `unknown type "${cmd.type}" on command ${cmd.id}` };
    }
    for (const field of STRING_FIELDS) {
      if (cmd[field] !== undefined && (typeof cmd[field] !== 'string' || cmd[field].length > MAX_STR)) {
        return { ok: false, error: `invalid field "${field}" on command ${cmd.id}` };
      }
    }
    if (cmd.tags !== undefined) {
      if (!Array.isArray(cmd.tags)) {
        return { ok: false, error: `tags must be an array on command ${cmd.id}` };
      }
      for (const tag of cmd.tags) {
        if (typeof tag !== 'string' || !VALID_TAG.test(tag)) {
          return { ok: false, error: `invalid tag "${tag}" on command ${cmd.id}` };
        }
      }
    }
  }
  return { ok: true };
}

module.exports = { validateConfig };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | grep -E '(pass|fail|ok)' | head -30
```

Expected: all security tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/validate-config.js test/security.test.js
git commit -m "feat: add validateConfig() with schema validation for imported/saved configs (MED-1, MED-2, LOW-2)"
```

---

## Task 3 — MED-3: Add `sanitizePrefs()` to `prefs.js`

**Finding:** `save-prefs` handler writes the full renderer-supplied object to disk with no field or type checking. An attacker can write arbitrary keys to `prefs.json`.

**Files:**
- Modify: `src/main/prefs.js`
- Modify: `test/prefs.test.js`

- [ ] **Step 1: Write failing tests — append to `test/prefs.test.js`**

```js
const { sanitizePrefs } = require('../src/main/prefs');

test('sanitizePrefs: passes through valid data unchanged', () => {
  const input = { hotkey: 'Super+D', theme: 'dark', drawerHeight: 300, notify: { onCrash: true, onUnexpectedExit: false } };
  const result = sanitizePrefs(input);
  assert.deepEqual(result, input);
});

test('sanitizePrefs: defaults unknown theme to "system"', () => {
  const result = sanitizePrefs({ theme: 'neon' });
  assert.equal(result.theme, 'system');
});

test('sanitizePrefs: clamps hotkey to 100 chars', () => {
  const result = sanitizePrefs({ hotkey: 'A'.repeat(150) });
  assert.equal(result.hotkey.length, 100);
});

test('sanitizePrefs: defaults non-integer drawerHeight to 240', () => {
  assert.equal(sanitizePrefs({ drawerHeight: 'big' }).drawerHeight, 240);
  assert.equal(sanitizePrefs({ drawerHeight: -10 }).drawerHeight, 240);
  assert.equal(sanitizePrefs({ drawerHeight: 0 }).drawerHeight, 240);
});

test('sanitizePrefs: coerces notify fields to booleans', () => {
  const result = sanitizePrefs({ notify: { onCrash: 1, onUnexpectedExit: null } });
  assert.equal(result.notify.onCrash, true);
  assert.equal(result.notify.onUnexpectedExit, false);
});

test('sanitizePrefs: ignores unknown top-level keys', () => {
  const result = sanitizePrefs({ hotkey: 'Super+D', evil: 'payload', __proto__: { polluted: true } });
  assert.equal(result.evil, undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test 2>&1 | grep -E 'sanitizePrefs'
```

Expected: `TypeError: sanitizePrefs is not a function`

- [ ] **Step 3: Add `sanitizePrefs` to `src/main/prefs.js`**

Add before the `module.exports` line:

```js
function sanitizePrefs(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { hotkey: '', theme: 'system', drawerHeight: 240, notify: { onCrash: false, onUnexpectedExit: false } };
  }
  const { hotkey, theme, drawerHeight, notify } = data;
  return {
    hotkey: typeof hotkey === 'string' ? hotkey.slice(0, 100) : '',
    theme: ['system', 'light', 'dark'].includes(theme) ? theme : 'system',
    drawerHeight: Number.isInteger(drawerHeight) && drawerHeight > 0 ? drawerHeight : 240,
    notify: {
      onCrash: Boolean(notify?.onCrash),
      onUnexpectedExit: Boolean(notify?.onUnexpectedExit),
    },
  };
}
```

Update `module.exports`:
```js
module.exports = { loadPrefs, savePrefs, sanitizePrefs, DEFAULTS };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test 2>&1 | grep -E '(pass|fail|ok)' | head -30
```

Expected: all prefs tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/prefs.js test/prefs.test.js
git commit -m "feat: add sanitizePrefs() with field/type validation for prefs saves (MED-3)"
```

---

## Task 4 — CRIT-2: Validate PID before kill

**Finding:** `kill-process` passes renderer-supplied `pid` to `process.kill(-pid, 'SIGTERM')` with no type check and no ownership check. PID 1 would broadcast SIGTERM to the entire session.

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Replace the `kill-process` handler (lines 72–83)**

Current:
```js
  ipcMain.handle('kill-process', (_, { pid }) => {
    try {
      procMgr.killProcess(pid);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
```

Replace with:
```js
  ipcMain.handle('kill-process', (_, { pid }) => {
    if (!Number.isInteger(pid) || pid <= 1) return { ok: false, error: 'invalid_pid' };
    if (![...procMgr.liveProcesses.values()].flat().some(p => p.pid === pid)) {
      return { ok: false, error: 'unknown_pid' };
    }
    try {
      procMgr.killProcess(pid);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
```

- [ ] **Step 2: Verify the diff looks correct**

```bash
git diff src/main/ipc-handlers.js
```

Confirm only the `kill-process` handler changed and the two guard lines are present.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: validate PID ownership before kill to prevent arbitrary process signaling (CRIT-2)"
```

---

## Task 5 — HIGH-3: Look up `cmdString` from config in main process

**Finding:** The `run-command` handler executes the renderer-supplied `cmdString` directly. A compromised renderer can run any shell command by passing an arbitrary `cmdString`.

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Replace the `run-command` handler (lines 46–70)**

Current:
```js
  ipcMain.handle('run-command', async (_, { commandId, label, cmdString, type }) => {
    if (type === 'toggle-on' || type === 'launcher' || type === 'foreground') {
      const result = procMgr.spawnCommand(commandId, label, cmdString, type);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true, ...result };
    }
    if (type === 'toggle-off') {
      const ts = Date.now();
      const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
      const result = await procMgr.runOneShot(cmdString, logFile);
      if (result.ok) {
        procMgr.clearToggleActive(commandId);
        procMgr.saveCurrentState();
        win.updateTrayIcon({
          running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
          alertState: procMgr.getAlertState(),
        });
      }
      return { ok: result.ok, logFile };
    }
    return { ok: false, error: 'Unknown type' };
  });
```

Replace with:
```js
  ipcMain.handle('run-command', async (_, { commandId, label, type }) => {
    const cfg = cfgIo.loadConfig();
    const cmd = (cfg.commands || []).find(c => c.id === commandId);
    if (!cmd) return { ok: false, error: 'unknown_command' };
    const cmdString = type === 'toggle-off' ? cmd.offCmd : (cmd.onCmd || cmd.launchCmd);
    if (!cmdString) return { ok: false, error: 'no_cmd_for_type' };

    if (type === 'toggle-on' || type === 'launcher' || type === 'foreground') {
      const result = procMgr.spawnCommand(commandId, label, cmdString, type);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true, ...result };
    }
    if (type === 'toggle-off') {
      const ts = Date.now();
      const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
      const result = await procMgr.runOneShot(cmdString, logFile);
      if (result.ok) {
        procMgr.clearToggleActive(commandId);
        procMgr.saveCurrentState();
        win.updateTrayIcon({
          running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
          alertState: procMgr.getAlertState(),
        });
      }
      return { ok: result.ok, logFile };
    }
    return { ok: false, error: 'unknown_type' };
  });
```

- [ ] **Step 2: Verify the diff**

```bash
git diff src/main/ipc-handlers.js
```

Confirm `cmdString` is removed from the destructured parameter, the config lookup block is present, and `cfgIo.loadConfig()` is called (no args needed — `CONFIG_PATH` is the default).

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: look up cmdString from saved config in main process, ignore renderer-supplied value (HIGH-3)"
```

---

## Task 6 — HIGH-1 & HIGH-2: Validate `open-external` URL and confine `open-log` path

**Finding HIGH-1:** `shell.openExternal(url)` accepts any URL from the renderer — `file://`, `ssh://`, custom URI handlers all work. **Finding HIGH-2:** `shell.openPath(logFile)` accepts any path — renderer can open `~/.ssh/id_rsa` in a text editor.

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Replace `open-log` handler (line 85)**

Current:
```js
  ipcMain.handle('open-log', (_, { logFile }) => { shell.openPath(logFile); return true; });
```

Replace with:
```js
  ipcMain.handle('open-log', (_, { logFile }) => {
    if (typeof logFile !== 'string') return false;
    const resolved = path.resolve(logFile);
    if (!resolved.startsWith(LOG_DIR + path.sep)) return false;
    shell.openPath(resolved);
    return true;
  });
```

- [ ] **Step 2: Replace `open-external` handler (line 87)**

Current:
```js
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
```

Replace with:
```js
  ipcMain.handle('open-external', (_, url) => {
    let parsed;
    try { parsed = new URL(url); } catch { return { ok: false }; }
    if (!['https:', 'http:'].includes(parsed.protocol)) return { ok: false };
    return shell.openExternal(url);
  });
```

- [ ] **Step 3: Verify the diff**

```bash
git diff src/main/ipc-handlers.js
```

Confirm `open-log` now resolves and checks the path prefix, and `open-external` now parses and checks the protocol.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: allowlist https/http for open-external; confine open-log to LOG_DIR (HIGH-1, HIGH-2)"
```

---

## Task 7 — MED-1 & MED-2: Apply `validateConfig()` to `save-config` and `import-config`

**Finding:** Both `save-config` (normal saves) and `import-config` write unvalidated data to disk. A crafted import that bypasses the confirmation dialog could persist malicious tags.

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Add `validateConfig` require at the top of `ipc-handlers.js`**

After line 3 (`const os = require('os');`), add:
```js
const { validateConfig } = require('./validate-config');
```

- [ ] **Step 2: Replace `save-config` handler (line 10)**

Current:
```js
  ipcMain.handle('save-config', (_, data) => { saveConfig(CONFIG_PATH, data); return true; });
```

Replace with:
```js
  ipcMain.handle('save-config', (_, data) => {
    const check = validateConfig(data);
    if (!check.ok) return { ok: false, error: check.error };
    saveConfig(CONFIG_PATH, data);
    return { ok: true };
  });
```

- [ ] **Step 3: Replace the end of the `import-config` handler (line 161)**

Current (lines 160–162):
```js
    if (response !== 0) return { ok: false, canceled: true };
    saveConfig(CONFIG_PATH, data);
    return { ok: true, data };
```

Replace with:
```js
    if (response !== 0) return { ok: false, canceled: true };
    const check = validateConfig(data);
    if (!check.ok) {
      dialog.showErrorBox('Import rejected', `Invalid config: ${check.error}`);
      return { ok: false, error: check.error };
    }
    saveConfig(CONFIG_PATH, data);
    return { ok: true, data };
```

- [ ] **Step 4: Verify the diff**

```bash
git diff src/main/ipc-handlers.js
```

Confirm `validateConfig` is required at the top, `save-config` now checks before writing, and `import-config` shows an error dialog and returns early on invalid data.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: validate config schema before writing in save-config and import-config (MED-1, MED-2)"
```

---

## Task 8 — MED-3: Wire `sanitizePrefs()` into `save-prefs` handler

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Add `sanitizePrefs` to the `require('./prefs')` call in `save-prefs`**

Current `save-prefs` handler (lines 31–42):
```js
  ipcMain.handle('save-prefs', (_, data) => {
    const { savePrefs } = require('./prefs');
    const { PREFS_PATH } = cfgIo;
    globalShortcut.unregisterAll();
    if (data.hotkey) {
      const ok = globalShortcut.register(data.hotkey, win.toggleWindow);
      if (!ok) return { ok: false, error: 'hotkey_conflict' };
    }
    procMgr.setPrefs(data);
    savePrefs(PREFS_PATH, data);
    return { ok: true };
  });
```

Replace with:
```js
  ipcMain.handle('save-prefs', (_, data) => {
    const { savePrefs, sanitizePrefs } = require('./prefs');
    const { PREFS_PATH } = cfgIo;
    const safe = sanitizePrefs(data);
    globalShortcut.unregisterAll();
    if (safe.hotkey) {
      const ok = globalShortcut.register(safe.hotkey, win.toggleWindow);
      if (!ok) return { ok: false, error: 'hotkey_conflict' };
    }
    procMgr.setPrefs(safe);
    savePrefs(PREFS_PATH, safe);
    return { ok: true };
  });
```

- [ ] **Step 2: Verify the diff**

```bash
git diff src/main/ipc-handlers.js
```

Confirm `sanitizePrefs` is destructured from `require('./prefs')`, `safe = sanitizePrefs(data)` is called before any use, and `data` is no longer referenced after that point.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: sanitize prefs input before saving to prevent arbitrary key injection (MED-3)"
```

---

## Task 9 — MED-4: Validate `commandId` for `pty-create`

**Finding:** Any string `commandId` creates a live PTY shell session. An attacker can create unlimited PTY processes using arbitrary IDs.

**Files:**
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Replace the `pty-create` handler (line 89)**

Current:
```js
  ipcMain.handle('pty-create', (_, { commandId }) => ptyMgr.ptyCreate(commandId));
```

Replace with:
```js
  ipcMain.handle('pty-create', (_, { commandId }) => {
    const cfg = cfgIo.loadConfig();
    const cmd = (cfg.commands || []).find(c => c.id === commandId && c.type === 'cheatsheet');
    if (!cmd) return { ok: false, error: 'unknown_cheatsheet' };
    return ptyMgr.ptyCreate(commandId);
  });
```

- [ ] **Step 2: Verify the diff**

```bash
git diff src/main/ipc-handlers.js
```

Confirm `pty-create` now looks up the command and checks `type === 'cheatsheet'` before creating a PTY.

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc-handlers.js
git commit -m "fix: validate commandId exists as cheatsheet type before creating PTY session (MED-4)"
```

---

## Task 10 — MED-5: Block navigation and popup windows

**Finding:** An XSS payload can navigate the window to an external URL; the preload bridge remains active because `contextIsolation` only applies to the originally loaded page.

**Files:**
- Modify: `src/main/window.js`

- [ ] **Step 1: Add navigation guard inside `createWindow()`, after `mainWindow.loadFile(rendererPath);` (line 40)**

Current lines 40–41:
```js
  mainWindow.loadFile(rendererPath);
  mainWindow.once('ready-to-show', () => mainWindow.show());
```

Replace with:
```js
  mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => mainWindow.show());
```

- [ ] **Step 2: Verify the diff**

```bash
git diff src/main/window.js
```

Confirm the two guards are added after `loadFile` and before `ready-to-show`.

- [ ] **Step 3: Commit**

```bash
git add src/main/window.js
git commit -m "fix: block external navigation and popup windows to contain XSS blast radius (MED-5)"
```

---

## Task 11 — LOW-1: Add Content Security Policy

**Finding:** No CSP means any injected `<script>` tag or inline event handler can run. CSP eliminates the entire class of inline-script injection.

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add CSP meta tag**

In `src/renderer/index.html`, after the `<meta name="viewport" ...>` line (line 5), add:

```html
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none';">
```

- [ ] **Step 2: Run the app and verify it loads correctly**

```bash
npm start
```

Open DevTools (Ctrl+Shift+I in dev mode). Check the Console tab — there should be **no CSP violation errors**. Check that the app loads normally, cards render, terminals open, and the preferences modal works. The `unsafe-inline` on `style-src` is intentional — inline styles are used extensively and are safe (they don't allow script execution).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "fix: add Content Security Policy to block inline script injection (LOW-1)"
```

---

## Task 12 — LOW-4: Clean up temp files on quit

**Finding:** Cheatsheet temp files (written by `open-in-terminal`) are cleaned up after 30s via `setTimeout`, but a crash or forced kill leaves them in `/tmp`.

**Files:**
- Modify: `src/main/ipc-handlers.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Add `activeTempFiles` Set and `cleanupTempFiles()` to `ipc-handlers.js`**

After line 3 (`const os = require('os');`), add a module-level set:
```js
const activeTempFiles = new Set();
```

In the `open-in-terminal` handler, after the existing `setTimeout` cleanup (line 98), also track the file:

Current lines 96–98:
```js
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 30000);
```

Replace with:
```js
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    activeTempFiles.add(tmpFile);
    setTimeout(() => {
      try { fs.unlinkSync(tmpFile); } catch {}
      activeTempFiles.delete(tmpFile);
    }, 30000);
```

After the `register` function definition (before `module.exports`), add:
```js
function cleanupTempFiles() {
  for (const f of activeTempFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
  activeTempFiles.clear();
}
```

Update `module.exports`:
```js
module.exports = { register, cleanupTempFiles };
```

- [ ] **Step 2: Call `cleanupTempFiles()` in `main.js` `will-quit` handler**

Current `will-quit` handler in `src/main/main.js` (lines 49–52):
```js
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ptyMgr.killAllPty();
});
```

Replace with:
```js
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ptyMgr.killAllPty();
  ipc.cleanupTempFiles();
});
```

- [ ] **Step 3: Verify the diff**

```bash
git diff src/main/ipc-handlers.js src/main/main.js
```

Confirm `activeTempFiles` Set is at module level, `add`/`delete` calls bracket the `setTimeout`, `cleanupTempFiles` is exported, and `main.js` calls it in `will-quit`.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-handlers.js src/main/main.js
git commit -m "fix: track and delete cheatsheet temp files on quit, not just via setTimeout (LOW-4)"
```

---

## Final Verification

- [ ] Run the full test suite and confirm all tests pass:

```bash
npm test
```

Expected: all tests pass with no failures.

- [ ] Start the app and smoke-test:

```bash
npm start
```

Verify:
- Tag filter list renders correctly (no `escHtml` visible in tags)
- Toggle, launcher, foreground, and cheatsheet cards work normally
- TERM button still opens in-app terminal
- OPEN button still opens system terminal
- Preferences modal saves correctly (hotkey, theme, drawer height, notifications)
- Import config with a valid JSON file works
- Export config produces a readable JSON file
- DevTools console shows no CSP violations

- [ ] Check the git log looks clean:

```bash
git log --oneline -15
```

Expected: 12 new commits, one per security fix, each with a descriptive message.
