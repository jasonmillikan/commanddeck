# Code Organization Refactor — Design Spec
**Date:** 2026-05-20
**Scope:** `src/main.js` + `src/renderer/app.js`
**Goal:** Split two large monolithic files into focused modules without rewriting logic. No build step introduced.

---

## Background

Two files have grown beyond comfortable reading size:

| File | Lines | Problem |
|---|---|---|
| `src/renderer/app.js` | 865 | All renderer logic in one file |
| `src/main.js` | 548 | Window, tray, process management, PTY, and all IPC handlers in one file |

`state.js`, `prefs.js`, and `tray-icon.js` already exist as extracted modules — this refactor extends that pattern to the remaining two files.

---

## Approach

**Approach C — ES modules in the renderer, CommonJS in the main process, state held at the entry point.**

`app.js` and `main.js` remain the entry points and own shared state. Extracted modules own only the state *they* manage internally. Cross-module effects flow through callbacks injected at boot (dependency injection), not through circular imports.

This approach was chosen over:
- **Multiple `<script>` tags** (globals, legacy pattern)
- **Shared state object** (requires touching every state access site)

---

## Renderer: `src/renderer/app.js` → ES modules

### Module system change

`index.html` changes one line:
```html
<!-- before -->
<script src="app.js"></script>
<!-- after -->
<script type="module" src="app.js"></script>
```

### New file map

```
src/renderer/
├── app.js           ~250 lines  ← state, boot, card events, command execution, search, IPC events
├── utils.js         ~50 lines   ← expand existing: uid, formatTime, escHtml, keyEventToAccelerator, badgeFor
├── cards.js         ~200 lines  ← renderCard, renderCards, renderStats, renderAll, filteredCommands
├── modal.js         ~200 lines  ← openModal, closeModal, updateModalFields, tag chip event listeners
├── drawer.js        ~80 lines   ← openDrawer, close/run-all button listeners
├── terminal.js      ~60 lines   ← initTerminal, switchToTerminal
└── prefs-modal.js   ~80 lines   ← openPrefsModal, closePrefsModal, hotkey recording
```

### State ownership

Each module owns only the state that no other module touches directly:

| Module | Owns |
|---|---|
| `app.js` | `config`, `liveMap`, `outputMap`, `prefs`, `activeGroup`, `searchQuery`; also owns `renderGroups()` (reads both `config` and `activeGroup`) |
| `cards.js` | `sortableInstance` |
| `modal.js` | `editingId`, `modalTags` |
| `drawer.js` | `drawerCommandId`, `drawerLogFile` |
| `terminal.js` | `terminalMap`, `activeTerminalId` |
| `prefs-modal.js` | hotkey recording vars |

### Dependency graph

```
app.js
  ├── cards.js       → utils.js
  ├── modal.js       → utils.js
  ├── drawer.js      → terminal.js, utils.js
  ├── terminal.js    (no local imports)
  ├── prefs-modal.js (no local imports)
  └── utils.js       (no local imports)
```

No circular imports. `app.js` is the only consumer of all other modules.

### Dependency injection pattern

Extracted modules that need to trigger app-level effects (persist, renderAll) receive callbacks once at boot:

```js
// app.js boot sequence
import { initModal } from './modal.js';
import { initDrawer } from './drawer.js';

initModal({ onSave: handleModalSave, onDelete: handleModalDelete });
initDrawer({ getConfig: () => config, getOutputMap: () => outputMap, getLiveMap: () => liveMap });
```

State needed per-call is passed as function arguments, not imported:

```js
// cards.js
export function renderCards(config, activeGroup, searchQuery, liveMap, onDragEnd) { ... }
```

### What lines actually change

- `index.html`: 1 line (script tag attribute)
- ~25 `export` keywords added to function declarations
- ~5–6 `import` lines at the top of each new file
- ~8 function signatures gain parameters for state they previously closed over
- `test/utils.test.js`: `require('../src/renderer/utils.js')` becomes `await import(...)` — Node.js supports dynamic ES module import from a CommonJS test file. Each test that needs the helpers wraps the import in a `before()` hook or uses top-level await with an `.mjs` extension.

Function bodies are moved verbatim. The section comment markers already in `app.js` define the cut points.

---

## Main process: `src/main.js` → CommonJS modules

### New file map

```
src/
├── main.js              ~100 lines  ← app lifecycle, boot sequence, wiring only
├── config-io.js         ~35 lines   ← loadConfig, saveConfig, ensureConfigDir, detectTerminalApp,
│                                       autostartDesktopContent; all path constants (CONFIG_PATH etc.)
├── window.js            ~90 lines   ← createWindow, createTray, toggleWindow, updateTrayIcon;
│                                       owns mainWindow, tray; exports getMainWindow()
├── process-manager.js   ~150 lines  ← spawnCommand, runOneShot, logLine, notifyProcessExit,
│                                       killAllProcesses, restoreToggleState, saveCurrentState;
│                                       owns liveProcesses, killedByUser, alertState,
│                                       activeTogglesMeta, lastSessionToggles
├── pty-manager.js       ~50 lines   ← ptyCreate, ptyWrite, ptyResize, killAllPty;
│                                       owns ptyProcesses
└── ipc-handlers.js      ~150 lines  ← register(ipcMain, ctx) wrapping all ipcMain.handle() calls
```

`state.js` and `prefs.js` are unchanged.

### Dependency injection pattern

Each module receives its cross-module dependencies via an `init()` call at boot, not through `require()` chains:

```js
// main.js (simplified)
const win     = require('./window');
const procMgr = require('./process-manager');
const ptyMgr  = require('./pty-manager');
const ipc     = require('./ipc-handlers');

app.whenReady(async () => {
  ensureConfigDir();
  win.create(preloadPath, rendererPath);
  procMgr.init({ getMainWindow: win.getMainWindow, updateTrayIcon: win.updateTrayIcon });
  ipc.register(ipcMain, { procMgr, ptyMgr, win, dialog, shell });
  procMgr.restoreToggleState();
});
```

### Module responsibilities

**`config-io.js`** — pure file I/O. No state, no Electron imports beyond `path`/`fs`/`os`. Path constants move here so every module can import them without reaching into `main.js`.

**`window.js`** — owns `mainWindow` and `tray`. Exports `getMainWindow()` so callers always get the live reference. `updateTrayIcon({ running, alertState })` receives counts as a parameter rather than reading globals — the one meaningful signature change in this half.

**`process-manager.js`** — owns all runtime process tracking state. `activeTogglesMeta` and `lastSessionToggles` live here (they are toggle lifecycle tracking, which is process management concern). Exports `getLiveProcesses()` for the IPC handler to query.

**`pty-manager.js`** — self-contained today; formalised with explicit exports and `killAllPty()` called from `will-quit`.

**`ipc-handlers.js`** — pure wiring layer. All 25 `ipcMain.handle()` registrations wrapped in `register(ipcMain, ctx)`. No business logic lives here.

### What lines actually change

- Each new file gets `module.exports = { ... }` at the bottom
- `main.js` gains ~6 `require()` lines and loses ~450 lines
- `ipc-handlers.js`: all handlers gain one level of indentation (inside `register()`) — mechanical only
- `window.js`: `updateTrayIcon` signature changes from `()` to `({ running, alertState })` — two call sites updated
- `process-manager.js`: receives `prefs` via `init()` instead of closing over a module-level var

---

## Testability improvements

Dependency injection is the key enabler. The payoff is split:

### Main process — significant improvement

Modules can be tested without Electron running by injecting mocks:

```js
// test/process-manager.test.js
const procMgr = require('../src/process-manager');
procMgr.init({
  getMainWindow: () => ({ webContents: { send: () => {} } }),
  updateTrayIcon: () => {},
});
// spawnCommand, logLine, notifyProcessExit etc. are now testable
```

Candidates for new test coverage:
- `config-io.js` — `loadConfig`, `saveConfig`, `ensureConfigDir` (using temp dirs)
- `process-manager.js` — `logLine`, `notifyProcessExit`, `saveCurrentState`, `restoreToggleState`
- `pty-manager.js` — `ptyCreate`, `ptyWrite`, `ptyResize`
- `ipc-handlers.js` — individual handlers via `register(mockIpcMain, mockCtx)`

### Renderer — limited improvement

Modules with DOM dependencies (`cards.js`, `modal.js`, `drawer.js`) remain untestable in pure Node.js without a headless browser. However, the expanded `utils.js` (uid, formatTime, escHtml, badgeFor, keyEventToAccelerator) provides immediately testable pure functions.

### Recommendation

Writing tests is a natural follow-on to this refactor, not part of it. Once the modules exist with clean interfaces, test files can be added incrementally. The existing `test/` directory and `node --test` runner are already in place.

---

## What is explicitly out of scope

- No logic rewritten — function bodies move verbatim
- No new features
- No CSS or HTML restructuring beyond the one `<script>` attribute change
- No bundler or build step introduced
- Tests are a follow-on, not part of this refactor

---

## File size summary (estimated post-refactor)

| File | Before | After |
|---|---|---|
| `src/renderer/app.js` | 865 lines | ~250 lines |
| `src/main.js` | 548 lines | ~100 lines |
| New renderer modules (6 files) | — | ~670 lines total |
| New main process modules (4 files) | — | ~425 lines total |
| `src/renderer/utils.js` | 30 lines | ~50 lines |
