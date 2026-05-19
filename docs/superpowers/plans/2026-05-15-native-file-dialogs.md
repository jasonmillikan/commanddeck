# Native File Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `prompt()` / `alert()` import/export with native Electron file picker dialogs so the UX matches a real desktop app in both dev and packaged builds.

**Architecture:** The renderer buttons fire zero-argument IPC calls. All file I/O, dialog presentation, and confirmation logic moves into the Electron main process using `dialog.showSaveDialog`, `dialog.showOpenDialog`, and `dialog.showMessageBox`. The renderer only receives a structured `{ ok, data?, cancelled? }` result.

**Tech Stack:** Electron `dialog` API (built-in, no new dependencies), Node.js `fs`, `path`, `os` (already imported in `main.js`)

---

## File Map

| File | Change |
|---|---|
| `src/main.js` | Add `dialog` to require; replace `export-config` and `import-config` IPC handlers |
| `src/preload.js` | Remove `filePath` argument from `exportConfig` and `importConfig` |
| `src/renderer/app.js` | Simplify `btn-export` and `btn-import` click handlers — remove `prompt()`, path hacks, `alert()` |
| `CLAUDE.md` | Mark Known Gap #1 as done |

> **Note on testing:** Electron's `dialog` API requires a running Electron instance and cannot be unit tested without a complex mock harness that doesn't exist in this project. Each task ends with a manual verification step using `npm start`.

---

### Task 1: Update `main.js` — add `dialog` and replace both IPC handlers

**Files:**
- Modify: `src/main.js:1` (require line)
- Modify: `src/main.js:279-297` (export-config and import-config handlers)

- [ ] **Step 1: Add `dialog` to the require at the top of `src/main.js`**

Current line 1:
```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
```

Replace with:
```js
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
```

- [ ] **Step 2: Replace the `export-config` IPC handler (lines 279–287)**

Remove:
```js
ipcMain.handle('export-config', (_, { filePath }) => {
  try {
    const data = loadConfig();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
```

Replace with:
```js
ipcMain.handle('export-config', async () => {
  const ts = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(os.homedir(), `commanddeck-backup-${ts}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, cancelled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify(loadConfig(), null, 2));
    return { ok: true };
  } catch (e) {
    dialog.showErrorBox('Export failed', e.message);
    return { ok: false, error: e.message };
  }
});
```

- [ ] **Step 3: Replace the `import-config` IPC handler (lines 289–297)**

Remove:
```js
ipcMain.handle('import-config', (_, { filePath }) => {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    saveConfig(data);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
```

Replace with:
```js
ipcMain.handle('import-config', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, cancelled: true };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  } catch (e) {
    dialog.showErrorBox('Import failed', `Could not read file: ${e.message}`);
    return { ok: false, error: e.message };
  }
  const current = loadConfig();
  const count = (current.commands || []).length;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Continue', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `This will replace your ${count} current command${count === 1 ? '' : 's'}.`,
    detail: 'This cannot be undone.',
  });
  if (response !== 0) return { ok: false, cancelled: true };
  saveConfig(data);
  return { ok: true, data };
});
```

- [ ] **Step 4: Verify the app still starts**

```bash
npm start
```

Expected: app launches, no console errors. Close it.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat: replace export/import IPC handlers with native Electron dialogs"
```

---

### Task 2: Update `preload.js` and `app.js` — remove path arguments and dead code

**Files:**
- Modify: `src/preload.js:22-23`
- Modify: `src/renderer/app.js:392-411`

- [ ] **Step 1: Update `exportConfig` and `importConfig` in `src/preload.js`**

Current lines 22–23:
```js
  exportConfig: (filePath) => ipcRenderer.invoke('export-config', { filePath }),
  importConfig: (filePath) => ipcRenderer.invoke('import-config', { filePath }),
```

Replace with:
```js
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
```

- [ ] **Step 2: Replace the `btn-export` click handler in `src/renderer/app.js`**

Current (lines 392–402):
```js
document.getElementById('btn-export').addEventListener('click', async () => {
  const ts = new Date().toISOString().slice(0,10);
  const filePath = `${window.require ? '' : '/tmp/'}commanddeck-export-${ts}.json`;
  // Simple: prompt for path via a quick hack (full dialog needs dialog API — future work)
  const path = prompt('Export to file path:', `~/commanddeck-export-${ts}.json`);
  if (!path) return;
  const expanded = path.replace('~', window.homeDir || '/tmp');
  const result = await window.api.exportConfig(expanded);
  if (result.ok) alert(`Exported to ${expanded}`);
  else alert('Export failed: ' + result.error);
});
```

Replace with:
```js
document.getElementById('btn-export').addEventListener('click', async () => {
  await window.api.exportConfig();
});
```

- [ ] **Step 3: Replace the `btn-import` click handler in `src/renderer/app.js`**

Current (lines 404–411):
```js
document.getElementById('btn-import').addEventListener('click', async () => {
  const path = prompt('Import from file path:');
  if (!path) return;
  const expanded = path.replace('~', '/home/' + (window.username || 'user'));
  const result = await window.api.importConfig(expanded);
  if (result.ok) { config = result.data; renderAll(); }
  else alert('Import failed: ' + result.error);
});
```

Replace with:
```js
document.getElementById('btn-import').addEventListener('click', async () => {
  const result = await window.api.importConfig();
  if (result.ok) { config = result.data; renderAll(); }
});
```

- [ ] **Step 4: Manually verify export**

```bash
npm start
```

1. Click the **Export** button in the titlebar
2. Expected: native GTK "Save As" dialog opens with default filename `commanddeck-backup-YYYY-MM-DD.json`
3. Pick a location and save
4. Expected: dialog closes, no `alert()`, file exists at the chosen path with valid JSON

- [ ] **Step 5: Manually verify import — cancel flows**

1. Click the **Import** button
2. Expected: native GTK "Open File" dialog opens filtered to `.json`
3. Press **Cancel**
4. Expected: nothing happens, config unchanged
5. Pick a valid `.json` file, then press **Cancel** on the confirmation dialog
6. Expected: nothing happens, config unchanged

- [ ] **Step 6: Manually verify import — success flow**

1. Use the file you exported in Step 4
2. Click **Import**, select that file, click **Continue** on the confirmation
3. Expected: card board re-renders with the imported commands

- [ ] **Step 7: Manually verify import — error flow**

1. Create a file `test-bad.json` containing `{ "not": "valid commands" }` (no `commands` array — the app will load this without error but show an empty board, which is expected per spec)
2. Create a file `test-corrupt.txt` containing `this is not json`
3. Import `test-corrupt.txt`
4. Expected: native error dialog: "Import failed — Could not read file: ..."

- [ ] **Step 8: Commit**

```bash
git add src/preload.js src/renderer/app.js
git commit -m "feat: simplify renderer import/export handlers to use zero-arg API"
```

---

### Task 3: Update CLAUDE.md to mark Known Gap #1 as done

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find and update Known Gap #1**

In `CLAUDE.md`, locate the Known Gaps section. Replace:

```markdown
1. **Native file dialog** — import/export currently uses `prompt()` for file paths. Should use `dialog.showOpenDialog` / `dialog.showSaveDialog` from Electron's main process via a new IPC handler.
```

With:

```markdown
1. ~~**Native file dialog**~~ — **Done.** Export uses `dialog.showSaveDialog` with a suggested default filename; import uses `dialog.showOpenDialog` + a `dialog.showMessageBox` confirmation. All file I/O and dialogs live in the main process. No `prompt()` or `alert()` calls remain in the renderer.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark native file dialog gap as done in CLAUDE.md"
```
