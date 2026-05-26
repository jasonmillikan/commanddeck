# Packaging Design — CommandDeck

**Date:** 2026-05-26
**Branch:** feature/packaging
**Status:** Approved

## Overview

Package CommandDeck for distribution as Linux (AppImage + .deb) and Windows (NSIS installer) using electron-builder, with automated GitHub Actions CI triggered by version tags and in-app update notifications via electron-updater.

macOS is deferred — no test hardware available. Windows is first-class: the app's plumbing will be made cross-platform, not just packaged.

---

## Section 1: Platform Compatibility (Windows)

A new module `src/main/platform.js` centralizes all OS-varying behavior. Callers replace direct OS calls with `require('./platform')` equivalents. No dependency injection — it's a plain module, not an injected adapter.

### Functions exported by `platform.js`

**`killProcessTree(pid)`**
- Linux: `process.kill(-pid, 'SIGTERM')` (negative PID targets process group)
- Windows: `exec('taskkill /PID <pid> /T /F')` (kills process tree)

**`setAutostart(enabled)`**
- Linux: writes/removes `~/.config/autostart/commanddeck.desktop` (existing logic, moved here)
- Windows: `app.setLoginItemSettings({ openAtLogin: enabled })` (Electron native API)

**`getAutostart()`**
- Linux: checks if `~/.config/autostart/commanddeck.desktop` exists (existing logic, moved here)
- Windows: `app.getLoginItemSettings().openAtLogin`

**`detectTerminalApp()`**
- Linux: scans PATH for kitty, alacritty, gnome-terminal, xfce4-terminal, konsole (existing logic, moved here)
- Windows: checks for `wt.exe` (Windows Terminal), falls back to `cmd.exe`

### Files changed
- `src/main/platform.js` — new file, ~60 lines
- `src/main/process-manager.js` — replace `process.kill(-pid, 'SIGTERM')` with `platform.killProcessTree(pid)`
- `src/main/ipc-handlers.js` — replace autostart `.desktop` logic with `platform.setAutostart()` / `platform.getAutostart()`
- `src/main/config-io.js` — replace `detectTerminalApp()` inline logic with `platform.detectTerminalApp()`

### Paths
`~/.commanddeck/` uses `os.homedir()` which returns the correct home directory on both Linux and Windows (`C:\Users\<user>`). Dot-folders are valid on Windows. No change needed.

---

## Section 2: App Icons

electron-builder requires static icon files — the runtime-generated tray icon is not sufficient.

**Required files:**
- `assets/icons/512x512.png` — used by Linux AppImage and .deb
- `assets/icons/icon.ico` — multi-size ICO used by Windows NSIS installer

**Approach:** The tray icon is generated programmatically in `src/main/tray-icon.js` — there is no standalone SVG file. A small one-off Node script (`scripts/export-icon.js`) will import the hexagon drawing logic, render it to a PNG buffer at 512×512 using `sharp` or `canvas`, and save it to `assets/icons/512x512.png`. The `.ico` is then generated from that PNG using ImageMagick (`convert`) at standard sizes (16, 32, 48, 64, 128, 256). The export script is a dev tool only and is not part of the build pipeline.

---

## Section 3: electron-builder Configuration

Added to `package.json` under `"build"`:

```json
"build": {
  "appId": "io.github.commanddeck",
  "productName": "CommandDeck",
  "directories": { "output": "dist" },
  "files": ["src/**/*", "node_modules/**/*", "package.json", "patches/**/*"],
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
    "owner": "YOUR_GITHUB_USERNAME",    // ← fill in before first release
    "repo": "commanddeck"
  }
}
```

`patch-package` runs via the existing `postinstall` hook during `npm ci`, so the node-pty C++20 patch is applied before electron-builder builds anything.

**New npm scripts:**
- `"dist:linux"` — `electron-builder --linux`
- `"dist:win"` — `electron-builder --win`
- `"dist"` — `electron-builder --linux --win` (local only, requires both toolchains)

---

## Section 4: GitHub Actions Workflow

**File:** `.github/workflows/release.yml`

**Trigger:** Push of tags matching `v*` (e.g. `v0.2.0`)

**Jobs (run in parallel):**

### build-linux
- Runner: `ubuntu-latest`
- Container: `ubuntu:20.04` — builds against glibc 2.31, ensuring compatibility with Ubuntu 20, 22, 24, Debian 11+, Fedora 35+, and most modern Linux distributions. The container needs base packages installed first (`git`, `curl`, `build-essential`, `libsecret-1-dev`, `libudev-dev`) before `npm ci` runs.
- Steps: checkout → install base packages → setup Node 24 → `npm ci` → `npx electron-builder --linux` → upload artifacts to GitHub Release
- Outputs: `CommandDeck-<version>.AppImage`, `commanddeck_<version>_amd64.deb`

### build-windows
- Runner: `windows-latest`
- Steps: checkout → setup Node 24 → `npm ci` → `npx electron-builder --win` → upload artifacts to GitHub Release
- Outputs: `CommandDeck-Setup-<version>.exe`

**Auth:** Both jobs use the automatic `GITHUB_TOKEN` secret provided by GitHub Actions. No manual secret configuration required.

---

## Section 5: electron-updater

`electron-updater` added to `dependencies`. Wired into `main.js` — reads `publish` config from `package.json` automatically.

**Behavior:**
- Waits 10 seconds after launch before checking (avoids blocking startup)
- If a newer version exists on GitHub Releases, shows a native dialog: *"CommandDeck vX.X.X is available. Restart to install?"* with **Later** and **Restart** buttons
- Restart: downloads (if not already cached) and installs, then relaunches the app
- Works for AppImage (Linux) and NSIS (Windows)
- `.deb` is excluded from auto-update — `.deb` users must download the new `.deb` manually (documented in README)

Implementation is ~15 lines in `main.js`, nothing in the renderer.

---

## Section 6: README Updates

A "Releasing a new version" section is added to `README.md` covering the two-command release workflow:

```bash
npm version minor        # bumps package.json and creates git tag (e.g. v0.2.0)
git push && git push --tags   # pushes commit + tag, triggers CI build
```

Also documents:
- Where to find releases (GitHub Releases page)
- The SmartScreen warning on Windows and how to proceed (click "More info → Run anyway")
- That `.deb` users must manually download new versions (no auto-update)

---

## Deliverables Summary

| File | Change |
|---|---|
| `src/main/platform.js` | New — cross-platform kill, autostart, terminal detection |
| `src/main/process-manager.js` | Use `platform.killProcessTree()` |
| `src/main/ipc-handlers.js` | Use `platform.setAutostart()` / `platform.getAutostart()` |
| `src/main/config-io.js` | Use `platform.detectTerminalApp()` |
| `assets/icons/512x512.png` | New — app icon for Linux |
| `assets/icons/icon.ico` | New — app icon for Windows |
| `package.json` | Add `"build"` section + new dist scripts + `electron-updater` dep |
| `.github/workflows/release.yml` | New — parallel Linux + Windows CI |
| `README.md` | Add "Releasing a new version" section + Windows SmartScreen note |

---

## Out of Scope

- macOS packaging (no test hardware)
- Windows code signing (premature for v0.x open-source)
- Flatpak / Snap / apt repository (add after initial release if demand exists)
- Auto-update for `.deb` installs
