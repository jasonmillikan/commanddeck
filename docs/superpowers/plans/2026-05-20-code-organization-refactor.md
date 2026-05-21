# Code Organization Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/renderer/app.js` (865 lines) and `src/main.js` (548 lines) into focused ES/CommonJS modules without rewriting any logic.

**Architecture:** Renderer becomes ES modules — `app.js` owns shared state and wires all modules via init callbacks; extracted modules own only their private state. Main process stays CommonJS — each module receives dependencies via an `init()` call at boot rather than through circular requires.

**Tech Stack:** Electron 42, vanilla JS, Node.js built-in test runner (`node --test`), no bundler.

---

## Part 1 — Renderer

### Task 1: Convert utils.js to ES module and update its test

**Files:**
- Modify: `src/renderer/utils.js`
- Modify: `test/utils.test.js`

`utils.js` currently uses a `module.exports` dual-environment guard. Replacing it with ES `export` keywords makes it a proper module. The test must switch from `require()` to dynamic `import()` because `package.json` has no `"type": "module"` (main process is CommonJS).

- [ ] **Step 1: Rewrite utils.js as a pure ES module**

Replace the entire contents of `src/renderer/utils.js` with:

```js
export function migrateCommands(commands) {
  let changed = false;
  const migrated = commands.map(cmd => {
    if (cmd.tags !== undefined) return cmd;
    changed = true;
    const { group, ...rest } = cmd;
    return { ...rest, tags: group ? [group] : [] };
  });
  return { commands: migrated, changed };
}

export function applyReorder(allCommands, newVisibleIds) {
  const visibleSet = new Set(newVisibleIds);
  const positions = [];
  for (let i = 0; i < allCommands.length; i++) {
    if (visibleSet.has(allCommands[i].id)) positions.push(i);
  }
  const byId = Object.fromEntries(allCommands.map(c => [c.id, c]));
  const result = [...allCommands];
  positions.forEach((pos, i) => {
    result[pos] = byId[newVisibleIds[i]];
  });
  return result;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function badgeFor(type) {
  const map = { toggle: 'badge-toggle', launcher: 'badge-launcher', foreground: 'badge-foreground', cheatsheet: 'badge-cheatsheet' };
  const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
  return `<span class="card-type-badge ${map[type]}">${labels[type]}</span>`;
}

export function keyEventToAccelerator(e) {
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

- [ ] **Step 2: Update test/utils.test.js to use dynamic import**

Replace the entire contents of `test/utils.test.js` with:

```js
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let migrateCommands, applyReorder;

before(async () => {
  ({ migrateCommands, applyReorder } = await import('../src/renderer/utils.js'));
});

test('migrateCommands: group string → tags array', () => {
  const input = [{ id: 'a', label: 'A', group: 'Audio' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.equal(commands[0].group, undefined);
  assert.equal(changed, true);
});

test('migrateCommands: no group → empty tags array', () => {
  const input = [{ id: 'a', label: 'A' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, []);
  assert.equal(changed, true);
});

test('migrateCommands: empty group string → empty tags array', () => {
  const input = [{ id: 'a', label: 'A', group: '' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, []);
  assert.equal(commands[0].group, undefined);
  assert.equal(changed, true);
});

test('migrateCommands: already has tags → no change', () => {
  const input = [{ id: 'a', label: 'A', tags: ['Audio'] }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.equal(changed, false);
});

test('migrateCommands: mixed batch — some migrated, some not', () => {
  const input = [
    { id: 'a', label: 'A', group: 'Audio' },
    { id: 'b', label: 'B', tags: ['Sync'] },
  ];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.deepEqual(commands[1].tags, ['Sync']);
  assert.equal(changed, true);
});

test('applyReorder: reorders full unfiltered list', () => {
  const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const result = applyReorder(commands, ['b', 'a', 'c']);
  assert.deepEqual(result.map(c => c.id), ['b', 'a', 'c']);
});

test('applyReorder: filtered drag moves only visible cards, non-visible stay in place', () => {
  const commands = [
    { id: 'a', tags: ['audio'] },
    { id: 'b', tags: ['other'] },
    { id: 'c', tags: ['audio'] },
    { id: 'd', tags: ['audio'] },
    { id: 'e', tags: ['other'] },
  ];
  const result = applyReorder(commands, ['a', 'd', 'c']);
  assert.deepEqual(result.map(c => c.id), ['a', 'b', 'd', 'c', 'e']);
});

test('applyReorder: single visible card is a no-op', () => {
  const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const result = applyReorder(commands, ['b']);
  assert.deepEqual(result.map(c => c.id), ['a', 'b', 'c']);
});

test('applyReorder: does not mutate original array', () => {
  const commands = [{ id: 'a' }, { id: 'b' }];
  const original = [...commands];
  applyReorder(commands, ['b', 'a']);
  assert.deepEqual(commands, original);
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all 9 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/utils.js test/utils.test.js
git commit -m "refactor: convert utils.js to ES module, update test to dynamic import"
```

---

### Task 2: Extract terminal.js

**Files:**
- Create: `src/renderer/terminal.js`

`terminal.js` owns `terminalMap` and `activeTerminalId`. It exposes getters so `app.js` and `drawer.js` can read those values without importing state directly.

`Terminal` and `FitAddon` remain globals injected by the existing xterm `<script>` tags in `index.html`. Non-module scripts run before deferred module scripts, so these globals are available at module evaluation time.

- [ ] **Step 1: Create src/renderer/terminal.js**

```js
const terminalMap = new Map();
let activeTerminalId = null;

export async function initTerminal(cmd) {
  if (terminalMap.has(cmd.id)) return;
  terminalMap.set(cmd.id, null);
  const container = document.createElement('div');
  container.id = `terminal-${cmd.id}`;
  container.className = 'terminal-instance xterm-hidden';
  document.getElementById('drawer-terminals').appendChild(container);

  const term = new Terminal({
    theme: { background: '#12151f', foreground: '#e2e8f0', cursor: '#4ade80' },
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursorBlink: true,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  term.onData(data => window.api.ptyWrite(cmd.id, data));
  terminalMap.set(cmd.id, { term, fitAddon, ready: false, pendingWrites: [] });
  try {
    await window.api.ptyCreate(cmd.id);
  } catch (err) {
    terminalMap.delete(cmd.id);
    container.remove();
    throw err;
  }
}

export function switchToTerminal(cmdId) {
  document.querySelectorAll('.terminal-instance').forEach(el => el.classList.add('xterm-hidden'));
  const container = document.getElementById(`terminal-${cmdId}`);
  if (container) container.classList.remove('xterm-hidden');
  const entry = terminalMap.get(cmdId);
  if (entry) {
    entry.fitAddon.fit();
    const { cols, rows } = entry.term;
    window.api.ptyResize(cmdId, cols, rows);
  }
  activeTerminalId = cmdId;
}

export function getTerminalEntry(cmdId) {
  return terminalMap.get(cmdId);
}

export function deleteTerminalEntry(cmdId) {
  terminalMap.delete(cmdId);
}

export function getActiveTerminalId() {
  return activeTerminalId;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/terminal.js
git commit -m "refactor: extract terminal.js from app.js"
```

---

### Task 3: Extract prefs-modal.js

**Files:**
- Create: `src/renderer/prefs-modal.js`

`prefs-modal.js` owns hotkey recording state. It reads and writes `prefs` through getters/setters passed from `app.js` via `initPrefsModal()`.

- [ ] **Step 1: Create src/renderer/prefs-modal.js**

```js
import { keyEventToAccelerator } from './utils.js';

let hotkeyRecording = false;
let hotkeyRecordPrev = '';
let _getPrefs, _setPrefs;

export function initPrefsModal({ getPrefs, setPrefs }) {
  _getPrefs = getPrefs;
  _setPrefs = setPrefs;
}

export async function openPrefsModal() {
  const p = _getPrefs();
  document.getElementById('p-hotkey').value = p.hotkey || '';
  document.getElementById('p-hotkey-error').textContent = '';
  document.getElementById('p-notify-crash').checked = p.notify.onCrash;
  document.getElementById('p-notify-unexpected').checked = p.notify.onUnexpectedExit;
  document.getElementById('p-autostart').checked = await window.api.getAutostart();
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.add('open');
}

export function closePrefsModal() {
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.remove('open');
}

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
  const p = _getPrefs();
  const updated = {
    ...p,
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
  await window.api.setAutostart(document.getElementById('p-autostart').checked);
  _setPrefs(updated);
  closePrefsModal();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/prefs-modal.js
git commit -m "refactor: extract prefs-modal.js from app.js"
```

---

### Task 4: Extract drawer.js

**Files:**
- Create: `src/renderer/drawer.js`

`drawer.js` owns `drawerCommandId` and `drawerLogFile`. It imports `initTerminal` and `switchToTerminal` from `terminal.js`. It reads `config`, `outputMap`, and `liveMap` through getter callbacks passed via `initDrawer()`.

- [ ] **Step 1: Create src/renderer/drawer.js**

```js
import { initTerminal, switchToTerminal, getTerminalEntry } from './terminal.js';
import { escHtml } from './utils.js';

let drawerCommandId = null;
let drawerLogFile = null;
let _getConfig, _getOutputMap, _getLiveMap;

export function initDrawer({ getConfig, getOutputMap, getLiveMap }) {
  _getConfig = getConfig;
  _getOutputMap = getOutputMap;
  _getLiveMap = getLiveMap;
}

export function getDrawerCommandId() {
  return drawerCommandId;
}

export function openDrawer(cmd, mode = 'output') {
  drawerCommandId = cmd.id;
  const logBtn = document.getElementById('drawer-open-log');
  const runAllBtn = document.getElementById('drawer-run-all');
  const outputEl = document.getElementById('drawer-output');
  const snippetPanel = document.getElementById('drawer-snippet-panel');
  const terminalsEl = document.getElementById('drawer-terminals');
  document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;

  if (mode === 'term') {
    logBtn.style.display = 'none';
    runAllBtn.style.display = '';
    outputEl.style.display = 'none';
    snippetPanel.style.display = '';
    terminalsEl.style.display = '';

    snippetPanel.innerHTML = (cmd.content || '')
      .split('\n')
      .map(line => `<div class="snippet-line" data-cmd="${escHtml(line)}">${escHtml(line)}</div>`)
      .join('');

    snippetPanel.onclick = (e) => {
      const lineEl = e.target.closest('.snippet-line');
      if (!lineEl) return;
      const entry = getTerminalEntry(cmd.id);
      if (entry?.ready) {
        window.api.ptyWrite(cmd.id, lineEl.dataset.cmd);
      } else if (entry) {
        entry.pendingWrites.push(lineEl.dataset.cmd);
      }
    };

    initTerminal(cmd).then(() => switchToTerminal(cmd.id));
  } else {
    logBtn.style.display = cmd.type === 'cheatsheet' ? 'none' : '';
    runAllBtn.style.display = 'none';
    outputEl.style.display = '';
    snippetPanel.style.display = 'none';
    terminalsEl.style.display = 'none';
    drawerLogFile = (_getLiveMap()[cmd.id] || [])[0]?.logFile || null;
    const lines = _getOutputMap()[cmd.id] || [];
    outputEl.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  const drawer = document.getElementById('output-drawer');
  drawer.classList.add('open');
  document.querySelector('.board').style.paddingBottom = drawer.offsetHeight + 'px';
}

document.getElementById('drawer-close').addEventListener('click', () => {
  document.getElementById('output-drawer').classList.remove('open');
  document.querySelector('.board').style.paddingBottom = '';
});

document.getElementById('drawer-open-log').addEventListener('click', async () => {
  if (drawerLogFile) await window.api.openLog(drawerLogFile);
});

document.getElementById('drawer-run-all').addEventListener('click', () => {
  if (!drawerCommandId) return;
  const cmd = _getConfig().commands.find(c => c.id === drawerCommandId);
  if (!cmd?.content) return;
  const lines = cmd.content.split('\n').filter(l => l.trim() !== '');
  lines.forEach(line => window.api.ptyWrite(drawerCommandId, line + '\r'));
});
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/drawer.js
git commit -m "refactor: extract drawer.js from app.js"
```

---

### Task 5: Extract modal.js

**Files:**
- Create: `src/renderer/modal.js`

`modal.js` owns `editingId` and `modalTags`. It reads `config` through a getter (needed because `config` is reassigned in `app.js` on load), and calls `persist` and `renderAll` via callbacks from `initModal()`.

- [ ] **Step 1: Create src/renderer/modal.js**

```js
import { uid, escHtml } from './utils.js';

let editingId = null;
let modalTags = [];
let _getConfig, _persist, _renderAll;

export function initModal({ getConfig, persist, renderAll }) {
  _getConfig = getConfig;
  _persist = persist;
  _renderAll = renderAll;
}

function renderTagChips() {
  const wrap = document.getElementById('f-tags-wrap');
  const input = document.getElementById('f-tags-input');
  wrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
  modalTags.forEach((tag, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<button class="tag-chip-remove" data-index="${i}" tabindex="-1">×</button>`;
    wrap.insertBefore(chip, input);
  });
}

function populateTagsDatalist() {
  const all = [...new Set(_getConfig().commands.flatMap(c => c.tags || []).filter(Boolean))];
  const dl = document.getElementById('tags-datalist');
  dl.innerHTML = all.map(t => `<option value="${escHtml(t)}">`).join('');
}

export function openModal(cmd = null) {
  editingId = cmd?.id || null;
  document.getElementById('modal-title').textContent = cmd ? 'Edit Command' : 'New Command';
  document.getElementById('f-label').value = cmd?.label || '';
  document.getElementById('f-note').value = cmd?.note || '';
  document.getElementById('f-type').value = cmd?.type || 'toggle';
  document.getElementById('f-on').value = cmd?.onCmd || cmd?.launchCmd || '';
  document.getElementById('f-off').value = cmd?.offCmd || '';
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  document.getElementById('f-content').value = cmd?.content || '';
  modalTags = [...(cmd?.tags || [])];
  populateTagsDatalist();
  renderTagChips();
  document.getElementById('f-tags-input').value = '';
  updateModalFields();
  document.getElementById('modal-delete').style.display = editingId ? '' : 'none';
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('f-label').focus();
}

export function updateModalFields() {
  const type = document.getElementById('f-type').value;
  const onLabel = document.getElementById('f-on-label');
  const onRow = document.getElementById('f-on-row');
  const offRow = document.getElementById('f-off-row');
  const autoRestoreRow = document.getElementById('f-auto-restore-row');
  const contentRow = document.getElementById('f-content-row');

  if (type === 'cheatsheet') {
    onRow.style.display = 'none';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    contentRow.style.display = '';
    return;
  }
  contentRow.style.display = 'none';
  onRow.style.display = '';
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

export function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.getElementById('modal-delete').style.display = 'none';
  editingId = null;
}

document.getElementById('f-type').addEventListener('change', updateModalFields);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-delete').addEventListener('click', async () => {
  const cmd = _getConfig().commands.find(c => c.id === editingId);
  if (!cmd) return;
  if (confirm(`Delete "${cmd.label}"?`)) {
    _getConfig().commands = _getConfig().commands.filter(c => c.id !== editingId);
    await _persist();
    closeModal();
    _renderAll();
  }
});
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.getElementById('f-tags-wrap').addEventListener('click', e => {
  const btn = e.target.closest('.tag-chip-remove');
  if (btn) {
    modalTags.splice(Number(btn.dataset.index), 1);
    renderTagChips();
  } else {
    document.getElementById('f-tags-input').focus();
  }
});

document.getElementById('f-tags-input').addEventListener('keydown', e => {
  const input = e.target;
  if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
    e.preventDefault();
    const tag = input.value.trim().replace(/,$/, '');
    if (tag && !modalTags.includes(tag)) modalTags.push(tag);
    input.value = '';
    renderTagChips();
  } else if (e.key === 'Backspace' && input.value === '' && modalTags.length > 0) {
    modalTags.pop();
    renderTagChips();
  }
});

document.getElementById('f-tags-input').addEventListener('change', e => {
  const tag = e.target.value.trim();
  if (tag && !modalTags.includes(tag)) {
    modalTags.push(tag);
    e.target.value = '';
    renderTagChips();
  }
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const label = document.getElementById('f-label').value.trim();
  const type = document.getElementById('f-type').value;

  const tagInput = document.getElementById('f-tags-input');
  const pending = tagInput.value.trim().replace(/,$/, '');
  if (pending && !modalTags.includes(pending)) modalTags.push(pending);
  tagInput.value = '';

  if (type === 'cheatsheet') {
    const content = document.getElementById('f-content').value.trim();
    if (!label || !content) { alert('Label and content are required.'); return; }
    const entry = {
      id: editingId || uid(),
      label,
      note: document.getElementById('f-note').value.trim(),
      type: 'cheatsheet',
      tags: [...modalTags],
      content,
    };
    if (editingId) {
      const idx = _getConfig().commands.findIndex(c => c.id === editingId);
      if (idx !== -1) _getConfig().commands[idx] = entry;
    } else {
      _getConfig().commands.push(entry);
    }
    await _persist();
    closeModal();
    _renderAll();
    return;
  }

  const onCmd = document.getElementById('f-on').value.trim();
  if (!label || !onCmd) { alert('Label and command are required.'); return; }

  const entry = {
    id: editingId || uid(),
    label,
    note: document.getElementById('f-note').value.trim(),
    type,
    tags: [...modalTags],
    ...(type === 'toggle' ? {
      onCmd,
      offCmd: document.getElementById('f-off').value.trim(),
      autoRestore: document.getElementById('f-auto-restore').checked,
    } : {}),
    ...(type === 'launcher'  ? { launchCmd: onCmd } : {}),
    ...(type === 'foreground' ? { onCmd } : {}),
  };

  if (editingId) {
    const idx = _getConfig().commands.findIndex(c => c.id === editingId);
    if (idx !== -1) _getConfig().commands[idx] = entry;
  } else {
    _getConfig().commands.push(entry);
  }
  await _persist();
  closeModal();
  _renderAll();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/modal.js
git commit -m "refactor: extract modal.js from app.js"
```

---

### Task 6: Extract cards.js

**Files:**
- Create: `src/renderer/cards.js`

`cards.js` owns `sortableInstance`. The functions that previously closed over `liveMap` now receive it as a parameter. Four private helper functions (`commandIsRunning`, `getFirstPid`, `getStartedAt`, `getLogFile`) are defined privately in this module using the liveMap parameter. `renderCards` receives an `attachListeners` callback so `app.js` can re-attach its card event delegation after each render.

`Sortable` remains a global injected by the existing SortableJS `<script>` tag.

- [ ] **Step 1: Create src/renderer/cards.js**

```js
import { escHtml, badgeFor, formatTime } from './utils.js';

let sortableInstance = null;

function commandIsRunning(id, liveMap) { return (liveMap[id] || []).length > 0; }
function getFirstPid(id, liveMap)      { return (liveMap[id] || [])[0]?.pid; }
function getStartedAt(id, liveMap)     { return (liveMap[id] || [])[0]?.startedAt; }

export function filteredCommands(config, activeGroup, searchQuery) {
  return config.commands.filter(cmd => {
    const tagOk = activeGroup === 'all' || (cmd.tags || []).includes(activeGroup);
    const q = searchQuery.toLowerCase();
    const searchOk = !q ||
      cmd.label.toLowerCase().includes(q) ||
      (cmd.note || '').toLowerCase().includes(q) ||
      (cmd.onCmd || '').toLowerCase().includes(q) ||
      (cmd.content || '').toLowerCase().includes(q);
    return tagOk && searchOk;
  });
}

export function renderCard(cmd, liveMap) {
  if (cmd.type === 'cheatsheet') {
    const previewLine = (cmd.content || '').split('\n')[0] || '';
    return `
      <div class="card" data-id="${cmd.id}">
        <div class="card-drag-handle">⠿</div>
        <div class="card-body" data-action="term" data-id="${cmd.id}">
          <div class="card-header">
            <div class="card-info">
              <div class="card-label">${escHtml(cmd.label)}</div>
              ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
            </div>
            ${badgeFor(cmd.type)}
          </div>
          <div class="card-cmd" title="${escHtml(cmd.content || '')}">${escHtml(previewLine)}</div>
          <div class="card-actions">
            <button class="card-btn card-btn-open" data-action="open" data-id="${cmd.id}">OPEN</button>
            <button class="card-btn card-btn-term" data-action="term" data-id="${cmd.id}">TERM</button>
            <button class="card-btn card-btn-edit" data-action="edit" data-id="${cmd.id}">EDIT</button>
          </div>
        </div>
      </div>
    `;
  }
  const running = commandIsRunning(cmd.id, liveMap);
  const pid = getFirstPid(cmd.id, liveMap);
  const startedAt = getStartedAt(cmd.id, liveMap);
  const displayCmd = running && cmd.type === 'toggle'
    ? (cmd.offCmd || cmd.onCmd)
    : (cmd.onCmd || cmd.launchCmd || '');
  const isLastSession = (liveMap[cmd.id] || [])[0]?.lastSession === true;

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

  let actionsHtml = '';
  if (cmd.type === 'toggle') {
    actionsHtml = `
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  } else if (cmd.type === 'launcher') {
    actionsHtml = `
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  } else {
    actionsHtml = `
      ${running ? `<button class="card-btn card-btn-kill" data-action="kill" data-id="${cmd.id}">KILL</button>` : ''}
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  }

  let controlHtml = '';
  if (cmd.type === 'toggle') {
    controlHtml = `
      <div class="toggle-wrap">
        <span class="toggle-label">${running ? 'ON' : 'OFF'}</span>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-id="${cmd.id}" ${running ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  } else {
    const btnLabel = cmd.type === 'launcher' ? 'LAUNCH' : 'START';
    controlHtml = running
      ? `<div class="toggle-wrap"><span class="toggle-label" style="color:var(--accent)">● RUNNING</span></div>`
      : `<div class="toggle-wrap">
           <button class="card-btn card-btn-start" data-action="start" data-id="${cmd.id}" style="border:none;text-align:left;flex:none;padding:4px 0">${btnLabel}</button>
         </div>`;
  }

  return `
    <div class="card ${running ? 'running' : ''}" data-id="${cmd.id}">
      <div class="card-drag-handle">⠿</div>
      <div class="card-body">
        <div class="card-header">
          <div class="card-info">
            <div class="card-label">${escHtml(cmd.label)}</div>
            ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
          </div>
          ${badgeFor(cmd.type)}
        </div>
        <div class="card-cmd" title="${escHtml(displayCmd)}">${escHtml(displayCmd)}</div>
        ${metaHtml}
        ${controlHtml}
        <div class="card-actions">${actionsHtml}</div>
      </div>
    </div>
  `;
}

export function renderCards(config, activeGroup, searchQuery, liveMap, { onDragEnd, attachListeners }) {
  const container = document.getElementById('cards-container');
  const cmds = filteredCommands(config, activeGroup, searchQuery);
  if (cmds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⬡</div>
        <div class="empty-state-text">${config.commands.length === 0 ? 'No commands yet' : 'No matches'}</div>
        <div class="empty-state-hint">${config.commands.length === 0 ? 'Click "+ New Command" to get started' : 'Try a different search or tag'}</div>
      </div>`;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    return;
  }
  container.innerHTML = cmds.map(cmd => renderCard(cmd, liveMap)).join('');
  attachListeners();
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(container, {
    handle: '.card-drag-handle',
    animation: 150,
    onEnd: onDragEnd,
  });
}

export function renderStats(config, liveMap) {
  const running = Object.values(liveMap).filter(arr => arr.length > 0).length;
  document.getElementById('stat-running').textContent = `${running} running`;
  document.getElementById('stat-total').textContent = `${config.commands.length} total`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/cards.js
git commit -m "refactor: extract cards.js from app.js"
```

---

### Task 7: Rewrite app.js and update index.html

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/index.html`

`app.js` now owns only: shared state (`config`, `liveMap`, `outputMap`, `prefs`, `activeGroup`, `searchQuery`), config persistence, `renderGroups`, `renderAll`, card event delegation, command execution, IPC event handlers from main, the drawer-resize IIFE, the search listener, and boot wiring. All extracted functions are removed and replaced with imports + init calls.

- [ ] **Step 1: Replace src/renderer/app.js entirely**

```js
import { migrateCommands, applyReorder } from './utils.js';
import { renderCards, renderStats } from './cards.js';
import { openModal, initModal } from './modal.js';
import { openDrawer, initDrawer, getDrawerCommandId } from './drawer.js';
import { initTerminal, getTerminalEntry, deleteTerminalEntry, getActiveTerminalId } from './terminal.js';
import { openPrefsModal, initPrefsModal } from './prefs-modal.js';

// ─── State ────────────────────────────────────────────────────────────────────
let config = { commands: [] };
// commandId → { pid, startedAt, logFile }[]
let liveMap = {};
// commandId → latest output lines[]
let outputMap = {};
let activeGroup = 'all';
let searchQuery = '';
let prefs = { hotkey: '', notify: { onCrash: true, onUnexpectedExit: false } };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFirstPid(id) { return (liveMap[id] || [])[0]?.pid; }

// ─── Config persistence ───────────────────────────────────────────────────────
async function loadAll() {
  const raw = await window.api.loadConfig();
  const { commands, changed } = migrateCommands(raw.commands || []);
  config = { ...raw, commands };
  if (changed) await window.api.saveConfig(config);
  liveMap = await window.api.getLiveProcesses();
  prefs = await window.api.loadPrefs();
  document.getElementById('output-drawer').style.height = (prefs.drawerHeight || 240) + 'px';
  renderAll();
}

async function persist() {
  await window.api.saveConfig(config);
}

// ─── Group list ───────────────────────────────────────────────────────────────
function renderGroups() {
  const tags = ['all', ...new Set(config.commands.flatMap(c => c.tags || []).filter(Boolean))];
  const el = document.getElementById('group-list');
  el.innerHTML = tags.map(t => `
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${t}">
      ${t === 'all' ? 'All Commands' : t}
    </div>
  `).join('');
  el.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', () => {
      activeGroup = item.dataset.group;
      renderAll();
    });
  });
}

// ─── Render coordination ──────────────────────────────────────────────────────
function renderAll() {
  renderGroups();
  renderCards(config, activeGroup, searchQuery, liveMap, {
    onDragEnd: handleDragEnd,
    attachListeners: attachCardListeners,
  });
  renderStats(config, liveMap);
}

// ─── Card event delegation ────────────────────────────────────────────────────
function attachCardListeners() {
  document.getElementById('cards-container').addEventListener('click', handleCardClick, { once: true });
  document.getElementById('cards-container').addEventListener('change', handleCardChange, { once: true });
}

function handleCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) { attachCardListeners(); return; }
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action !== 'toggle') handleCardAction(action, id);
  setTimeout(attachCardListeners, 0);
}

function handleCardChange(e) {
  const input = e.target.closest('[data-action="toggle"]');
  if (input) handleCardAction('toggle', input.dataset.id, input.checked);
  setTimeout(attachCardListeners, 0);
}

async function handleCardAction(action, id, checked) {
  const cmd = config.commands.find(c => c.id === id);
  if (!cmd) return;

  if (action === 'toggle') {
    if (checked) await startCommand(cmd);
    else await stopCommand(cmd);
  } else if (action === 'start') {
    await startCommand(cmd);
  } else if (action === 'kill') {
    const pid = getFirstPid(id);
    if (pid) {
      await window.api.killProcess(pid);
      liveMap[id] = [];
      renderAll();
    }
  } else if (action === 'log') {
    openDrawer(cmd, 'output');
  } else if (action === 'term') {
    openDrawer(cmd, 'term');
  } else if (action === 'open') {
    const result = await window.api.openInTerminal(cmd.content, cmd.id);
    if (result && !result.ok && result.reason === 'no_terminal') {
      new Notification('No terminal found', { body: 'Set the $TERMINAL environment variable to your terminal emulator.' });
    }
  } else if (action === 'edit') {
    openModal(cmd);
  }
}

// ─── Command execution ────────────────────────────────────────────────────────
async function startCommand(cmd) {
  let cmdString, type;
  if (cmd.type === 'toggle') {
    cmdString = cmd.onCmd;
    type = 'toggle-on';
  } else if (cmd.type === 'launcher') {
    cmdString = cmd.launchCmd;
    type = 'launcher';
  } else {
    cmdString = cmd.onCmd;
    type = 'foreground';
  }
  const result = await window.api.runCommand({ commandId: cmd.id, label: cmd.label, cmdString, type });
  if (result.ok) {
    if (!liveMap[cmd.id]) liveMap[cmd.id] = [];
    if (result.pid) {
      liveMap[cmd.id] = [{ pid: result.pid, startedAt: result.startedAt, logFile: result.logFile, lastSession: false }];
    }
    if (type === 'toggle-on') {
      liveMap[cmd.id] = [{ pid: null, startedAt: new Date().toISOString(), logFile: result.logFile, lastSession: false }];
    }
  }
  renderAll();
}

async function stopCommand(cmd) {
  if (cmd.type === 'toggle' && cmd.offCmd) {
    await window.api.runCommand({
      commandId: cmd.id,
      label: cmd.label,
      cmdString: cmd.offCmd,
      type: 'toggle-off',
    });
    liveMap[cmd.id] = [];
  } else {
    const pid = getFirstPid(cmd.id);
    if (pid) await window.api.killProcess(pid);
    liveMap[cmd.id] = [];
  }
  renderAll();
}

// ─── Drag reorder ─────────────────────────────────────────────────────────────
async function handleDragEnd(evt) {
  if (evt.oldIndex === evt.newIndex) return;
  const container = document.getElementById('cards-container');
  const newVisibleIds = [...container.querySelectorAll('.card[data-id]')].map(el => el.dataset.id);
  config.commands = applyReorder(config.commands, newVisibleIds);
  await persist();
}

// ─── Events from main process ─────────────────────────────────────────────────
window.api.onProcessExited(({ commandId, pid, code }) => {
  if (liveMap[commandId]) {
    liveMap[commandId] = liveMap[commandId].filter(p => p.pid !== pid);
  }
  renderAll();
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(`\n[Process exited with code ${code}]\n`);
  const drawerCommandId = getDrawerCommandId();
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

window.api.onProcessOutput(({ commandId, pid, text }) => {
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(text);
  if (outputMap[commandId].length > 500) outputMap[commandId] = outputMap[commandId].slice(-300);
  const drawerCommandId = getDrawerCommandId();
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.api.onPtyData(({ commandId, data }) => {
  const entry = getTerminalEntry(commandId);
  if (!entry) return;
  entry.term.write(data);
  if (!entry.ready) {
    entry.ready = true;
    entry.pendingWrites.splice(0).forEach(d => window.api.ptyWrite(commandId, d));
  }
});

window.api.onPtyExit(({ commandId }) => {
  deleteTerminalEntry(commandId);
});

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('search-box').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderCards(config, activeGroup, searchQuery, liveMap, {
    onDragEnd: handleDragEnd,
    attachListeners: attachCardListeners,
  });
});

// ─── Titlebar controls ────────────────────────────────────────────────────────
document.getElementById('btn-add').addEventListener('click', () => openModal());
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.toggleMaximize());
document.getElementById('btn-hide').addEventListener('click', () => window.api.hide());
window.api.onWindowMaximized(isMax => {
  const btn = document.getElementById('btn-maximize');
  btn.textContent = isMax ? '❐' : '□';
  btn.title = isMax ? 'Restore' : 'Maximize';
});
document.getElementById('btn-open-logs').addEventListener('click', () => window.api.openLogDir());
document.getElementById('btn-export').addEventListener('click', async () => {
  await window.api.exportConfig();
});
document.getElementById('btn-import').addEventListener('click', async () => {
  const result = await window.api.importConfig();
  if (result.ok) { config = result.data; renderAll(); }
});

// ─── Drawer resize ────────────────────────────────────────────────────────────
(function initDrawerResize() {
  const handle = document.getElementById('drawer-resize-handle');
  const drawer = document.getElementById('output-drawer');
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const board = document.querySelector('.board');
    function onMove(e) {
      const newHeight = Math.round(
        Math.min(Math.max(window.innerHeight - e.clientY, 100), window.innerHeight * 0.6)
      );
      drawer.style.height = newHeight + 'px';
      if (drawer.classList.contains('open')) board.style.paddingBottom = newHeight + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const newHeight = parseInt(drawer.style.height, 10);
      prefs = { ...prefs, drawerHeight: newHeight };
      window.api.savePrefs(prefs);
      const activeTerminalId = getActiveTerminalId();
      if (activeTerminalId) {
        const entry = getTerminalEntry(activeTerminalId);
        if (entry) {
          entry.fitAddon.fit();
          const { cols, rows } = entry.term;
          window.api.ptyResize(activeTerminalId, cols, rows);
        }
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();

// ─── Init ─────────────────────────────────────────────────────────────────────
initModal({ getConfig: () => config, persist, renderAll });
initDrawer({ getConfig: () => config, getOutputMap: () => outputMap, getLiveMap: () => liveMap });
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; } });

loadAll();
```

- [ ] **Step 2: Update index.html — add type="module" to the app.js script tag**

Find the line in `src/renderer/index.html` that loads `app.js` and change it from:

```html
<script src="app.js"></script>
```

to:

```html
<script type="module" src="app.js"></script>
```

- [ ] **Step 3: Run npm start and verify the app works**

```bash
npm start
```

Verify manually:
- Cards render correctly
- Add/edit/delete a command via the modal
- Toggle a command on and off
- Open the output drawer
- Open a cheatsheet's TERM drawer and type a command
- Open the prefs modal, change a setting, save
- Search filters cards correctly
- Drag to reorder works

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app.js src/renderer/index.html
git commit -m "refactor: wire app.js as ES module entry point, update index.html"
```

---

## Part 2 — Main process

### Task 8: Extract config-io.js

**Files:**
- Create: `src/config-io.js`
- Create: `test/config-io.test.js`

`config-io.js` is pure file I/O — no Electron dependencies, no state. All path constants move here. Tests use a temp directory so they don't touch `~/.commanddeck`.

- [ ] **Step 1: Write the failing tests**

Create `test/config-io.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig, saveConfig, ensureConfigDir } = require('../src/config-io');

test('loadConfig: returns empty commands when file missing', () => {
  const result = loadConfig(path.join(os.tmpdir(), 'nonexistent-' + Date.now() + '.json'));
  assert.deepEqual(result, { commands: [] });
});

test('loadConfig: returns parsed data when file exists', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  const data = { commands: [{ id: 'a', label: 'Test' }] };
  fs.writeFileSync(tmp, JSON.stringify(data));
  const result = loadConfig(tmp);
  assert.deepEqual(result, data);
  fs.unlinkSync(tmp);
});

test('loadConfig: returns empty commands on malformed JSON', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  fs.writeFileSync(tmp, 'not-json{{{');
  const result = loadConfig(tmp);
  assert.deepEqual(result, { commands: [] });
  fs.unlinkSync(tmp);
});

test('saveConfig: writes JSON to disk', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  const data = { commands: [{ id: 'b', label: 'Save test' }] };
  saveConfig(tmp, data);
  const read = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.deepEqual(read, data);
  fs.unlinkSync(tmp);
});

test('ensureConfigDir: creates missing directories', () => {
  const base = path.join(os.tmpdir(), 'cd-ensure-' + Date.now());
  const configPath = path.join(base, 'sub', 'commands.json');
  const logDir = path.join(base, 'logs');
  const statePath = path.join(base, 'state.json');
  const prefsPath = path.join(base, 'prefs.json');
  ensureConfigDir({ configPath, logDir, statePath, prefsPath });
  assert.ok(fs.existsSync(path.dirname(configPath)));
  assert.ok(fs.existsSync(logDir));
  assert.ok(fs.existsSync(configPath));
  fs.rmSync(base, { recursive: true });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: `Cannot find module '../src/config-io'`

- [ ] **Step 3: Create src/config-io.js**

```js
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const CONFIG_PATH    = path.join(os.homedir(), '.commanddeck', 'commands.json');
const LOG_DIR        = path.join(os.homedir(), '.commanddeck', 'logs');
const STATE_PATH     = path.join(os.homedir(), '.commanddeck', 'state.json');
const PREFS_PATH     = path.join(os.homedir(), '.commanddeck', 'prefs.json');
const AUTOSTART_PATH = path.join(os.homedir(), '.config', 'autostart', 'commanddeck.desktop');

function loadConfig(configPath = CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { commands: [] };
  }
}

function saveConfig(configPath = CONFIG_PATH, data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function ensureConfigDir({ configPath = CONFIG_PATH, logDir = LOG_DIR, statePath = STATE_PATH, prefsPath = PREFS_PATH } = {}) {
  const { loadPrefs, savePrefs, DEFAULTS } = require('./prefs');
  if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ commands: [] }, null, 2));
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ toggles: {} }, null, 2));
  }
  if (!fs.existsSync(prefsPath)) {
    savePrefs(prefsPath, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
  }
}

function detectTerminalApp() {
  const dirs = (process.env.PATH || '').split(':');
  const candidates = process.env.TERMINAL
    ? [process.env.TERMINAL, 'kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole']
    : ['kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole'];
  for (const t of candidates) {
    if (dirs.some(d => fs.existsSync(path.join(d, t)))) return t;
  }
  return null;
}

function autostartDesktopContent(app) {
  const execStr = app.isPackaged
    ? `"${process.execPath}"`
    : `"${process.execPath}" "${app.getAppPath()}"`;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=CommandDeck',
    `Exec=${execStr}`,
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
  ].join('\n') + '\n';
}

module.exports = {
  CONFIG_PATH, LOG_DIR, STATE_PATH, PREFS_PATH, AUTOSTART_PATH,
  loadConfig, saveConfig, ensureConfigDir, detectTerminalApp, autostartDesktopContent,
};
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: all tests pass including the 5 new config-io tests.

- [ ] **Step 5: Commit**

```bash
git add src/config-io.js test/config-io.test.js
git commit -m "refactor: extract config-io.js from main.js, add tests"
```

---

### Task 9: Extract window.js

**Files:**
- Create: `src/window.js`

`window.js` owns `mainWindow` and `tray`. `updateTrayIcon` receives counts as parameters instead of reading globals — the one signature change in the main process half.

- [ ] **Step 1: Create src/window.js**

```js
const { BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { buildTrayIcon, buildAppIcon } = require('./tray-icon');

let mainWindow = null;
let tray = null;

function getMainWindow() {
  return mainWindow;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow(preloadPath, rendererPath, callbacks = {}) {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: buildAppIcon(),
    show: false,
  });

  mainWindow.loadFile(rendererPath);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('show', () => { if (callbacks.onShow) callbacks.onShow(); });
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

function createTray(onToggle, onQuit) {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('CommandDeck');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show CommandDeck', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit (stop foreground processes)', click: onQuit },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', onToggle);
  updateTrayIcon({ running: 0, alertState: null });
}

function updateTrayIcon({ running, alertState }) {
  if (!tray) return;
  tray.setImage(buildTrayIcon(running, alertState));
}

module.exports = { getMainWindow, toggleWindow, createWindow, createTray, updateTrayIcon };
```

- [ ] **Step 2: Commit**

```bash
git add src/window.js
git commit -m "refactor: extract window.js from main.js"
```

---

### Task 10: Extract process-manager.js

**Files:**
- Create: `src/process-manager.js`
- Create: `test/process-manager.test.js`

`process-manager.js` owns all runtime process state. `init()` injects `getMainWindow` and `updateTrayIcon`. Tests cover the pure helpers and state operations that don't require a live process.

- [ ] **Step 1: Write the failing tests**

Create `test/process-manager.test.js`:

```js
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const procMgr = require('../src/process-manager');

before(() => {
  procMgr.init({
    getMainWindow: () => ({ webContents: { send: () => {} } }),
    updateTrayIcon: () => {},
  });
});

test('logLine: appends timestamped line to file', () => {
  const tmp = path.join(os.tmpdir(), 'cd-log-' + Date.now() + '.log');
  procMgr.logLine(tmp, 'hello world');
  const content = fs.readFileSync(tmp, 'utf8');
  assert.match(content, /\[.*\] hello world\n/);
  fs.unlinkSync(tmp);
});

test('saveCurrentState / getLiveProcesses: round-trips toggle state', () => {
  const tmp = path.join(os.tmpdir(), 'cd-state-' + Date.now() + '.json');
  procMgr.recordToggleActive('abc', { startedAt: new Date().toISOString(), logFile: '/tmp/a.log' });
  procMgr.saveCurrentState(tmp);
  const written = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.ok(written.toggles['abc']);
  procMgr.clearToggleActive('abc');
  fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test
```

Expected: `Cannot find module '../src/process-manager'`

- [ ] **Step 3: Create src/process-manager.js**

```js
const { spawn, exec } = require('child_process');
const path = require('path');
const fs   = require('fs');
const { Notification } = require('electron');
const { loadState, saveState } = require('./state');
const { loadConfig, LOG_DIR, STATE_PATH } = require('./config-io');

// pid → { pid, commandId, label, startedAt, logFile, type, process? }
const liveProcesses = new Map();
const killedByUser  = new Set();
const activeTogglesMeta = new Map();
const lastSessionToggles = new Set();
let alertState = null;

let _getMainWindow, _updateTrayIcon, _prefs;

function init({ getMainWindow, updateTrayIcon, prefs = {} }) {
  _getMainWindow  = getMainWindow;
  _updateTrayIcon = updateTrayIcon;
  _prefs          = prefs;
}

function setPrefs(prefs) {
  _prefs = prefs;
}

function getLiveProcesses() {
  const result = {};
  for (const [pid, entry] of liveProcesses.entries()) {
    result[entry.commandId] = result[entry.commandId] || [];
    result[entry.commandId].push({ pid, startedAt: entry.startedAt, logFile: entry.logFile, lastSession: false });
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
}

function getAlertState() { return alertState; }
function clearAlert()     { alertState = null; }

function recordToggleActive(commandId, meta) {
  activeTogglesMeta.set(commandId, meta);
}

function clearToggleActive(commandId) {
  activeTogglesMeta.delete(commandId);
  lastSessionToggles.delete(commandId);
}

function saveCurrentState(statePath = STATE_PATH) {
  saveState(statePath, [...activeTogglesMeta.keys(), ...lastSessionToggles]);
}

function logLine(logFile, line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
}

function notifyProcessExit(label, code, wasUserKilled, type) {
  if (wasUserKilled || type === 'toggle-on') return;
  let body;
  if (code !== 0 && _prefs?.notify?.onCrash) {
    body = `"${label}" stopped with an error (code ${code})`;
  } else if (code === 0 && _prefs?.notify?.onUnexpectedExit) {
    body = `"${label}" exited unexpectedly`;
  }
  if (!body) return;
  const n = new Notification({ title: 'CommandDeck', body });
  n.on('click', () => { _getMainWindow()?.show(); _getMainWindow()?.focus(); });
  n.show();
}

function spawnCommand(commandId, label, cmdString, type) {
  const ts = Date.now();
  const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
  logLine(logFile, `Starting: ${cmdString}`);

  const child = spawn('bash', ['-c', cmdString], {
    detached: true,
    stdio: type === 'launcher' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  });

  const entry = {
    pid: child.pid, commandId, label,
    startedAt: new Date().toISOString(), logFile, type,
    process: type !== 'launcher' ? child : null,
  };
  liveProcesses.set(child.pid, entry);

  if (type === 'launcher') {
    child.unref();
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      _getMainWindow()?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled) {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
    });
  } else {
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, text.trimEnd());
      _getMainWindow()?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, `STDERR: ${text.trimEnd()}`);
      _getMainWindow()?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      _getMainWindow()?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled && type !== 'toggle-on') {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      if (type === 'toggle-on' && code === 0) {
        activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
        lastSessionToggles.delete(commandId);
        saveCurrentState();
      }
      _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
    });
  }

  return { pid: child.pid, startedAt: entry.startedAt, logFile };
}

function runOneShot(cmdString, logFile) {
  return new Promise((resolve) => {
    logLine(logFile, `One-shot: ${cmdString}`);
    exec(cmdString, (err, stdout, stderr) => {
      if (stdout) logLine(logFile, stdout.trimEnd());
      if (stderr) logLine(logFile, `STDERR: ${stderr.trimEnd()}`);
      logLine(logFile, err ? `Failed: ${err.message}` : 'Completed OK');
      resolve({ ok: !err, stdout, stderr });
    });
  });
}

function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    if (entry.type === 'launcher') continue;
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
  liveProcesses.clear();
}

function killProcess(pid) {
  killedByUser.add(pid);
  process.kill(-pid, 'SIGTERM');
  liveProcesses.delete(pid);
}

function restoreToggleState() {
  const { loadState } = require('./state');
  const state = loadState(STATE_PATH);
  const cfg = loadConfig();
  const commandMap = new Map(cfg.commands.map(c => [c.id, c]));

  for (const [commandId, active] of Object.entries(state.toggles)) {
    if (!active) continue;
    const cmd = commandMap.get(commandId);
    if (!cmd || cmd.type !== 'toggle') continue;
    if (cmd.autoRestore) {
      try {
        spawnCommand(commandId, cmd.label, cmd.onCmd, 'toggle-on');
      } catch (err) {
        console.error(`[restore] Failed to spawn ${commandId}:`, err.message);
      }
    } else {
      lastSessionToggles.add(commandId);
    }
  }
  _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
}

module.exports = {
  init, setPrefs,
  getLiveProcesses, getAlertState, clearAlert,
  recordToggleActive, clearToggleActive,
  saveCurrentState,
  logLine, notifyProcessExit,
  spawnCommand, runOneShot,
  killAllProcesses, killProcess,
  restoreToggleState,
  liveProcesses, activeTogglesMeta, lastSessionToggles,
};
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test
```

Expected: all tests pass including the 2 new process-manager tests.

- [ ] **Step 5: Commit**

```bash
git add src/process-manager.js test/process-manager.test.js
git commit -m "refactor: extract process-manager.js from main.js, add tests"
```

---

### Task 11: Extract pty-manager.js

**Files:**
- Create: `src/pty-manager.js`

`pty-manager.js` owns `ptyProcesses`. It receives `getMainWindow` via `init()`.

- [ ] **Step 1: Create src/pty-manager.js**

```js
const pty = require('node-pty');
const os  = require('os');

const ptyProcesses = new Map();
let _getMainWindow;

function init({ getMainWindow }) {
  _getMainWindow = getMainWindow;
}

function ptyCreate(commandId) {
  if (ptyProcesses.has(commandId)) return { ok: true };
  const shellExe = process.platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash');
  const ptyProcess = pty.spawn(shellExe, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env,
  });
  ptyProcess.onData(data => {
    const win = _getMainWindow();
    if (win) win.webContents.send('pty-data', { commandId, data });
  });
  ptyProcess.onExit(({ exitCode }) => {
    ptyProcesses.delete(commandId);
    const win = _getMainWindow();
    if (win) win.webContents.send('pty-exit', { commandId, exitCode });
  });
  ptyProcesses.set(commandId, ptyProcess);
  return { ok: true };
}

function ptyWrite(commandId, data) {
  if (typeof data !== 'string') return { ok: false };
  ptyProcesses.get(commandId)?.write(data);
  return { ok: true };
}

function ptyResize(commandId, cols, rows) {
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) return { ok: false };
  ptyProcesses.get(commandId)?.resize(cols, rows);
  return { ok: true };
}

function killAllPty() {
  for (const proc of ptyProcesses.values()) {
    try { proc.kill(); } catch {}
  }
}

module.exports = { init, ptyCreate, ptyWrite, ptyResize, killAllPty };
```

- [ ] **Step 2: Commit**

```bash
git add src/pty-manager.js
git commit -m "refactor: extract pty-manager.js from main.js"
```

---

### Task 12: Extract ipc-handlers.js

**Files:**
- Create: `src/ipc-handlers.js`

All `ipcMain.handle()` calls move into a `register(ipcMain, ctx)` function. No logic lives here — it's a wiring layer only. `ctx` carries references to all the things handlers need.

- [ ] **Step 1: Create src/ipc-handlers.js**

```js
const path = require('path');
const fs   = require('fs');
const os   = require('os');

function register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell }) {
  const { CONFIG_PATH, LOG_DIR, AUTOSTART_PATH, loadConfig, saveConfig, autostartDesktopContent, detectTerminalApp } = cfgIo;
  const { spawn } = require('child_process');

  ipcMain.handle('load-config', () => loadConfig());
  ipcMain.handle('save-config', (_, data) => { saveConfig(CONFIG_PATH, data); return true; });

  ipcMain.handle('load-prefs', () => {
    const { loadPrefs } = require('./prefs');
    const { PREFS_PATH } = cfgIo;
    return loadPrefs(PREFS_PATH);
  });

  ipcMain.handle('get-autostart', () => fs.existsSync(AUTOSTART_PATH));

  ipcMain.handle('set-autostart', (_, enabled) => {
    if (enabled) {
      const { app } = require('electron');
      fs.mkdirSync(path.dirname(AUTOSTART_PATH), { recursive: true });
      fs.writeFileSync(AUTOSTART_PATH, autostartDesktopContent(app));
    } else if (fs.existsSync(AUTOSTART_PATH)) {
      fs.unlinkSync(AUTOSTART_PATH);
    }
    return { ok: true };
  });

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

  ipcMain.handle('get-live-processes', () => procMgr.getLiveProcesses());

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

  ipcMain.handle('open-log', (_, { logFile }) => { shell.openPath(logFile); return true; });
  ipcMain.handle('open-log-dir', () => { shell.openPath(LOG_DIR); return true; });

  ipcMain.handle('pty-create', (_, { commandId }) => ptyMgr.ptyCreate(commandId));
  ipcMain.handle('pty-write',  (_, { commandId, data }) => ptyMgr.ptyWrite(commandId, data));
  ipcMain.handle('pty-resize', (_, { commandId, cols, rows }) => ptyMgr.ptyResize(commandId, cols, rows));

  ipcMain.handle('open-in-terminal', async (_, { content, cmdId }) => {
    if (typeof content !== 'string' || typeof cmdId !== 'string') return { ok: false, reason: 'invalid_args' };
    const safeCmdId = cmdId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const tmpFile = path.join(os.tmpdir(), `commanddeck-${safeCmdId}-${Date.now()}.sh`);
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 30000);

    if (process.platform === 'darwin') {
      const script = `tell application "Terminal" to do script "cat '${tmpFile}'; exec $SHELL"`;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    if (process.platform === 'win32') {
      spawn('cmd', ['/K', `type "${tmpFile}"`], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    const terminal = detectTerminalApp();
    if (!terminal) return { ok: false, reason: 'no_terminal' };
    spawn(terminal, ['--', 'bash', '-c', 'cat "$1"; exec $SHELL', '--', tmpFile], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });

  ipcMain.handle('window-minimize', () => win.getMainWindow().minimize());
  ipcMain.handle('window-hide',     () => win.getMainWindow().hide());
  ipcMain.handle('window-maximize', () => {
    const w = win.getMainWindow();
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });

  ipcMain.handle('export-config', async () => {
    const ts = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win.getMainWindow(), {
      defaultPath: path.join(os.homedir(), `commanddeck-backup-${ts}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(filePath, JSON.stringify(loadConfig(), null, 2));
      return { ok: true };
    } catch (e) {
      dialog.showErrorBox('Export failed', e.message);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('import-config', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win.getMainWindow(), {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths.length) return { ok: false, canceled: true };
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    } catch (e) {
      dialog.showErrorBox('Import failed', `Could not read file: ${e.message}`);
      return { ok: false, error: e.message };
    }
    const current = loadConfig();
    const count = (current.commands || []).length;
    const { response } = await dialog.showMessageBox(win.getMainWindow(), {
      type: 'warning',
      buttons: ['Continue', 'Cancel'],
      defaultId: 1, cancelId: 1,
      message: `This will replace your ${count} current command${count === 1 ? '' : 's'}.`,
      detail: 'This cannot be undone.',
    });
    if (response !== 0) return { ok: false, canceled: true };
    saveConfig(CONFIG_PATH, data);
    return { ok: true, data };
  });
}

module.exports = { register };
```

- [ ] **Step 2: Commit**

```bash
git add src/ipc-handlers.js
git commit -m "refactor: extract ipc-handlers.js from main.js"
```

---

### Task 13: Rewrite main.js

**Files:**
- Modify: `src/main.js`

`main.js` becomes the lifecycle file: import modules, boot sequence, and quit handlers.

- [ ] **Step 1: Replace src/main.js entirely**

```js
const { app, ipcMain, globalShortcut, dialog, shell } = require('electron');
const path = require('path');

const cfgIo   = require('./config-io');
const win     = require('./window');
const procMgr = require('./process-manager');
const ptyMgr  = require('./pty-manager');
const ipc     = require('./ipc-handlers');
const { loadPrefs } = require('./prefs');

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  cfgIo.ensureConfigDir();
  const prefs = loadPrefs(cfgIo.PREFS_PATH);

  const preloadPath  = path.join(__dirname, 'preload.js');
  const rendererPath = path.join(__dirname, 'renderer', 'index.html');

  win.createWindow(preloadPath, rendererPath, {
    onShow: () => {
      procMgr.clearAlert();
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: null,
      });
    },
  });
  win.createTray(win.toggleWindow, () => { procMgr.killAllProcesses(); app.exit(0); });

  procMgr.init({ getMainWindow: win.getMainWindow, updateTrayIcon: win.updateTrayIcon, prefs });
  ptyMgr.init({ getMainWindow: win.getMainWindow });

  ipc.register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell });

  if (prefs.hotkey) globalShortcut.register(prefs.hotkey, win.toggleWindow);

  // Auto-restore spawns run before the renderer is ready. IPC events (process-exited,
  // process-output) may be dropped if the renderer hasn't loaded yet — this is safe
  // because the renderer re-derives toggle state from getLiveProcesses() on boot.
  procMgr.restoreToggleState();
});

app.on('window-all-closed', (e) => {
  // Don't quit — we live in the tray
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ptyMgr.killAllPty();
});
```

- [ ] **Step 2: Run npm start and verify the full app works**

```bash
npm start
```

Verify manually:
- App launches and appears in the system tray
- Cards load correctly from `~/.commanddeck/commands.json`
- Toggle a command on and off
- Start and kill a foreground command
- Open the output drawer and view output
- Open a cheatsheet TERM drawer and run a snippet
- Open prefs modal, record a hotkey, save
- Export config to a file
- Import config from a file
- App hides to tray on window close
- Quit from tray context menu kills foreground processes

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "refactor: rewrite main.js as slim lifecycle entry point"
```

---

## Final check

- [ ] **Verify no dead code remains**

```bash
grep -n "function spawnCommand\|function runOneShot\|function logLine\|function createWindow\|function createTray\|ipcMain.handle\|function openModal\|function renderCard\|function initTerminal" src/main.js src/renderer/app.js
```

Expected: zero matches (these functions only exist in their new dedicated modules).

- [ ] **Final commit with cleanup note**

```bash
git add -A
git commit -m "refactor: complete code organization refactor — main and renderer modularized"
```
