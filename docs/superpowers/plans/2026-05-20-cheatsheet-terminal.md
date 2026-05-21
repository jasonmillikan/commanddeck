# Cheatsheet Terminal Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cheatsheet cards' static VIEW/DEL buttons with OPEN (system terminal) and TERM (in-app per-card PTY terminal), and move DEL to the edit modal for all card types.

**Architecture:** Three features sharing the same files. DEL-in-modal removes buttons from all card `renderCard()` branches and adds a delete handler to the existing edit modal. System terminal adds an IPC handler that detects and spawns the user's terminal app with a temp file. In-app terminal adds `node-pty-prebuilt-multiarch` + `xterm.js` — one PTY per cheatsheet card (identified by commandId), one global `pty-data` listener routing to a `terminalMap`, xterm instances created lazily and shown/hidden in the drawer.

**Tech Stack:** Electron 42, Vanilla JS/HTML/CSS, `xterm@4` + `xterm-addon-fit@0.5` (loaded via `<script>` tags), `node-pty-prebuilt-multiarch` (native, main process only), `electron-rebuild` (devDep, postinstall hook).

---

## File Map

| File | What changes |
|---|---|
| `package.json` | Add deps + `postinstall` electron-rebuild script |
| `src/main.js` | PTY Map + `pty-create/write/resize` handlers + PTY cleanup on quit + `open-in-terminal` handler + terminal detection |
| `src/preload.js` | Expose `ptyCreate`, `ptyWrite`, `ptyResize`, `onPtyData`, `openInTerminal` |
| `src/renderer/index.html` | `modal-delete` button, `drawer-run-all` button, `#drawer-snippet-panel` div, `#drawer-terminals` div, xterm `<link>` + `<script>` tags |
| `src/renderer/style.css` | `.btn-danger`, snippet panel + terminal instance styles, card button hover rules |
| `src/renderer/app.js` | Remove DEL from all card branches + `delete` from `handleCardAction`, modal-delete handler, `terminalMap` + global `onPtyData`, `initTerminal()`, `switchToTerminal()`, updated `openDrawer()`, updated cheatsheet `renderCard()`, `'open'`+`'term'` in `handleCardAction`, resize fit sync |

> **Unit tests:** The test suite covers `utils.js` only. All changes here are DOM/Electron/PTY features — no extractable pure logic. Each task ends with an explicit manual smoke-test checklist instead.

---

## Task 1: DEL Moved to Modal

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add `modal-delete` button to `src/renderer/index.html`**

  Find the modal footer:
  ```html
  <div class="modal-footer">
    <button class="btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn-primary" id="modal-save">Save Command</button>
  </div>
  ```
  Replace with (delete button uses `margin-right: auto` to push cancel/save to the right):
  ```html
  <div class="modal-footer">
    <button class="btn-danger" id="modal-delete" style="display:none;margin-right:auto">Delete</button>
    <button class="btn-secondary" id="modal-cancel">Cancel</button>
    <button class="btn-primary" id="modal-save">Save Command</button>
  </div>
  ```

- [ ] **Step 2: Add `.btn-danger` to `src/renderer/style.css`**

  Find `.btn-secondary:hover { background: var(--bg3); color: var(--text); }` and add immediately after:
  ```css
  .btn-danger {
    background: transparent;
    color: var(--danger);
    border: 1px solid rgba(248, 113, 113, 0.3);
    border-radius: var(--radius);
    padding: 8px 16px;
    font-family: var(--font-ui);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-danger:hover { background: rgba(248, 113, 113, 0.1); }
  ```

- [ ] **Step 3: Remove DEL buttons from all card types in `src/renderer/app.js`**

  In `renderCard()`, the cheatsheet early-return has:
  ```html
  <button class="card-btn card-btn-delete" data-action="delete" data-id="${cmd.id}">DEL</button>
  ```
  Delete that line.

  The toggle `actionsHtml` block has a DEL button — remove it:
  ```js
  // Before:
  actionsHtml = `
    <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
    <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    <button class="card-btn card-btn-delete" data-action="delete" data-id="${cmd.id}">DEL</button>
  `;
  // After:
  actionsHtml = `
    <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
    <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
  `;
  ```

  The launcher `actionsHtml` block — same change (remove the DEL line, keep LOG and EDIT).

  The foreground `actionsHtml` block — same change (remove the DEL line, keep KILL/LOG/EDIT).

- [ ] **Step 4: Remove the `'delete'` branch from `handleCardAction()` in `src/renderer/app.js`**

  Find and delete these lines:
  ```js
  } else if (action === 'delete') {
    if (confirm(`Delete "${cmd.label}"?`)) {
      config.commands = config.commands.filter(c => c.id !== id);
      await persist();
      renderAll();
    }
  }
  ```

- [ ] **Step 5: Show/hide `modal-delete` and wire its click handler in `src/renderer/app.js`**

  In `openModal()`, find:
  ```js
  document.getElementById('modal-backdrop').classList.add('open');
  ```
  Add one line before it:
  ```js
  document.getElementById('modal-delete').style.display = editingId ? '' : 'none';
  document.getElementById('modal-backdrop').classList.add('open');
  ```

  In `closeModal()`, find:
  ```js
  function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
    editingId = null;
  }
  ```
  Add one line after `remove('open')`:
  ```js
  function closeModal() {
    document.getElementById('modal-backdrop').classList.remove('open');
    document.getElementById('modal-delete').style.display = 'none';
    editingId = null;
  }
  ```

  After the existing `modal-cancel` listener, add the delete handler:
  ```js
  document.getElementById('modal-delete').addEventListener('click', async () => {
    const cmd = config.commands.find(c => c.id === editingId);
    if (!cmd) return;
    if (confirm(`Delete "${cmd.label}"?`)) {
      config.commands = config.commands.filter(c => c.id !== editingId);
      await persist();
      closeModal();
      renderAll();
    }
  });
  ```

- [ ] **Step 6: Run tests**

  ```bash
  cd /home/j/Sync/Projects/CommandDeck && node --test test/*.test.js
  ```
  Expected: 35 passing, 0 failing.

- [ ] **Step 7: Manual smoke test**

  Run `npm start`.
  - All existing cards (toggle, launcher, foreground) have no DEL button.
  - Clicking EDIT on any card opens the modal with a red **Delete** button bottom-left.
  - Delete is hidden when clicking `+ New Command`.
  - Clicking Delete on an existing command shows the confirm dialog; confirming removes the card.
  - Cancelling the confirm leaves the command intact.

- [ ] **Step 8: Commit**

  ```bash
  git add src/renderer/index.html src/renderer/style.css src/renderer/app.js
  git commit -m "feat: move delete action from card buttons to edit modal"
  ```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `electron-rebuild` to devDependencies and a `postinstall` script in `package.json`**

  Current `package.json` scripts section:
  ```json
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "test": "node --test test/*.test.js"
  },
  ```
  Replace with:
  ```json
  "scripts": {
    "start": "electron .",
    "dev": "electron . --dev",
    "test": "node --test test/*.test.js",
    "postinstall": "electron-rebuild"
  },
  ```

- [ ] **Step 2: Install `electron-rebuild` as a dev dependency**

  ```bash
  cd /home/j/Sync/Projects/CommandDeck && npm install --save-dev electron-rebuild
  ```
  Expected: `electron-rebuild` appears in `devDependencies` in `package.json`.

- [ ] **Step 3: Install xterm and node-pty**

  ```bash
  npm install xterm@4 xterm-addon-fit@0.5 node-pty-prebuilt-multiarch
  ```
  This triggers `postinstall`, which runs `electron-rebuild` to relink the native `.node` file for Electron's Node version.

  Expected output includes something like:
  ```
  ✔ Rebuild Complete
  ```

- [ ] **Step 4: Verify the native binary exists**

  ```bash
  ls node_modules/node-pty-prebuilt-multiarch/build/Release/
  ```
  Expected: a `.node` file (e.g. `pty.node`). If absent, run `./node_modules/.bin/electron-rebuild` manually.

- [ ] **Step 5: Verify xterm UMD bundle path**

  ```bash
  ls node_modules/xterm/lib/xterm.js && ls node_modules/xterm/css/xterm.css && ls node_modules/xterm-addon-fit/lib/xterm-addon-fit.js
  ```
  Expected: all three files exist.

- [ ] **Step 6: Commit**

  ```bash
  git add package.json package-lock.json
  git commit -m "feat: add xterm, xterm-addon-fit, node-pty-prebuilt-multiarch deps"
  ```

---

## Task 3: PTY IPC Backend

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] **Step 1: Add PTY process map and require in `src/main.js`**

  Find the top of `src/main.js`:
  ```js
  const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, globalShortcut, Notification } = require('electron');
  const { spawn, exec } = require('child_process');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  ```
  Add after the `require('os')` line:
  ```js
  const pty = require('node-pty-prebuilt-multiarch');
  ```

  Then find the `const liveProcesses = new Map();` line and add after it:
  ```js
  const ptyProcesses = new Map(); // commandId → pty process
  ```

- [ ] **Step 2: Add `pty-create`, `pty-write`, `pty-resize` IPC handlers in `src/main.js`**

  Find the IPC handlers section (near `ipcMain.handle('window-minimize', ...)`) and add before the window control handlers:
  ```js
  ipcMain.handle('pty-create', (_, { commandId }) => {
    if (ptyProcesses.has(commandId)) return { ok: true };
    const shell = process.platform === 'win32'
      ? 'powershell.exe'
      : (process.env.SHELL || '/bin/bash');
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: os.homedir(),
      env: process.env,
    });
    ptyProcess.onData(data => {
      if (mainWindow) mainWindow.webContents.send('pty-data', { commandId, data });
    });
    ptyProcesses.set(commandId, ptyProcess);
    return { ok: true };
  });

  ipcMain.handle('pty-write', (_, { commandId, data }) => {
    ptyProcesses.get(commandId)?.write(data);
    return { ok: true };
  });

  ipcMain.handle('pty-resize', (_, { commandId, cols, rows }) => {
    ptyProcesses.get(commandId)?.resize(cols, rows);
    return { ok: true };
  });
  ```

- [ ] **Step 3: Kill all PTYs on app quit in `src/main.js`**

  Find the existing `app.on('will-quit', ...)` handler:
  ```js
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
  ```
  Replace with:
  ```js
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    for (const ptyProc of ptyProcesses.values()) {
      try { ptyProc.kill(); } catch {}
    }
  });
  ```

- [ ] **Step 4: Expose PTY API in `src/preload.js`**

  Find the `// Events from main → renderer` comment:
  ```js
  // Events from main → renderer
  onProcessExited: (cb) => ipcRenderer.on('process-exited', (_, data) => cb(data)),
  onProcessOutput: (cb) => ipcRenderer.on('process-output', (_, data) => cb(data)),
  ```
  Add four new entries immediately before the comment:
  ```js
  // PTY (in-app terminal)
  ptyCreate:  (commandId) => ipcRenderer.invoke('pty-create', { commandId }),
  ptyWrite:   (commandId, data) => ipcRenderer.invoke('pty-write', { commandId, data }),
  ptyResize:  (commandId, cols, rows) => ipcRenderer.invoke('pty-resize', { commandId, cols, rows }),
  onPtyData:  (cb) => ipcRenderer.on('pty-data', (_, payload) => cb(payload)),

  // Events from main → renderer
  ```

- [ ] **Step 5: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 6: Manual smoke test**

  Run `npm start` — app launches without error. The PTY handlers are not yet wired to UI, so there is nothing to test visually; just confirm the app starts cleanly.

- [ ] **Step 7: Commit**

  ```bash
  git add src/main.js src/preload.js
  git commit -m "feat: add PTY IPC backend (pty-create, pty-write, pty-resize)"
  ```

---

## Task 4: System Terminal Button — Backend and Preload

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] **Step 1: Add terminal detection helper in `src/main.js`**

  Find `const liveProcesses = new Map();` and add this function immediately before it:
  ```js
  function detectTerminalApp() {
    if (process.env.TERMINAL) return process.env.TERMINAL;
    const dirs = (process.env.PATH || '').split(':');
    const candidates = ['kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole', 'xterm'];
    for (const t of candidates) {
      if (dirs.some(d => fs.existsSync(path.join(d, t)))) return t;
    }
    return null;
  }
  ```

- [ ] **Step 2: Add `open-in-terminal` IPC handler in `src/main.js`**

  Add after the `pty-resize` handler from Task 3:
  ```js
  ipcMain.handle('open-in-terminal', async (_, { content, cmdId }) => {
    const tmpFile = path.join(os.tmpdir(), `commanddeck-${cmdId}.sh`);
    fs.writeFileSync(tmpFile, content, { mode: 0o644 });
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
    spawn(terminal, ['--', 'bash', '-c', `cat "${tmpFile}"; exec $SHELL`], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });
  ```

- [ ] **Step 3: Expose `openInTerminal` in `src/preload.js`**

  Find the PTY section added in Task 3:
  ```js
  // PTY (in-app terminal)
  ptyCreate:  (commandId) => ipcRenderer.invoke('pty-create', { commandId }),
  ```
  Add one line before it:
  ```js
  // System terminal
  openInTerminal: (content, cmdId) => ipcRenderer.invoke('open-in-terminal', { content, cmdId }),

  // PTY (in-app terminal)
  ```

- [ ] **Step 4: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 5: Commit**

  ```bash
  git add src/main.js src/preload.js
  git commit -m "feat: add open-in-terminal IPC handler with terminal detection"
  ```

---

## Task 5: Drawer HTML + CSS Scaffold

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add `drawer-run-all`, `drawer-snippet-panel`, and `drawer-terminals` to `src/renderer/index.html`**

  Find the output drawer:
  ```html
  <!-- Output drawer -->
  <div class="drawer" id="output-drawer">
    <div class="drawer-resize-handle" id="drawer-resize-handle"></div>
    <div class="drawer-header">
      <span id="drawer-title">Output</span>
      <div class="drawer-actions">
        <button class="tb-btn" id="drawer-open-log">Open log file</button>
        <button class="tb-btn" id="drawer-close">×</button>
      </div>
    </div>
    <pre class="drawer-output" id="drawer-output"></pre>
  </div>
  ```
  Replace with:
  ```html
  <!-- Output drawer -->
  <div class="drawer" id="output-drawer">
    <div class="drawer-resize-handle" id="drawer-resize-handle"></div>
    <div class="drawer-header">
      <span id="drawer-title">Output</span>
      <div class="drawer-actions">
        <button class="tb-btn" id="drawer-run-all" style="display:none">Run all</button>
        <button class="tb-btn" id="drawer-open-log">Open log file</button>
        <button class="tb-btn" id="drawer-close">×</button>
      </div>
    </div>
    <pre class="drawer-output" id="drawer-output"></pre>
    <div id="drawer-snippet-panel" style="display:none"></div>
    <div id="drawer-terminals" style="display:none"></div>
  </div>
  ```

- [ ] **Step 2: Add xterm `<link>` and `<script>` tags to `src/renderer/index.html`**

  Find the existing scripts at the bottom:
  ```html
  <script src="utils.js"></script>
  <script src="../../node_modules/sortablejs/Sortable.min.js"></script>
  <script src="app.js"></script>
  ```
  Replace with:
  ```html
  <link rel="stylesheet" href="../../node_modules/xterm/css/xterm.css" />
  <script src="utils.js"></script>
  <script src="../../node_modules/sortablejs/Sortable.min.js"></script>
  <script src="../../node_modules/xterm/lib/xterm.js"></script>
  <script src="../../node_modules/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <script src="app.js"></script>
  ```

- [ ] **Step 3: Add snippet panel and terminal instance styles to `src/renderer/style.css`**

  Find the end of the file (after `#f-content { ... }`) and add:
  ```css
  /* ── In-app terminal ───────────────────────────────────────────────────────── */
  #drawer-snippet-panel {
    max-height: 120px;
    overflow-y: auto;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .snippet-line {
    padding: 4px 14px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-mid);
    cursor: pointer;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .snippet-line:hover { background: var(--bg3); color: var(--text); }
  #drawer-terminals {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .terminal-instance {
    width: 100%;
    height: 100%;
  }
  .terminal-instance.xterm-hidden { display: none; }
  .card-btn-open:hover { color: var(--accent2); }
  .card-btn-term:hover { color: var(--accent); }
  ```

- [ ] **Step 4: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 5: Commit**

  ```bash
  git add src/renderer/index.html src/renderer/style.css
  git commit -m "feat: add drawer terminal scaffold (HTML + CSS + xterm assets)"
  ```

---

## Task 6: xterm.js Wiring — Terminal Map and Init

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add `terminalMap` and `activeTerminalId` to state in `src/renderer/app.js`**

  Find the state block at the top of `app.js`:
  ```js
  let prefs = { hotkey: '', notify: { onCrash: true, onUnexpectedExit: false } };
  ```
  Add two lines after it:
  ```js
  const terminalMap = new Map(); // commandId → { term, fitAddon }
  let activeTerminalId = null;
  ```

- [ ] **Step 2: Register the global `onPtyData` listener at boot in `src/renderer/app.js`**

  Find the boot section:
  ```js
  // ─── Boot ─────────────────────────────────────────────────────────────────────
  loadAll();
  ```
  Add the listener before `loadAll()`:
  ```js
  // ─── Boot ─────────────────────────────────────────────────────────────────────
  window.api.onPtyData(({ commandId, data }) => {
    terminalMap.get(commandId)?.term.write(data);
  });

  loadAll();
  ```

- [ ] **Step 3: Add `initTerminal()` and `switchToTerminal()` functions in `src/renderer/app.js`**

  Add these two functions before the `// ─── Output drawer ───` section:
  ```js
  // ─── In-app terminal ─────────────────────────────────────────────────────────
  async function initTerminal(cmd) {
    if (terminalMap.has(cmd.id)) return;
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
    terminalMap.set(cmd.id, { term, fitAddon });
    await window.api.ptyCreate(cmd.id);
  }

  function switchToTerminal(cmdId) {
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
  ```

- [ ] **Step 4: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 5: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: add xterm terminal map, global pty-data routing, initTerminal/switchToTerminal"
  ```

---

## Task 7: openDrawer Terminal Mode

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Replace `openDrawer()` in `src/renderer/app.js`**

  Find the full `openDrawer` function and replace it entirely:
  ```js
  function openDrawer(cmd, mode = 'output') {
    drawerCommandId = cmd.id;
    const logBtn = document.getElementById('drawer-open-log');
    const runAllBtn = document.getElementById('drawer-run-all');
    const outputEl = document.getElementById('drawer-output');
    const snippetPanel = document.getElementById('drawer-snippet-panel');
    const terminalsEl = document.getElementById('drawer-terminals');
    document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;

    if (mode === 'term') {
      // Terminal mode
      logBtn.style.display = 'none';
      runAllBtn.style.display = '';
      outputEl.style.display = 'none';
      snippetPanel.style.display = '';
      terminalsEl.style.display = '';

      // Render snippet panel fresh (content may have been edited)
      snippetPanel.innerHTML = (cmd.content || '')
        .split('\n')
        .map(line => `<div class="snippet-line" data-cmd="${escHtml(line)}">${escHtml(line)}</div>`)
        .join('');

      // Wire snippet-line clicks
      snippetPanel.onclick = (e) => {
        const lineEl = e.target.closest('.snippet-line');
        if (!lineEl) return;
        window.api.ptyWrite(cmd.id, lineEl.dataset.cmd);
      };

      initTerminal(cmd).then(() => switchToTerminal(cmd.id));
    } else {
      // Output mode (existing behaviour)
      logBtn.style.display = cmd.type === 'cheatsheet' ? 'none' : '';
      runAllBtn.style.display = 'none';
      outputEl.style.display = '';
      snippetPanel.style.display = 'none';
      terminalsEl.style.display = 'none';
      drawerLogFile = getLogFile(cmd.id);
      const lines = outputMap[cmd.id] || [];
      outputEl.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
      outputEl.scrollTop = outputEl.scrollHeight;
    }

    const drawer = document.getElementById('output-drawer');
    drawer.classList.add('open');
    document.querySelector('.board').style.paddingBottom = drawer.offsetHeight + 'px';
  }
  ```

- [ ] **Step 2: Wire the `drawer-run-all` button in `src/renderer/app.js`**

  Find the `drawer-close` and `drawer-open-log` listeners:
  ```js
  document.getElementById('drawer-close').addEventListener('click', () => {
    document.getElementById('output-drawer').classList.remove('open');
    document.querySelector('.board').style.paddingBottom = '';
  });
  document.getElementById('drawer-open-log').addEventListener('click', async () => {
    if (drawerLogFile) await window.api.openLog(drawerLogFile);
  });
  ```
  Add after the `drawer-open-log` listener:
  ```js
  document.getElementById('drawer-run-all').addEventListener('click', () => {
    if (!drawerCommandId) return;
    const cmd = config.commands.find(c => c.id === drawerCommandId);
    if (!cmd?.content) return;
    const lines = cmd.content.split('\n').filter(l => l.trim() !== '');
    lines.forEach(line => window.api.ptyWrite(drawerCommandId, line + '\r'));
  });
  ```

  Also update `openDrawer` reference in `handleCardAction` — the existing `'log' || 'view'` branch calls `openDrawer(cmd)` without a mode. This is fine for all non-terminal uses (output mode is default). No change needed there.

- [ ] **Step 3: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: openDrawer terminal mode with snippet panel and run-all"
  ```

---

## Task 8: Cheatsheet Card Buttons

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Replace the cheatsheet `renderCard()` early-return in `src/renderer/app.js`**

  Find the cheatsheet early-return block (starts at `if (cmd.type === 'cheatsheet')`). Replace the entire block:
  ```js
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
  ```

- [ ] **Step 2: Add `'open'` and `'term'` to `handleCardAction()` in `src/renderer/app.js`**

  Find:
  ```js
  } else if (action === 'log' || action === 'view') {
    openDrawer(cmd);
  ```
  Replace with:
  ```js
  } else if (action === 'log') {
    openDrawer(cmd, 'output');
  } else if (action === 'term') {
    openDrawer(cmd, 'term');
  } else if (action === 'open') {
    const result = await window.api.openInTerminal(cmd.content, cmd.id);
    if (result && !result.ok && result.reason === 'no_terminal') {
      new Notification('No terminal found', { body: 'Set the $TERMINAL environment variable to your terminal emulator.' });
    }
  ```

- [ ] **Step 3: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 4: Manual smoke test — full cheatsheet terminal flow**

  Run `npm start`.

  **DEL in modal:**
  - Cheatsheet card has buttons `OPEN · TERM · EDIT` (no DEL).
  - Click EDIT → Delete button appears bottom-left of modal.

  **TERM button:**
  - Click TERM (or anywhere on card body) on a cheatsheet card.
  - Drawer slides up. Header shows `▸ Label`, `Run all` button visible, `Open log file` hidden.
  - Snippet panel shows the cheatsheet lines, each as a clickable row.
  - Below the snippet panel, an xterm.js terminal renders with a shell prompt.
  - Type `echo hello` and press Enter → "hello" appears in the terminal.
  - Click a snippet line → that command appears in the terminal input (no auto-execute).
  - Click `Run all` → all non-empty lines are sent and executed sequentially.
  - Close and reopen TERM → terminal session and history are preserved.
  - Click TERM on a different cheatsheet card → terminal switches to that card's session.
  - Switch back to the first card → first session is still alive with its history.

  **OPEN button:**
  - Click OPEN → system terminal opens showing the cheatsheet content, then drops to a shell.
  - If no terminal emulator found → a notification appears.

  **LOG on other card types:**
  - Click LOG on a toggle/launcher/foreground card → drawer shows output mode (pre element, no snippet panel, no terminal).

- [ ] **Step 5: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: cheatsheet OPEN/TERM buttons and handleCardAction wiring"
  ```

---

## Task 9: Drawer Resize — FitAddon Sync

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Call `fitAddon.fit()` after drawer resize in `src/renderer/app.js`**

  Find the `onUp` function inside `initDrawerResize()`:
  ```js
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const newHeight = parseInt(drawer.style.height, 10);
    prefs = { ...prefs, drawerHeight: newHeight };
    window.api.savePrefs(prefs);
  }
  ```
  Replace with:
  ```js
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const newHeight = parseInt(drawer.style.height, 10);
    prefs = { ...prefs, drawerHeight: newHeight };
    window.api.savePrefs(prefs);
    if (activeTerminalId) {
      const entry = terminalMap.get(activeTerminalId);
      if (entry) {
        entry.fitAddon.fit();
        const { cols, rows } = entry.term;
        window.api.ptyResize(activeTerminalId, cols, rows);
      }
    }
  }
  ```

- [ ] **Step 2: Run tests**

  ```bash
  node --test test/*.test.js
  ```
  Expected: 35 passing.

- [ ] **Step 3: Manual smoke test**

  Run `npm start`. Open a cheatsheet terminal (TERM). Drag the resize handle up or down. After releasing:
  - The xterm terminal reflows to fill the new height cleanly (no blank space, no truncated lines).
  - The shell prompt realigns correctly.

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: sync xterm FitAddon after drawer resize"
  ```
