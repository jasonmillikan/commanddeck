# Maximize Button, Drawer Resize, Cheatsheet Type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a window maximize button, a resizable/persistent output drawer, and a new "cheatsheet" command type (read-only reference card with content displayed in the drawer).

**Architecture:** Three independent features touching the same files. Maximize uses Electron IPC + renderer event subscription. Drawer resize uses DOM `mousedown/mousemove/mouseup` with height saved to `prefs.json`. Cheatsheet is a new command type added to the data schema, card renderer, modal, and drawer — no new files, no migration logic.

**Tech Stack:** Electron (IPC, window events), Vanilla JS/HTML/CSS (no build step), Node.js `node --test` for unit tests.

---

## File Map

| File | What changes |
|------|-------------|
| `src/main.js` | `window-maximize` IPC handler, `maximize`/`unmaximize` event push to renderer |
| `src/preload.js` | Expose `toggleMaximize`, `onWindowMaximized` |
| `src/prefs.js` | Add `drawerHeight: 240` to `DEFAULTS` |
| `src/renderer/index.html` | Maximize button, resize handle div, cheatsheet type option + textarea |
| `src/renderer/style.css` | Drawer height/closed-offset fix, resize handle, badge-cheatsheet, textarea, card-btn-view |
| `src/renderer/app.js` | Maximize wiring, drawer resize init, cheatsheet card/modal/drawer/search |
| `CLAUDE.md` | Type table + schema example updated, item #7 removed |

> **Note on unit tests:** The project's test suite (`node --test`) only covers pure utility functions in `src/renderer/utils.js`. The changes in this plan are all DOM/Electron features with no extractable pure logic to unit-test. Each task instead ends with explicit manual smoke-test steps.

---

## Task 1: Maximize Button — IPC and Preload

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] **Step 1: Add `window-maximize` IPC handler to `src/main.js`**

  Find the two existing window-control handlers:
  ```js
  ipcMain.handle('window-minimize', () => mainWindow.minimize());
  ipcMain.handle('window-hide', () => mainWindow.hide());
  ```
  Add a third line immediately after them:
  ```js
  ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ```

- [ ] **Step 2: Push maximize state to renderer in `createWindow()`**

  Find the existing `mainWindow.on('show', ...)` handler in `createWindow()`:
  ```js
  mainWindow.on('show', () => {
    alertState = null;
    updateTrayIcon();
  });
  ```
  Add two new handlers immediately after it:
  ```js
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
  ```

- [ ] **Step 3: Expose the new API in `src/preload.js`**

  Find the window controls section:
  ```js
  minimize: () => ipcRenderer.invoke('window-minimize'),
  hide: () => ipcRenderer.invoke('window-hide'),
  ```
  Add two entries immediately after `hide`:
  ```js
  toggleMaximize: () => ipcRenderer.invoke('window-maximize'),
  onWindowMaximized: (cb) => ipcRenderer.on('window-maximized', (_, v) => cb(v)),
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/main.js src/preload.js
  git commit -m "feat: add window-maximize IPC handler and preload bindings"
  ```

---

## Task 2: Maximize Button — Titlebar UI

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add the maximize button to the titlebar in `index.html`**

  Find the titlebar controls:
  ```html
  <button class="tb-btn" id="btn-minimize" title="Minimize">−</button>
  <button class="tb-btn tb-btn-close" id="btn-hide" title="Hide to tray">×</button>
  ```
  Insert the maximize button between them:
  ```html
  <button class="tb-btn" id="btn-minimize" title="Minimize">−</button>
  <button class="tb-btn" id="btn-maximize" title="Maximize">□</button>
  <button class="tb-btn tb-btn-close" id="btn-hide" title="Hide to tray">×</button>
  ```

- [ ] **Step 2: Wire up the button in `src/renderer/app.js`**

  Find the titlebar controls section near the bottom of `app.js`:
  ```js
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
  document.getElementById('btn-hide').addEventListener('click', () => window.api.hide());
  ```
  Add after those two lines:
  ```js
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.toggleMaximize());
  window.api.onWindowMaximized(isMax => {
    const btn = document.getElementById('btn-maximize');
    btn.textContent = isMax ? '❐' : '□';
    btn.title = isMax ? 'Restore' : 'Maximize';
  });
  ```

- [ ] **Step 3: Manual smoke test**

  Run `npm start`. In the titlebar:
  - A new `□` button appears between `−` and `×`.
  - Clicking it maximizes the window and the icon changes to `❐`.
  - Clicking again restores the window and the icon changes back to `□`.
  - Maximizing via the window manager (e.g., keyboard shortcut or tiling WM) also updates the icon.

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/index.html src/renderer/app.js
  git commit -m "feat: add maximize/restore button to titlebar"
  ```

---

## Task 3: Drawer Resize — HTML and CSS Scaffolding

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add the resize handle div to `index.html`**

  Find the output drawer:
  ```html
  <!-- Output drawer -->
  <div class="drawer" id="output-drawer">
    <div class="drawer-header">
  ```
  Insert the resize handle as the first child of `.drawer`:
  ```html
  <!-- Output drawer -->
  <div class="drawer" id="output-drawer">
    <div class="drawer-resize-handle" id="drawer-resize-handle"></div>
    <div class="drawer-header">
  ```

- [ ] **Step 2: Update `.drawer` in `style.css` — remove fixed height, fix hidden offset**

  Find the `.drawer` rule:
  ```css
  .drawer {
    position: fixed;
    bottom: -400px;
    left: 180px; right: 0;
    height: 240px;
    background: var(--bg2);
    border-top: 1px solid var(--border2);
    display: flex;
    flex-direction: column;
    z-index: 50;
    transition: bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  ```
  Replace it with (removes `height: 240px`, changes `-400px` to `-100vh` so a resized drawer always hides fully):
  ```css
  .drawer {
    position: fixed;
    bottom: -100vh;
    left: 180px; right: 0;
    background: var(--bg2);
    border-top: 1px solid var(--border2);
    display: flex;
    flex-direction: column;
    z-index: 50;
    transition: bottom 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  ```

- [ ] **Step 3: Add resize handle styles to `style.css`**

  Add immediately after the `.drawer.open` rule:
  ```css
  .drawer-resize-handle {
    height: 5px;
    cursor: ns-resize;
    flex-shrink: 0;
    background: transparent;
    transition: background 0.15s;
  }
  .drawer-resize-handle:hover { background: var(--border2); }
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/index.html src/renderer/style.css
  git commit -m "feat: add drawer resize handle scaffold (HTML + CSS)"
  ```

---

## Task 4: Drawer Resize — Prefs Default and JS Logic

**Files:**
- Modify: `src/prefs.js`
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add `drawerHeight` to `DEFAULTS` in `src/prefs.js`**

  Find `DEFAULTS`:
  ```js
  const DEFAULTS = {
    hotkey: 'Super+D',
    notify: {
      onCrash: true,
      onUnexpectedExit: false,
    },
  };
  ```
  Replace with:
  ```js
  const DEFAULTS = {
    hotkey: 'Super+D',
    drawerHeight: 240,
    notify: {
      onCrash: true,
      onUnexpectedExit: false,
    },
  };
  ```

- [ ] **Step 2: Apply saved drawer height on boot in `src/renderer/app.js`**

  Find `loadAll()`:
  ```js
  async function loadAll() {
    const raw = await window.api.loadConfig();
    const { commands, changed } = migrateCommands(raw.commands || []);
    config = { ...raw, commands };
    if (changed) await window.api.saveConfig(config);
    liveMap = await window.api.getLiveProcesses();
    prefs = await window.api.loadPrefs();
    renderAll();
  }
  ```
  Add one line after `prefs = await window.api.loadPrefs();`:
  ```js
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
  ```

- [ ] **Step 3: Add drag-to-resize logic in `src/renderer/app.js`**

  Find the boot call at the bottom of `app.js`:
  ```js
  // ─── Boot ─────────────────────────────────────────────────────────────────────
  loadAll();
  ```
  Add an IIFE after `loadAll()`:
  ```js
  // ─── Boot ─────────────────────────────────────────────────────────────────────
  loadAll();

  (function initDrawerResize() {
    const handle = document.getElementById('drawer-resize-handle');
    const drawer = document.getElementById('output-drawer');
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      function onMove(e) {
        const newHeight = Math.round(
          Math.min(Math.max(window.innerHeight - e.clientY, 100), window.innerHeight * 0.6)
        );
        drawer.style.height = newHeight + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const newHeight = parseInt(drawer.style.height, 10);
        prefs = { ...prefs, drawerHeight: newHeight };
        window.api.savePrefs(prefs);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();
  ```

  > `window.api.savePrefs` re-registers the global hotkey as a side effect (it shares the `save-prefs` channel). Since the full `prefs` object including the current hotkey is passed, re-registration succeeds. This is acceptable.

- [ ] **Step 4: Manual smoke test**

  Run `npm start`. Open the drawer by clicking LOG on a foreground command (or any command).
  - Drawer opens at 240px height by default.
  - Hovering over the top edge of the drawer shows a subtle highlight.
  - Dragging the handle up increases the drawer height; dragging down decreases it.
  - Minimum height is ~100px; maximum is ~60% of the window height.
  - Close the app and reopen — the drawer reopens at the same height you left it.

- [ ] **Step 5: Commit**

  ```bash
  git add src/prefs.js src/renderer/app.js
  git commit -m "feat: persist and restore drawer height via drag-to-resize handle"
  ```

---

## Task 5: Cheatsheet Type — CSS and Modal HTML

**Files:**
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Extend modal input styles to cover `textarea` in `style.css`**

  Find:
  ```css
  .modal-body input, .modal-body select {
  ```
  Replace that selector (two occurrences — the rule and the `:focus` rule) with:
  ```css
  .modal-body input, .modal-body select, .modal-body textarea {
  ```
  And:
  ```css
  .modal-body input:focus, .modal-body select:focus, .modal-body textarea:focus { border-color: var(--accent2); }
  ```

- [ ] **Step 2: Add cheatsheet badge and supporting styles to `style.css`**

  Find the existing badge rules:
  ```css
  .badge-toggle  { background: rgba(34, 211, 238, 0.12); color: var(--accent2); border: 1px solid rgba(34, 211, 238, 0.2); }
  .badge-launcher{ background: rgba(251, 191, 36, 0.12); color: var(--warn);    border: 1px solid rgba(251, 191, 36, 0.2); }
  .badge-foreground{ background: rgba(74, 222, 128, 0.12); color: var(--accent); border: 1px solid rgba(74, 222, 128, 0.2); }
  ```
  Add a fourth line immediately after:
  ```css
  .badge-cheatsheet{ background: rgba(167,139,250,0.12); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }
  ```

  Then find the card button hover rules:
  ```css
  .card-btn-log:hover   { color: var(--accent2); }
  ```
  Add after it:
  ```css
  .card-btn-view:hover  { color: var(--accent2); }
  ```

  Then find the end of the file (or a suitable location in the modal section) and add:
  ```css
  #f-content { resize: vertical; min-height: 120px; line-height: 1.5; }
  ```

- [ ] **Step 3: Add `cheatsheet` option to type select in `index.html`**

  Find:
  ```html
  <select id="f-type">
    <option value="toggle">Toggle (ON/OFF commands)</option>
    <option value="launcher">Launcher (fire &amp; forget)</option>
    <option value="foreground">Foreground (runs in managed terminal)</option>
  </select>
  ```
  Add a fourth option:
  ```html
  <select id="f-type">
    <option value="toggle">Toggle (ON/OFF commands)</option>
    <option value="launcher">Launcher (fire &amp; forget)</option>
    <option value="foreground">Foreground (runs in managed terminal)</option>
    <option value="cheatsheet">Cheatsheet (read-only reference)</option>
  </select>
  ```

- [ ] **Step 4: Add `f-content-row` textarea to the modal in `index.html`**

  Find `f-on-row` (it follows the type select):
  ```html
  <div id="f-on-row">
  ```
  Insert `f-content-row` immediately before it:
  ```html
  <div id="f-content-row">
    <label>Content <span class="required">*</span>
      <textarea id="f-content" rows="6" placeholder="Enter reference content…"></textarea>
    </label>
  </div>
  <div id="f-on-row">
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/renderer/style.css src/renderer/index.html
  git commit -m "feat: add cheatsheet badge, textarea modal field, and view button styles"
  ```

---

## Task 6: Cheatsheet Type — Card Rendering and Search

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Update `badgeFor()` to handle cheatsheet**

  Find:
  ```js
  function badgeFor(type) {
    const map = { toggle: 'badge-toggle', launcher: 'badge-launcher', foreground: 'badge-foreground' };
    const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND' };
    return `<span class="card-type-badge ${map[type]}">${labels[type]}</span>`;
  }
  ```
  Replace with:
  ```js
  function badgeFor(type) {
    const map = { toggle: 'badge-toggle', launcher: 'badge-launcher', foreground: 'badge-foreground', cheatsheet: 'badge-cheatsheet' };
    const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
    return `<span class="card-type-badge ${map[type]}">${labels[type]}</span>`;
  }
  ```

- [ ] **Step 2: Update `filteredCommands()` to search cheatsheet content**

  Find:
  ```js
  function filteredCommands() {
    return config.commands.filter(cmd => {
      const tagOk = activeGroup === 'all' || (cmd.tags || []).includes(activeGroup);
      const q = searchQuery.toLowerCase();
      const searchOk = !q ||
        cmd.label.toLowerCase().includes(q) ||
        (cmd.note || '').toLowerCase().includes(q) ||
        (cmd.onCmd || '').toLowerCase().includes(q);
      return tagOk && searchOk;
    });
  }
  ```
  Replace with:
  ```js
  function filteredCommands() {
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
  ```

- [ ] **Step 3: Add cheatsheet early-return to `renderCard()`**

  Find the opening of `renderCard`:
  ```js
  function renderCard(cmd) {
    const running = commandIsRunning(cmd.id);
  ```
  Insert a cheatsheet early-return block before that first line:
  ```js
  function renderCard(cmd) {
    if (cmd.type === 'cheatsheet') {
      const previewLine = (cmd.content || '').split('\n')[0] || '';
      return `
        <div class="card" data-id="${cmd.id}">
          <div class="card-drag-handle">⠿</div>
          <div class="card-body" data-action="view" data-id="${cmd.id}">
            <div class="card-header">
              <div class="card-info">
                <div class="card-label">${escHtml(cmd.label)}</div>
                ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
              </div>
              ${badgeFor(cmd.type)}
            </div>
            <div class="card-cmd" title="${escHtml(cmd.content || '')}">${escHtml(previewLine)}</div>
            <div class="card-actions">
              <button class="card-btn card-btn-view"   data-action="view"   data-id="${cmd.id}">VIEW</button>
              <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
              <button class="card-btn card-btn-delete" data-action="delete" data-id="${cmd.id}">DEL</button>
            </div>
          </div>
        </div>
      `;
    }
    const running = commandIsRunning(cmd.id);
    // ... rest of existing renderCard unchanged
  ```

  > **Click targeting note:** `.card-body` carries `data-action="view"` and `data-id`. `event.target.closest('[data-action]')` traverses up from any click within `.card-body`, finding either a specific button (EDIT/DEL/VIEW — each has its own `data-action`) or `.card-body` itself. The drag handle is a sibling of `.card-body`, not a child, so clicks on it traverse up to `.card` (no `data-action`) and are silently ignored by the existing `if (!btn) { attachCardListeners(); return; }` guard.

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: cheatsheet card rendering and content search"
  ```

---

## Task 7: Cheatsheet Type — Drawer and Action Handling

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Replace `openDrawer()` to handle cheatsheet content**

  Find the full `openDrawer` function:
  ```js
  function openDrawer(cmd) {
    drawerCommandId = cmd.id;
    drawerLogFile = getLogFile(cmd.id);
    document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;
    const out = document.getElementById('drawer-output');
    const lines = outputMap[cmd.id] || [];
    out.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
    out.scrollTop = out.scrollHeight;
    document.getElementById('output-drawer').classList.add('open');
  }
  ```
  Replace it entirely:
  ```js
  function openDrawer(cmd) {
    drawerCommandId = cmd.id;
    const logBtn = document.getElementById('drawer-open-log');
    document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;
    const out = document.getElementById('drawer-output');

    if (cmd.type === 'cheatsheet') {
      drawerLogFile = null;
      logBtn.style.display = 'none';
      out.textContent = cmd.content || '(empty)';
      out.scrollTop = 0;
    } else {
      drawerLogFile = getLogFile(cmd.id);
      logBtn.style.display = '';
      const lines = outputMap[cmd.id] || [];
      out.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
      out.scrollTop = out.scrollHeight;
    }
    document.getElementById('output-drawer').classList.add('open');
  }
  ```

- [ ] **Step 2: Add `'view'` to the `handleCardAction` log branch**

  Find:
  ```js
  } else if (action === 'log') {
    openDrawer(cmd);
  ```
  Replace with:
  ```js
  } else if (action === 'log' || action === 'view') {
    openDrawer(cmd);
  ```

- [ ] **Step 3: Manual smoke test — cheatsheet card + drawer**

  Run `npm start`. Click `+ New Command`, select type `Cheatsheet (read-only reference)`.
  - The ON/OFF command fields disappear; a content textarea appears.
  - Fill in a label (e.g. "Git Cheatsheet") and content (e.g. multiple lines of git commands). Save.
  - A card appears with a violet `SHEET` badge, no toggle/start button, no idle meta row.
  - The first line of content appears truncated in the card preview.
  - Click anywhere on the card body → the drawer slides up showing the full content in monospace. The "Open log file" button is hidden.
  - Click the `VIEW` button → same drawer opens.
  - Open the drawer for a regular foreground/launcher command → "Open log file" button reappears.
  - Type a word from the cheatsheet content in the search box → the cheatsheet card is found.

- [ ] **Step 4: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: cheatsheet drawer display and view action handler"
  ```

---

## Task 8: Cheatsheet Type — Modal Logic

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Replace `updateModalFields()` to handle cheatsheet type**

  Find the full `updateModalFields` function:
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
  Replace it entirely:
  ```js
  function updateModalFields() {
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
  ```

- [ ] **Step 2: Add content field population to `openModal()`**

  Find:
  ```js
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  modalTags = [...(cmd?.tags || [])];
  ```
  Insert one line between them:
  ```js
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  document.getElementById('f-content').value = cmd?.content || '';
  modalTags = [...(cmd?.tags || [])];
  ```

- [ ] **Step 3: Replace the `modal-save` listener to handle cheatsheet saves**

  Find the full `modal-save` listener (from `document.getElementById('modal-save').addEventListener` through its closing `});`). Replace it entirely:
  ```js
  document.getElementById('modal-save').addEventListener('click', async () => {
    const label = document.getElementById('f-label').value.trim();
    const type = document.getElementById('f-type').value;

    // Flush any partially-typed tag in the input
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
        const idx = config.commands.findIndex(c => c.id === editingId);
        if (idx !== -1) config.commands[idx] = entry;
      } else {
        config.commands.push(entry);
      }
      await persist();
      closeModal();
      renderAll();
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
      ...(type === 'foreground'? { onCmd } : {}),
    };

    if (editingId) {
      const idx = config.commands.findIndex(c => c.id === editingId);
      if (idx !== -1) config.commands[idx] = entry;
    } else {
      config.commands.push(entry);
    }
    await persist();
    closeModal();
    renderAll();
  });
  ```

- [ ] **Step 4: Manual smoke test — modal round-trip**

  Run `npm start`.
  - Open `+ New Command`, select `Cheatsheet`. Only label, note, content, and tags fields are visible (no command fields).
  - Try saving with no content — validation alert fires.
  - Save a valid cheatsheet. Card appears on the board.
  - Click EDIT on the cheatsheet card — modal opens with the correct content pre-filled, type selector shows `Cheatsheet`.
  - Switch type from Cheatsheet to Toggle in the modal — command fields reappear, content textarea hides.
  - Switch back to Cheatsheet — content textarea reappears.
  - Save the edit. Content is updated on the card.

- [ ] **Step 5: Commit**

  ```bash
  git add src/renderer/app.js
  git commit -m "feat: cheatsheet modal fields, validation, and save logic"
  ```

---

## Task 9: CLAUDE.md Updates

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `cheatsheet` to the command types table**

  Find the types table:
  ```markdown
  | Toggle | `"toggle"` | `onCmd`, `offCmd` | ON runs and exits (one-shot), OFF runs and exits. No persistent PID. Perfect for `pactl load/unload`. |
  | Launcher | `"launcher"` | `launchCmd` | Spawns detached (`detached: true`, `unref()`). App lives on after CommandDeck closes. PID tracked until exit. |
  | Foreground | `"foreground"` | `onCmd` | Spawns managed. stdout/stderr streamed to UI drawer and log file. Killable. |
  ```
  Add a fourth row:
  ```markdown
  | Cheatsheet | `"cheatsheet"` | `content` | Read-only reference card. No command runs. Content displayed in the output drawer. |
  ```

- [ ] **Step 2: Add `content` field to the config schema example**

  Find the end of the schema example block (the `foreground` entry) and add a cheatsheet example:
  ```json
  {
    "id": "jkl012",
    "label": "Git Workflows",
    "note": "Day-to-day git commands",
    "type": "cheatsheet",
    "tags": ["Dev"],
    "content": "git add -p\ngit commit -m '...'\ngit push"
  }
  ```

- [ ] **Step 3: Remove item #7 from Known Gaps**

  Find and delete the item:
  ```markdown
  7. **Card tags as collapsible sections** — currently tags just filter; could render as labeled collapsible sections on the board.
  ```
  Renumber items #8–#10 to #7–#9 accordingly.

- [ ] **Step 4: Commit**

  ```bash
  git add CLAUDE.md
  git commit -m "docs: update CLAUDE.md with cheatsheet type, remove stale known gap"
  ```
