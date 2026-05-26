# Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package CommandDeck for Linux (AppImage + .deb) and Windows (NSIS installer) with automated GitHub Actions CI, in-app update notifications, and first-class Windows platform compatibility.

**Architecture:** A new `platform.js` module centralizes all OS-varying behavior (process kill, shell spawn, autostart, terminal detection). electron-builder handles packaging from a single config in `package.json`. GitHub Actions triggers on version tags, runs parallel Linux (ubuntu:20.04 container for glibc 2.31 compat) and Windows jobs, and publishes to GitHub Releases. `electron-updater` checks for new releases 10 seconds after launch.

**Tech Stack:** electron-builder ^25, electron-updater ^6, GitHub Actions, ImageMagick (icon generation, dev-only)

---

## File Structure

**New files:**
- `src/main/platform.js` — killProcessTree, spawnShell, getAutostart, setAutostart, detectTerminalApp
- `test/platform.test.js` — tests for platform.js
- `scripts/export-icon.js` — one-off dev script to write assets/icons/512x512.png
- `assets/icons/512x512.png` — static app icon (generated, committed)
- `assets/icons/icon.ico` — Windows multi-size icon (generated, committed)
- `.github/workflows/release.yml` — CI/CD release workflow

**Modified files:**
- `src/main/tray-icon.js` — export `buildRawIconPng(size)` (pure Node, no Electron dep)
- `src/main/process-manager.js` — use platform.killProcessTree + platform.spawnShell
- `src/main/ipc-handlers.js` — use platform.getAutostart, platform.setAutostart, platform.detectTerminalApp
- `src/main/config-io.js` — remove detectTerminalApp (moved to platform.js)
- `src/main/main.js` — add electron-updater check
- `package.json` — add "build" config, dist scripts, electron-builder dev dep, electron-updater dep
- `README.md` — add "Releasing a new version" section + Windows SmartScreen note

---

## Task 1: Create `src/main/platform.js` with tests

**Files:**
- Create: `src/main/platform.js`
- Create: `test/platform.test.js`

- [ ] **Step 1.1: Write the failing test**

Create `test/platform.test.js`:

```js
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const platform = require('../src/main/platform');

test('detectTerminalApp: finds kitty when it is the only binary in PATH', () => {
  const origPath = process.env.PATH;
  const origTerm = process.env.TERMINAL;
  delete process.env.TERMINAL;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-plat-'));
  fs.writeFileSync(path.join(tmpDir, 'kitty'), '', { mode: 0o755 });
  process.env.PATH = tmpDir;
  const result = platform.detectTerminalApp();
  process.env.PATH = origPath;
  if (origTerm !== undefined) process.env.TERMINAL = origTerm;
  fs.rmSync(tmpDir, { recursive: true });
  assert.equal(result, 'kitty');
});

test('detectTerminalApp: returns null when nothing found', () => {
  const origPath = process.env.PATH;
  const origTerm = process.env.TERMINAL;
  delete process.env.TERMINAL;
  process.env.PATH = '/tmp/nonexistent-cd-test-dir';
  const result = platform.detectTerminalApp();
  process.env.PATH = origPath;
  if (origTerm !== undefined) process.env.TERMINAL = origTerm;
  assert.equal(result, null);
});

test('getAutostart: returns false when file does not exist', () => {
  const p = path.join(os.tmpdir(), `cd-noauto-${Date.now()}.desktop`);
  assert.equal(platform.getAutostart(p), false);
});

test('getAutostart: returns true when file exists', () => {
  const p = path.join(os.tmpdir(), `cd-auto-${Date.now()}.desktop`);
  fs.writeFileSync(p, '[Desktop Entry]\n');
  const result = platform.getAutostart(p);
  fs.unlinkSync(p);
  assert.equal(result, true);
});

test('setAutostart(true): creates desktop file at given path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-autodir-'));
  const p = path.join(tmpDir, 'subdir', 'commanddeck.desktop');
  platform.setAutostart(true, p, '[Desktop Entry]\nName=CommandDeck\n');
  assert.ok(fs.existsSync(p));
  fs.rmSync(tmpDir, { recursive: true });
});

test('setAutostart(false): removes desktop file if it exists', () => {
  const p = path.join(os.tmpdir(), `cd-rm-auto-${Date.now()}.desktop`);
  fs.writeFileSync(p, '[Desktop Entry]\n');
  platform.setAutostart(false, p, '');
  assert.equal(fs.existsSync(p), false);
});

test('setAutostart(false): does nothing when file does not exist', () => {
  const p = path.join(os.tmpdir(), `cd-noexist-${Date.now()}.desktop`);
  assert.doesNotThrow(() => platform.setAutostart(false, p, ''));
});

test('killProcessTree: terminates a running process', async () => {
  const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 100));
  platform.killProcessTree(child.pid);
  await new Promise(r => setTimeout(r, 200));
  let alive = true;
  try { process.kill(child.pid, 0); } catch { alive = false; }
  assert.equal(alive, false);
});

test('spawnShell: runs a command and exits with code 0', async () => {
  const child = platform.spawnShell('echo hello', { stdio: 'pipe' });
  const code = await new Promise(r => child.on('exit', r));
  assert.equal(code, 0);
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
node --test test/platform.test.js
```

Expected: `Error: Cannot find module '../src/main/platform'`

- [ ] **Step 1.3: Create `src/main/platform.js`**

```js
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, () => {});
  } else {
    process.kill(-pid, 'SIGTERM');
  }
}

function spawnShell(cmdString, options = {}) {
  if (process.platform === 'win32') {
    return spawn('cmd', ['/c', cmdString], options);
  }
  return spawn('bash', ['-c', cmdString], options);
}

function getAutostart(autostartPath) {
  if (process.platform === 'win32') {
    const { app } = require('electron');
    return app.getLoginItemSettings().openAtLogin;
  }
  return fs.existsSync(autostartPath);
}

function setAutostart(enabled, autostartPath, desktopContent) {
  if (process.platform === 'win32') {
    const { app } = require('electron');
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  if (enabled) {
    fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
    fs.writeFileSync(autostartPath, desktopContent);
  } else if (fs.existsSync(autostartPath)) {
    fs.unlinkSync(autostartPath);
  }
}

function detectTerminalApp() {
  if (process.platform === 'win32') {
    const dirs = (process.env.PATH || '').split(path.delimiter);
    if (dirs.some(d => fs.existsSync(path.join(d, 'wt.exe')))) return 'wt';
    return 'cmd';
  }
  const dirs = (process.env.PATH || '').split(':');
  const candidates = process.env.TERMINAL
    ? [process.env.TERMINAL, 'kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole']
    : ['kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole'];
  for (const t of candidates) {
    if (dirs.some(d => fs.existsSync(path.join(d, t)))) return t;
  }
  return null;
}

module.exports = { killProcessTree, spawnShell, getAutostart, setAutostart, detectTerminalApp };
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
node --test test/platform.test.js
```

Expected: all 9 tests pass

- [ ] **Step 1.5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 1.6: Commit**

```bash
git add src/main/platform.js test/platform.test.js
git commit -m "feat: add platform.js for cross-platform kill, autostart, terminal, spawn"
```

---

## Task 2: Update `process-manager.js` to use platform functions

**Files:**
- Modify: `src/main/process-manager.js`

- [ ] **Step 2.1: Replace the require line at the top**

In `src/main/process-manager.js`, change:
```js
const { spawn, exec } = require('child_process');
```
to:
```js
const { exec } = require('child_process');
const platform = require('./platform');
```

- [ ] **Step 2.2: Update `spawnCommand` to use `platform.spawnShell`**

In `spawnCommand`, change:
```js
const child = spawn('bash', ['-c', cmdString], {
  detached: true,
  stdio: type === 'launcher' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
});
```
to:
```js
const child = platform.spawnShell(cmdString, {
  detached: true,
  stdio: type === 'launcher' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
});
```

- [ ] **Step 2.3: Update `killProcess` to use `platform.killProcessTree`**

Change:
```js
function killProcess(pid) {
  killedByUser.add(pid);
  process.kill(-pid, 'SIGTERM');
  liveProcesses.delete(pid);
}
```
to:
```js
function killProcess(pid) {
  killedByUser.add(pid);
  platform.killProcessTree(pid);
  liveProcesses.delete(pid);
}
```

- [ ] **Step 2.4: Update `killAllProcesses` to use `platform.killProcessTree`**

Change:
```js
function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    if (entry.type === 'launcher') continue;
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
  liveProcesses.clear();
}
```
to:
```js
function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    if (entry.type === 'launcher') continue;
    try { platform.killProcessTree(pid); } catch {}
  }
  liveProcesses.clear();
}
```

- [ ] **Step 2.5: Run tests**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 2.6: Commit**

```bash
git add src/main/process-manager.js
git commit -m "refactor: use platform.killProcessTree and platform.spawnShell in process-manager"
```

---

## Task 3: Update `ipc-handlers.js` and remove `detectTerminalApp` from `config-io.js`

**Files:**
- Modify: `src/main/ipc-handlers.js`
- Modify: `src/main/config-io.js`

- [ ] **Step 3.1: Add platform require to `ipc-handlers.js`**

At the top of `src/main/ipc-handlers.js`, after the existing requires, add:
```js
const platform = require('./platform');
```

- [ ] **Step 3.2: Remove `detectTerminalApp` from the cfgIo destructure**

In `ipc-handlers.js`, inside the `register` function, change:
```js
const { CONFIG_PATH, LOG_DIR, AUTOSTART_PATH, loadConfig, saveConfig, autostartDesktopContent, detectTerminalApp } = cfgIo;
```
to:
```js
const { CONFIG_PATH, LOG_DIR, AUTOSTART_PATH, loadConfig, saveConfig, autostartDesktopContent } = cfgIo;
```

- [ ] **Step 3.3: Replace `get-autostart` handler**

Change:
```js
ipcMain.handle('get-autostart', () => fs.existsSync(AUTOSTART_PATH));
```
to:
```js
ipcMain.handle('get-autostart', () => platform.getAutostart(AUTOSTART_PATH));
```

- [ ] **Step 3.4: Replace `set-autostart` handler**

Change:
```js
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
```
to:
```js
ipcMain.handle('set-autostart', (_, enabled) => {
  const { app } = require('electron');
  platform.setAutostart(enabled, AUTOSTART_PATH, autostartDesktopContent(app));
  return { ok: true };
});
```

- [ ] **Step 3.5: Replace `detectTerminalApp()` call in `open-in-terminal` handler**

In `ipc-handlers.js`, find the `open-in-terminal` handler. Change the last Linux branch from:
```js
const terminal = detectTerminalApp();
```
to:
```js
const terminal = platform.detectTerminalApp();
```

- [ ] **Step 3.6: Remove `detectTerminalApp` from `config-io.js`**

In `src/main/config-io.js`, delete the entire `detectTerminalApp` function:
```js
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
```

And remove `detectTerminalApp` from the `module.exports`:
```js
// Change:
module.exports = {
  CONFIG_PATH, LOG_DIR, STATE_PATH, PREFS_PATH, AUTOSTART_PATH,
  loadConfig, saveConfig, ensureConfigDir, detectTerminalApp, autostartDesktopContent,
};
// To:
module.exports = {
  CONFIG_PATH, LOG_DIR, STATE_PATH, PREFS_PATH, AUTOSTART_PATH,
  loadConfig, saveConfig, ensureConfigDir, autostartDesktopContent,
};
```

- [ ] **Step 3.7: Run tests**

```bash
npm test
```

Expected: all tests pass (config-io tests do not test detectTerminalApp, so no failures expected)

- [ ] **Step 3.8: Commit**

```bash
git add src/main/ipc-handlers.js src/main/config-io.js
git commit -m "refactor: move autostart and terminal detection to platform.js"
```

---

## Task 4: Export `buildRawIconPng` from `tray-icon.js` and create icon generation script

**Files:**
- Modify: `src/main/tray-icon.js`
- Create: `scripts/export-icon.js`

- [ ] **Step 4.1: Add `buildRawIconPng` to `tray-icon.js`**

In `src/main/tray-icon.js`, add this function before `module.exports`:

```js
function buildRawIconPng(size) {
  const rgba = buildIconRgba(2, null, 'linux', size);
  return _rgbaToPng(size, size, rgba);
}
```

And add `buildRawIconPng` to `module.exports`:
```js
module.exports = { buildTrayIconSvg, buildTrayIcon, buildAppIcon, buildRawIconPng };
```

- [ ] **Step 4.2: Verify `buildRawIconPng` works in plain Node (no Electron)**

```bash
node -e "const { buildRawIconPng } = require('./src/main/tray-icon'); const buf = buildRawIconPng(64); console.log('PNG size:', buf.length, 'bytes'); console.log('PNG header:', buf.slice(0,4));"
```

Expected output: `PNG size: <some number> bytes` and `PNG header: <Buffer 89 50 4e 47>` (the PNG magic bytes)

- [ ] **Step 4.3: Create `scripts/export-icon.js`**

First create the directory:
```bash
mkdir -p scripts
```

Create `scripts/export-icon.js`:

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildRawIconPng } = require('../src/main/tray-icon');

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const pngPath = path.join(outDir, '512x512.png');
fs.writeFileSync(pngPath, buildRawIconPng(512));
console.log(`✓ Written: ${pngPath}`);
console.log('');
console.log('Next step — generate the Windows ICO:');
console.log('  convert assets/icons/512x512.png -define icon:auto-resize=256,128,64,48,32,16 assets/icons/icon.ico');
```

- [ ] **Step 4.4: Add `icon` script to `package.json`**

In `package.json`, add to the `"scripts"` section:
```json
"icon": "node scripts/export-icon.js"
```

- [ ] **Step 4.5: Commit**

```bash
git add src/main/tray-icon.js scripts/export-icon.js package.json
git commit -m "feat: export buildRawIconPng from tray-icon, add icon generation script"
```

---

## Task 5: Generate and commit icon assets

**Files:**
- Create: `assets/icons/512x512.png`
- Create: `assets/icons/icon.ico`

- [ ] **Step 5.1: Run the icon generation script**

```bash
npm run icon
```

Expected: `✓ Written: /path/to/assets/icons/512x512.png`

- [ ] **Step 5.2: Verify the PNG looks correct**

```bash
file assets/icons/512x512.png
```

Expected: `assets/icons/512x512.png: PNG image data, 512 x 512, 8-bit/color RGBA, non-interlaced`

Open the file in an image viewer and confirm: dark background (#0c0e14), two filled green hexagons (top-left and bottom-right), two outlined green hexagons.

- [ ] **Step 5.3: Check ImageMagick is available**

```bash
convert --version
```

Expected: `Version: ImageMagick ...`. If not installed: `sudo apt-get install -y imagemagick`

- [ ] **Step 5.4: Generate the Windows ICO**

```bash
convert assets/icons/512x512.png -define icon:auto-resize=256,128,64,48,32,16 assets/icons/icon.ico
```

- [ ] **Step 5.5: Verify the ICO**

```bash
file assets/icons/icon.ico
```

Expected: `assets/icons/icon.ico: MS Windows icon resource - ...`

- [ ] **Step 5.6: Commit**

```bash
git add assets/icons/512x512.png assets/icons/icon.ico
git commit -m "feat: add app icons (512x512 PNG + multi-size ICO)"
```

---

## Task 6: Add electron-builder config to `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 6.1: Install electron-builder as a dev dependency**

```bash
npm install --save-dev electron-builder
```

- [ ] **Step 6.2: Add the `"build"` section to `package.json`**

Add after the existing `"scripts"` section in `package.json`:

```json
"build": {
  "appId": "io.github.jasonmillikan.commanddeck",
  "productName": "CommandDeck",
  "directories": {
    "output": "dist"
  },
  "files": [
    "src/**/*",
    "node_modules/**/*",
    "package.json",
    "patches/**/*"
  ],
  "linux": {
    "target": ["AppImage", "deb"],
    "category": "Utility",
    "icon": "assets/icons/512x512.png"
  },
  "win": {
    "target": "nsis",
    "icon": "assets/icons/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "publish": {
    "provider": "github",
    "owner": "jasonmillikan",
    "repo": "commanddeck"
  }
}
```

- [ ] **Step 6.3: Add dist scripts to `package.json`**

Add to the `"scripts"` section:
```json
"dist:linux": "electron-builder --linux",
"dist:win": "electron-builder --win"
```

- [ ] **Step 6.4: Add `dist` to `.gitignore`**

The `dist/` folder is build output, not source. Add it to `.gitignore`:
```
dist/
```

Current `.gitignore` content is `*node_modules`. Add `dist/` on a new line.

- [ ] **Step 6.5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: add electron-builder config for AppImage, deb, and NSIS targets"
```

---

## Task 7: Add `electron-updater` and wire into `main.js`

**Files:**
- Modify: `src/main/main.js`
- Modify: `package.json` (add dependency)

- [ ] **Step 7.1: Install electron-updater**

```bash
npm install electron-updater
```

- [ ] **Step 7.2: Add update check to `main.js`**

In `src/main/main.js`, add this block at the end of the `app.whenReady()` callback, after `procMgr.restoreToggleState()`:

```js
  // Check for updates 10 seconds after launch (skip in dev — no packaged release to compare against)
  if (app.isPackaged) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(win.getMainWindow(), {
        type: 'info',
        title: 'Update Available',
        message: `CommandDeck ${info.version} is available`,
        detail: 'The update will download in the background.',
        buttons: ['OK'],
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox(win.getMainWindow(), {
        type: 'info',
        title: 'Update Ready',
        message: `CommandDeck ${info.version} is ready to install`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
    setTimeout(() => autoUpdater.checkForUpdates(), 10000);
  }
```

- [ ] **Step 7.3: Run the app to confirm it still starts**

```bash
npm start
```

Expected: app starts normally, no errors in console. The update check will not fire in dev mode (`app.isPackaged` is false).

- [ ] **Step 7.4: Commit**

```bash
git add src/main/main.js package.json package-lock.json
git commit -m "feat: add electron-updater — checks for new releases 10s after packaged launch"
```

---

## Task 8: Create GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 8.1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write  # required to create GitHub Releases and upload artifacts

jobs:
  build-linux:
    runs-on: ubuntu-latest
    container:
      image: ubuntu:20.04
    env:
      DEBIAN_FRONTEND: noninteractive
      APPIMAGE_EXTRACT_AND_RUN: '1'  # avoids FUSE requirement inside Docker
    steps:
      - name: Install git and curl
        run: apt-get update && apt-get install -y git curl

      - uses: actions/checkout@v4

      - name: Install build dependencies
        run: |
          apt-get install -y \
            build-essential \
            python3 \
            libsecret-1-dev \
            libudev-dev \
            fakeroot \
            dpkg

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Install dependencies
        run: npm ci

      - name: Build Linux packages
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --linux --publish always

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Install dependencies
        run: npm ci

      - name: Build Windows installer
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --win --publish always
```

- [ ] **Step 8.2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add GitHub Actions release workflow — parallel Linux + Windows builds on version tags"
```

---

## Task 9: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 9.1: Add a "Releasing a New Version" section**

Open `README.md` and add the following section. Place it after the "Development" section (or wherever it fits best in the existing structure):

```markdown
## Releasing a New Version

Releases are published automatically via GitHub Actions when a version tag is pushed.

**Two-command release workflow:**

```bash
npm version minor        # bumps package.json (e.g. 0.1.0 → 0.2.0) and creates git tag v0.2.0
git push && git push --tags   # pushes commit + tag, triggering the CI build
```

Use `npm version patch` for bug fixes, `npm version minor` for new features, `npm version major` for breaking changes.

GitHub Actions will build the Linux (AppImage + .deb) and Windows (installer) packages in parallel and publish them to the [GitHub Releases](https://github.com/jasonmillikan/commanddeck/releases) page automatically.

### Windows SmartScreen Warning

Windows will show a "Windows protected your PC" warning when running the installer, because CommandDeck is not yet code-signed. To proceed:

1. Click **More info**
2. Click **Run anyway**

This is safe — the installer is built directly from source by GitHub Actions. Code signing will be added in a future release.

### Auto-updates

The packaged app checks for new releases 10 seconds after launch. When an update is available, you'll see a dialog asking if you'd like to restart and install. The `.deb` package does not support auto-update — download the new `.deb` from the Releases page manually.
```

- [ ] **Step 9.2: Commit**

```bash
git add README.md
git commit -m "docs: add releasing workflow, Windows SmartScreen note, and auto-update info to README"
```

---

## Task 10: Smoke test the build locally

- [ ] **Step 10.1: Build Linux packages locally**

```bash
npm run dist:linux
```

Expected: `dist/` folder contains:
- `CommandDeck-<version>.AppImage`
- `commanddeck_<version>_amd64.deb`

If it fails, check the error output. Common issues:
- Missing icon files → verify `assets/icons/512x512.png` exists
- node-pty rebuild failure → run `npm run postinstall` manually first
- AppImage tool download failure → ensure internet access or set `APPIMAGE_EXTRACT_AND_RUN=1`

- [ ] **Step 10.2: Run the AppImage to verify it launches**

```bash
chmod +x dist/CommandDeck-*.AppImage
./dist/CommandDeck-*.AppImage
```

Expected: app window opens, system tray icon appears, no console errors

- [ ] **Step 10.3: Trigger a real CI release (dry run with a pre-release tag)**

```bash
npm version prerelease --preid=alpha   # creates v0.1.0-alpha.0 or similar
git push && git push --tags
```

Watch the GitHub Actions tab. Both `build-linux` and `build-windows` jobs should appear. Verify both complete successfully and the release draft appears on GitHub with all three artifacts.

- [ ] **Step 10.4: Delete the test release and tag after verifying**

On GitHub: go to Releases → delete the pre-release.

```bash
git tag -d v0.1.0-alpha.0
git push origin --delete v0.1.0-alpha.0
```

Then reset `package.json` version back:
```bash
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: reset version to 0.1.0 after CI smoke test"
```
