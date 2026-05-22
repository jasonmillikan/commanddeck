# Starter Pack + Help Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate a platform-specific set of starter commands on first run and add a `?` help button that opens a welcome modal explaining each card type, with context-aware Recreate buttons for any missing starters.

**Architecture:** `ensureConfigDir` (called at boot before any IPC) detects first run and writes the platform-appropriate starter JSON to disk, returning `{ firstRun: boolean }` that threads up through `main.js → ipc-handlers.js → renderer`. The help modal is a new ES module (`help-modal.js`) wired into `app.js` alongside the existing modal/drawer/prefs-modal pattern. Starter command data is embedded as a JS constant in `help-modal.js` (no file reads from renderer) for recreate functionality.

**Tech Stack:** Node.js built-in `node:test`, Electron IPC, Vanilla JS ES modules, plain CSS

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/main/validate-config.js` | Modify | Relax `VALID_ID` regex to allow hyphens |
| `test/validate-config.test.js` | **Create** | Tests for ID validator |
| `src/defaults/commands-linux.json` | **Create** | Linux starter commands (5) |
| `src/defaults/commands-mac.json` | **Create** | macOS starter commands (5) |
| `src/defaults/commands-windows.json` | **Create** | Windows starter commands (5) |
| `test/starter-defaults.test.js` | **Create** | Validate all three default files against the schema |
| `src/main/config-io.js` | Modify | `ensureConfigDir` writes platform default + returns `{ firstRun }` |
| `test/config-io.test.js` | Modify | Add firstRun return value tests |
| `src/main/main.js` | Modify | Capture `{ firstRun }` from `ensureConfigDir`, pass to `ipc.register` |
| `src/main/ipc-handlers.js` | Modify | Accept `firstRun`, return `{ commands, firstRun, platform }` from `load-config` handler |
| `src/renderer/index.html` | Modify | Add `#btn-help` to titlebar; add `#help-backdrop`/`#help-modal` markup |
| `src/renderer/style.css` | Modify | Add `.help-*` styles and `.help-type-badge` variants |
| `src/renderer/help-modal.js` | **Create** | `initHelpModal`, `openHelpModal`, `closeHelpModal`, section rendering, recreate logic |
| `src/renderer/app.js` | Modify | Import help modal; `let platform` state; set in `loadAll`; init + wire `#btn-help`; auto-open on `firstRun` |

---

## Task 1: Relax the ID validator

**Files:**
- Modify: `src/main/validate-config.js:1`
- Create: `test/validate-config.test.js`

The current `VALID_ID = /^[0-9a-z]{1,32}$/` rejects hyphens. Starter IDs like `starter-linux-wifi` contain hyphens. The relaxed regex allows hyphens anywhere after the first character.

- [ ] **Step 1: Write the failing tests**

Create `test/validate-config.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/main/validate-config');

function makeCmd(overrides) {
  return { id: 'abc123', label: 'Test', type: 'toggle', onCmd: 'echo on', offCmd: 'echo off', ...overrides };
}

test('validateConfig: accepts plain alphanumeric id', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'abc123' })] });
  assert.equal(result.ok, true);
});

test('validateConfig: accepts hyphenated id like starter-linux-wifi', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'starter-linux-wifi' })] });
  assert.equal(result.ok, true);
});

test('validateConfig: rejects id starting with hyphen', () => {
  const result = validateConfig({ commands: [makeCmd({ id: '-bad' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects id with uppercase', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'BadId' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects id longer than 32 chars', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'a'.repeat(33) })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects unknown type', () => {
  const result = validateConfig({ commands: [makeCmd({ type: 'unknown' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: accepts all four valid types', () => {
  for (const type of ['toggle', 'launcher', 'foreground', 'cheatsheet']) {
    const cmd = type === 'launcher'
      ? makeCmd({ type, launchCmd: 'echo hi', onCmd: undefined, offCmd: undefined })
      : type === 'cheatsheet'
        ? makeCmd({ type, content: 'ls', onCmd: undefined, offCmd: undefined })
        : makeCmd({ type });
    const result = validateConfig({ commands: [cmd] });
    assert.equal(result.ok, true, `type=${type} should be valid`);
  }
});
```

- [ ] **Step 2: Run to confirm the hyphen test fails**

```bash
cd /home/j/Sync/Projects/CommandDeck && node --test test/validate-config.test.js
```

Expected: `accepts hyphenated id like starter-linux-wifi` — FAIL. Others may pass or fail; only the hyphen test matters here.

- [ ] **Step 3: Relax the regex in `validate-config.js`**

In `src/main/validate-config.js`, change line 1:

```js
// Before:
const VALID_ID   = /^[0-9a-z]{1,32}$/;

// After:
const VALID_ID   = /^[0-9a-z][0-9a-z-]{0,31}$/;
```

- [ ] **Step 4: Run tests — all pass**

```bash
node --test test/validate-config.test.js
```

Expected: all 7 tests pass.

- [ ] **Step 5: Run full test suite — no regressions**

```bash
npm test
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/validate-config.js test/validate-config.test.js
git commit -m "feat: relax ID validator to allow hyphens for starter command IDs"
```

---

## Task 2: Create starter JSON files

**Files:**
- Create: `src/defaults/commands-linux.json`
- Create: `src/defaults/commands-mac.json`
- Create: `src/defaults/commands-windows.json`
- Create: `test/starter-defaults.test.js`

- [ ] **Step 1: Write the validation test first**

Create `test/starter-defaults.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateConfig } = require('../src/main/validate-config');

for (const platform of ['linux', 'mac', 'windows']) {
  test(`defaults/commands-${platform}.json: is valid JSON`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    assert.ok(fs.existsSync(p), `file does not exist: ${p}`);
    const raw = fs.readFileSync(p, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'must be valid JSON');
  });

  test(`defaults/commands-${platform}.json: passes validateConfig`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const result = validateConfig(data);
    assert.equal(result.ok, true, result.error);
  });

  test(`defaults/commands-${platform}.json: contains exactly 5 commands`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(data.commands.length, 5);
  });

  test(`defaults/commands-${platform}.json: has one of each type`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const types = data.commands.map(c => c.type);
    assert.ok(types.includes('toggle'), 'needs a toggle');
    assert.ok(types.includes('launcher'), 'needs a launcher');
    assert.ok(types.includes('foreground'), 'needs a foreground');
    assert.ok(types.includes('cheatsheet'), 'needs a cheatsheet');
  });
}
```

- [ ] **Step 2: Run to confirm all tests fail**

```bash
node --test test/starter-defaults.test.js
```

Expected: all 12 tests fail with "file does not exist".

- [ ] **Step 3: Create `src/defaults/commands-linux.json`**

```bash
mkdir -p /home/j/Sync/Projects/CommandDeck/src/defaults
```

Create `src/defaults/commands-linux.json`:

```json
{
  "commands": [
    {
      "id": "starter-linux-audio-loopback",
      "label": "Audio Loopback",
      "note": "Routes mic to speakers. Requires PulseAudio or PipeWire (standard on Ubuntu, Fedora, Arch).",
      "type": "toggle",
      "tags": ["Audio"],
      "onCmd": "pactl load-module module-loopback latency_msec=1",
      "offCmd": "pactl unload-module module-loopback"
    },
    {
      "id": "starter-linux-wifi",
      "label": "Wi-Fi",
      "note": "Requires NetworkManager (standard on most desktop distros).",
      "type": "toggle",
      "tags": ["Network"],
      "onCmd": "nmcli radio wifi on",
      "offCmd": "nmcli radio wifi off"
    },
    {
      "id": "starter-linux-home-folder",
      "label": "Open Home Folder",
      "note": "Opens your default file manager — works across GNOME, KDE, XFCE, and others.",
      "type": "launcher",
      "tags": ["Apps"],
      "launchCmd": "xdg-open ~"
    },
    {
      "id": "starter-linux-system-monitor",
      "label": "System Monitor",
      "note": "Install if needed: sudo apt install htop (or dnf/pacman equivalent).",
      "type": "foreground",
      "tags": ["System"],
      "onCmd": "htop"
    },
    {
      "id": "starter-linux-network-toolkit",
      "label": "Network Toolkit",
      "note": "Common network diagnostics. nmap requires separate installation.",
      "type": "cheatsheet",
      "tags": ["Network"],
      "content": "ip addr show\nip route\nss -tulnp\ncurl ifconfig.me\nnmap -sn 192.168.1.0/24"
    }
  ]
}
```

- [ ] **Step 4: Create `src/defaults/commands-mac.json`**

```json
{
  "commands": [
    {
      "id": "starter-mac-dark-mode",
      "label": "Dark Mode",
      "note": "Toggles system-wide dark/light appearance.",
      "type": "toggle",
      "tags": ["Appearance"],
      "onCmd": "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to true'",
      "offCmd": "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to false'"
    },
    {
      "id": "starter-mac-wifi",
      "label": "Wi-Fi",
      "note": "Turns the Wi-Fi radio on or off.",
      "type": "toggle",
      "tags": ["Network"],
      "onCmd": "networksetup -setairportpower en0 on",
      "offCmd": "networksetup -setairportpower en0 off"
    },
    {
      "id": "starter-mac-finder",
      "label": "Open Home Folder",
      "note": "Opens your home directory in Finder.",
      "type": "launcher",
      "tags": ["Apps"],
      "launchCmd": "open ~"
    },
    {
      "id": "starter-mac-keep-awake",
      "label": "Keep Awake",
      "note": "Prevents the display from sleeping while running. Kill to allow sleep again.",
      "type": "foreground",
      "tags": ["System"],
      "onCmd": "caffeinate -d"
    },
    {
      "id": "starter-mac-network-toolkit",
      "label": "Network Toolkit",
      "note": "Common network diagnostics for macOS.",
      "type": "cheatsheet",
      "tags": ["Network"],
      "content": "ifconfig\nnetstat -rn\ncurl ifconfig.me\nnetworksetup -listallnetworkservices\nscutil --dns"
    }
  ]
}
```

- [ ] **Step 5: Create `src/defaults/commands-windows.json`**

```json
{
  "commands": [
    {
      "id": "starter-win-dark-mode",
      "label": "Dark Mode",
      "note": "Toggles app dark/light theme via registry.",
      "type": "toggle",
      "tags": ["Appearance"],
      "onCmd": "reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 0 /f",
      "offCmd": "reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 1 /f"
    },
    {
      "id": "starter-win-wifi",
      "label": "Wi-Fi",
      "note": "Interface name may vary — run 'netsh interface show interface' to find yours.",
      "type": "toggle",
      "tags": ["Network"],
      "onCmd": "netsh interface set interface \"Wi-Fi\" enabled",
      "offCmd": "netsh interface set interface \"Wi-Fi\" disabled"
    },
    {
      "id": "starter-win-file-explorer",
      "label": "Open Home Folder",
      "note": "Opens your home directory in File Explorer.",
      "type": "launcher",
      "tags": ["Apps"],
      "launchCmd": "explorer.exe ."
    },
    {
      "id": "starter-win-ping-monitor",
      "label": "Ping Monitor",
      "note": "Continuous connectivity check — streams output to the in-app terminal.",
      "type": "foreground",
      "tags": ["Network"],
      "onCmd": "ping -t 8.8.8.8"
    },
    {
      "id": "starter-win-network-toolkit",
      "label": "Network Toolkit",
      "note": "Common network diagnostics for Windows.",
      "type": "cheatsheet",
      "tags": ["Network"],
      "content": "ipconfig /all\nnetstat -an\ntracert 8.8.8.8\nnslookup google.com\narp -a"
    }
  ]
}
```

- [ ] **Step 6: Run tests — all 12 pass**

```bash
node --test test/starter-defaults.test.js
```

Expected: all 12 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/defaults/ test/starter-defaults.test.js
git commit -m "feat: add platform starter command defaults (linux, mac, windows)"
```

---

## Task 3: First-run detection in ensureConfigDir

**Files:**
- Modify: `src/main/config-io.js`
- Modify: `test/config-io.test.js`

`ensureConfigDir` now writes the platform-appropriate starter JSON (instead of empty `{ commands: [] }`) when the config file doesn't exist, and returns `{ firstRun: boolean }`.

- [ ] **Step 1: Add firstRun tests to config-io.test.js**

Append to the end of `test/config-io.test.js`:

```js
test('ensureConfigDir: returns firstRun true when config file did not exist', () => {
  const base = path.join(os.tmpdir(), 'cd-fr-' + Date.now());
  const configPath = path.join(base, 'commands.json');
  const logDir = path.join(base, 'logs');
  const statePath = path.join(base, 'state.json');
  const prefsPath = path.join(base, 'prefs.json');
  const result = ensureConfigDir({ configPath, logDir, statePath, prefsPath });
  assert.equal(result.firstRun, true);
  assert.ok(fs.existsSync(configPath));
  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.ok(Array.isArray(data.commands), 'config should have commands array');
  fs.rmSync(base, { recursive: true });
});

test('ensureConfigDir: returns firstRun false when config file already exists', () => {
  const base = path.join(os.tmpdir(), 'cd-fr2-' + Date.now());
  const configPath = path.join(base, 'commands.json');
  const logDir = path.join(base, 'logs');
  const statePath = path.join(base, 'state.json');
  const prefsPath = path.join(base, 'prefs.json');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ commands: [] }, null, 2));
  const result = ensureConfigDir({ configPath, logDir, statePath, prefsPath });
  assert.equal(result.firstRun, false);
  fs.rmSync(base, { recursive: true });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
node --test test/config-io.test.js
```

Expected: the two new `firstRun` tests fail (`result.firstRun` is `undefined`).

- [ ] **Step 3: Update `ensureConfigDir` in `config-io.js`**

Replace the entire `ensureConfigDir` function (lines 23–36):

```js
function ensureConfigDir({ configPath = CONFIG_PATH, logDir = LOG_DIR, statePath = STATE_PATH, prefsPath = PREFS_PATH } = {}) {
  const { savePrefs, DEFAULTS } = require('./prefs');
  let firstRun = false;
  if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    const plat = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
    const defaultsPath = path.join(__dirname, '..', 'defaults', `commands-${plat}.json`);
    const content = fs.existsSync(defaultsPath)
      ? fs.readFileSync(defaultsPath, 'utf8')
      : JSON.stringify({ commands: [] }, null, 2);
    fs.writeFileSync(configPath, content);
    firstRun = true;
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ toggles: {} }, null, 2));
  }
  if (!fs.existsSync(prefsPath)) {
    savePrefs(prefsPath, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
  }
  return { firstRun };
}
```

- [ ] **Step 4: Run config-io tests — all pass**

```bash
node --test test/config-io.test.js
```

Expected: all tests pass including the two new firstRun tests.

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/config-io.js test/config-io.test.js
git commit -m "feat: ensureConfigDir writes platform starter on first run, returns firstRun flag"
```

---

## Task 4: Thread firstRun + platform through IPC

**Files:**
- Modify: `src/main/main.js:14`
- Modify: `src/main/ipc-handlers.js:7,11`

No unit tests for IPC wiring — verified manually in Task 7's smoke test.

- [ ] **Step 1: Capture firstRun in `main.js`**

In `src/main/main.js`, change line 14:

```js
// Before:
  cfgIo.ensureConfigDir();

// After:
  const { firstRun } = cfgIo.ensureConfigDir();
```

Change line 34:

```js
// Before:
  ipc.register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell });

// After:
  ipc.register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell, firstRun });
```

- [ ] **Step 2: Update `ipc-handlers.js` to consume firstRun**

In `src/main/ipc-handlers.js`, change the function signature (line 7) and the `load-config` handler (line 11):

```js
// Change the function signature — add firstRun = false to destructured params:
function register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell, firstRun = false }) {
  const { CONFIG_PATH, LOG_DIR, AUTOSTART_PATH, loadConfig, saveConfig, autostartDesktopContent, detectTerminalApp } = cfgIo;
  const { spawn } = require('child_process');
  let _firstRun = firstRun;

  ipcMain.handle('load-config', () => {
    const data = loadConfig();
    const fr = _firstRun;
    _firstRun = false;
    return { commands: data.commands || [], firstRun: fr, platform: process.platform };
  });
```

The rest of `ipc-handlers.js` is unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/main/main.js src/main/ipc-handlers.js
git commit -m "feat: thread firstRun + platform from ensureConfigDir through IPC to renderer"
```

---

## Task 5: Help modal HTML markup and CSS

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add `#btn-help` to the titlebar in `index.html`**

In `src/renderer/index.html`, find the titlebar controls block (around line 22–29). Add `#btn-help` immediately after `#btn-prefs`:

```html
      <button class="tb-btn" id="btn-prefs" title="Preferences">⚙</button>
      <button class="tb-btn" id="btn-help" title="Help &amp; Getting Started">?</button>
      <button class="tb-btn" id="btn-minimize" title="Minimize">−</button>
```

- [ ] **Step 2: Add `#help-backdrop` markup to `index.html`**

After the closing `</div>` of `#prefs-backdrop` (around line 175), add:

```html
  <!-- Modal: Help -->
  <div class="modal-backdrop" id="help-backdrop">
    <div id="help-modal">
      <div class="help-hero">
        <div class="help-hero-icon">⬡</div>
        <div class="help-hero-title">Welcome to CommandDeck, <span class="help-hero-user">user</span></div>
        <div class="help-hero-tagline">Your visual toggle board for terminal commands — power your daily workflow from the tray.</div>
      </div>
      <div class="help-body">
        <nav class="help-nav" id="help-nav"></nav>
        <div class="help-content" id="help-content"></div>
      </div>
      <div class="help-footer">
        <span class="help-footer-hint">Navigate sections using the left panel →</span>
        <button class="btn-secondary" id="help-close">Close</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Add help modal styles to `style.css`**

Append to the end of `src/renderer/style.css`:

```css
/* ── Help Modal ──────────────────────────────────────────────────────────────── */
#help-modal {
  background: var(--bg2);
  border: 1px solid var(--border2);
  border-radius: 10px;
  width: 700px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(0,0,0,0.5);
  overflow: hidden;
}

.help-hero {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 24px;
  text-align: center;
  flex-shrink: 0;
}
.help-hero-icon { font-size: 32px; color: var(--accent); line-height: 1; margin-bottom: 10px; }
.help-hero-title {
  font-family: var(--font-ui);
  font-weight: 800;
  font-size: 18px;
  color: var(--text);
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.help-hero-user { color: var(--accent2); }
.help-hero-tagline { font-size: 12px; color: var(--text-dim); font-family: var(--font-ui); }

.help-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }

.help-nav {
  width: 130px;
  flex-shrink: 0;
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}
.help-nav-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  padding: 6px 8px 4px;
}
.help-nav-item {
  padding: 7px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 12px;
  font-family: var(--font-ui);
  transition: all 0.12s;
  border-left: 2px solid transparent;
}
.help-nav-item:hover { background: var(--bg3); color: var(--text); }
.help-nav-item.active {
  background: var(--bg3);
  color: var(--accent);
  border-left-color: var(--accent);
  padding-left: 8px;
}

.help-content {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  font-family: var(--font-ui);
}
.help-content h3 { font-weight: 800; font-size: 15px; color: var(--text); margin-bottom: 8px; }
.help-content p { color: var(--text-mid); line-height: 1.6; font-size: 13px; margin-bottom: 14px; }

.help-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.help-type-row {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 10px 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.help-type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
  margin-top: 1px;
  font-family: var(--font-mono);
}
.help-type-badge.toggle     { background: rgba(74,222,128,0.13);  color: #4ade80; border: 1px solid rgba(74,222,128,0.27); }
.help-type-badge.launcher   { background: rgba(251,191,36,0.13);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.27); }
.help-type-badge.foreground { background: rgba(34,211,238,0.13);  color: #22d3ee; border: 1px solid rgba(34,211,238,0.27); }
.help-type-badge.cheatsheet { background: rgba(167,139,250,0.13); color: #a78bfa; border: 1px solid rgba(167,139,250,0.27); }

.help-type-row-body h4 { font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.help-type-row-body p  { font-size: 11px; color: var(--text-dim); line-height: 1.4; margin: 0; }

.help-example {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 12px 14px;
  margin-bottom: 8px;
}
.help-example-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.help-example-label { font-size: 13px; font-weight: 600; color: var(--text); }
.help-example-note  { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); line-height: 1.5; }

.btn-recreate {
  background: var(--accent2);
  color: #0a0f00;
  border: none;
  padding: 3px 10px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  font-family: var(--font-mono);
  flex-shrink: 0;
  transition: opacity 0.15s;
}
.btn-recreate:hover { opacity: 0.85; }

.help-footer {
  border-top: 1px solid var(--border);
  padding: 10px 20px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: var(--bg);
  flex-shrink: 0;
}
.help-footer-hint { font-size: 11px; color: var(--text-dim); font-family: var(--font-ui); margin-right: auto; }
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/index.html src/renderer/style.css
git commit -m "feat: add help modal HTML structure and CSS styles"
```

---

## Task 6: Create help-modal.js

**Files:**
- Create: `src/renderer/help-modal.js`

- [ ] **Step 1: Create `src/renderer/help-modal.js`**

```js
// ─── Starter data (mirrors src/defaults/*.json for recreate functionality) ────
const STARTER_DATA = {
  linux: [
    {
      id: 'starter-linux-audio-loopback', label: 'Audio Loopback', type: 'toggle', tags: ['Audio'],
      note: 'Routes mic to speakers. Requires PulseAudio or PipeWire (standard on Ubuntu, Fedora, Arch).',
      onCmd: 'pactl load-module module-loopback latency_msec=1',
      offCmd: 'pactl unload-module module-loopback',
    },
    {
      id: 'starter-linux-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: 'Requires NetworkManager (standard on most desktop distros).',
      onCmd: 'nmcli radio wifi on', offCmd: 'nmcli radio wifi off',
    },
    {
      id: 'starter-linux-home-folder', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your default file manager — works across GNOME, KDE, XFCE, and others.',
      launchCmd: 'xdg-open ~',
    },
    {
      id: 'starter-linux-system-monitor', label: 'System Monitor', type: 'foreground', tags: ['System'],
      note: 'Install if needed: sudo apt install htop (or dnf/pacman equivalent).',
      onCmd: 'htop',
    },
    {
      id: 'starter-linux-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics. nmap requires separate installation.',
      content: 'ip addr show\nip route\nss -tulnp\ncurl ifconfig.me\nnmap -sn 192.168.1.0/24',
    },
  ],
  darwin: [
    {
      id: 'starter-mac-dark-mode', label: 'Dark Mode', type: 'toggle', tags: ['Appearance'],
      note: 'Toggles system-wide dark/light appearance.',
      onCmd:  "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to true'",
      offCmd: "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to false'",
    },
    {
      id: 'starter-mac-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: 'Turns the Wi-Fi radio on or off.',
      onCmd: 'networksetup -setairportpower en0 on', offCmd: 'networksetup -setairportpower en0 off',
    },
    {
      id: 'starter-mac-finder', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your home directory in Finder.',
      launchCmd: 'open ~',
    },
    {
      id: 'starter-mac-keep-awake', label: 'Keep Awake', type: 'foreground', tags: ['System'],
      note: 'Prevents the display from sleeping while running. Kill to allow sleep again.',
      onCmd: 'caffeinate -d',
    },
    {
      id: 'starter-mac-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics for macOS.',
      content: 'ifconfig\nnetstat -rn\ncurl ifconfig.me\nnetworksetup -listallnetworkservices\nscutil --dns',
    },
  ],
  win32: [
    {
      id: 'starter-win-dark-mode', label: 'Dark Mode', type: 'toggle', tags: ['Appearance'],
      note: 'Toggles app dark/light theme via registry.',
      onCmd:  'reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 0 /f',
      offCmd: 'reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 1 /f',
    },
    {
      id: 'starter-win-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: "Interface name may vary — run 'netsh interface show interface' to find yours.",
      onCmd: 'netsh interface set interface "Wi-Fi" enabled',
      offCmd: 'netsh interface set interface "Wi-Fi" disabled',
    },
    {
      id: 'starter-win-file-explorer', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your home directory in File Explorer.',
      launchCmd: 'explorer.exe .',
    },
    {
      id: 'starter-win-ping-monitor', label: 'Ping Monitor', type: 'foreground', tags: ['Network'],
      note: 'Continuous connectivity check — streams output to the in-app terminal.',
      onCmd: 'ping -t 8.8.8.8',
    },
    {
      id: 'starter-win-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics for Windows.',
      content: 'ipconfig /all\nnetstat -an\ntracert 8.8.8.8\nnslookup google.com\narp -a',
    },
  ],
};

const SECTION_META = {
  toggle: {
    title: 'Toggle Commands',
    desc: 'Run one command to turn something ON, another to turn it OFF. Perfect for system settings you flip regularly — audio routing, Wi-Fi, display modes. Toggle state is remembered between sessions.',
  },
  launcher: {
    title: 'Launcher Commands',
    desc: "Fire-and-forget. Spawns a process detached from CommandDeck — the app keeps running even after CommandDeck closes. Use this for apps and long-lived services you don't need to monitor.",
  },
  foreground: {
    title: 'Foreground Commands',
    desc: 'Runs a managed process attached to CommandDeck. Output streams to the in-app terminal drawer in real time, and you can kill it with the KILL button. Use this for servers, monitors, and sync daemons.',
  },
  cheatsheet: {
    title: 'Cheatsheet Cards',
    desc: 'Read-only reference cards. Each line of content becomes a clickable snippet in the in-app terminal (TERM button) — click to send the command straight to the shell. Use OPEN to view the full sheet in your system terminal.',
  },
};

const SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'toggle',     label: '⇄ Toggle' },
  { id: 'launcher',   label: '⚡ Launcher' },
  { id: 'foreground', label: '▶ Foreground' },
  { id: 'cheatsheet', label: '≡ Cheatsheet' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let _getConfig    = null;
let _getPlatform  = null;
let _addCommand   = null;
let _activeSection = 'overview';

// ─── Public API ───────────────────────────────────────────────────────────────
export function initHelpModal({ getConfig, getPlatform, addCommand }) {
  _getConfig   = getConfig;
  _getPlatform = getPlatform;
  _addCommand  = addCommand;

  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  document.getElementById('help-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHelpModal();
  });
  document.getElementById('help-content').addEventListener('click', e => {
    const btn = e.target.closest('.btn-recreate');
    if (btn) _handleRecreate(btn.dataset.id);
  });
}

export function openHelpModal() {
  _activeSection = 'overview';
  _renderNav();
  _renderContent();
  document.getElementById('help-backdrop').classList.add('open');
}

export function closeHelpModal() {
  document.getElementById('help-backdrop').classList.remove('open');
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function _renderNav() {
  const nav = document.getElementById('help-nav');
  nav.innerHTML = '<div class="help-nav-label">SECTIONS</div>' +
    SECTIONS.map(s =>
      `<div class="help-nav-item${s.id === _activeSection ? ' active' : ''}" data-section="${s.id}">${s.label}</div>`
    ).join('');
  nav.querySelectorAll('.help-nav-item').forEach(el => {
    el.addEventListener('click', () => {
      _activeSection = el.dataset.section;
      _renderNav();
      _renderContent();
    });
  });
}

function _renderContent() {
  document.getElementById('help-content').innerHTML =
    _activeSection === 'overview' ? _overviewHtml() : _typeHtml(_activeSection);
}

function _overviewHtml() {
  const types = [
    { type: 'toggle',     name: 'ON / OFF command pairs',  desc: 'Flip system settings with two commands. e.g. load/unload a module, start/stop a service.' },
    { type: 'launcher',   name: 'Fire &amp; forget',       desc: 'Launch an app detached. It keeps running after CommandDeck closes.' },
    { type: 'foreground', name: 'Managed process',         desc: 'Runs attached, streams output, killable. Perfect for servers or sync daemons.' },
    { type: 'cheatsheet', name: 'Reference card',          desc: 'Clickable snippets in an in-app terminal. No command runs until you choose.' },
  ];
  return `
    <h3>What is CommandDeck?</h3>
    <p>CommandDeck lives in your system tray and gives you a visual board of terminal commands you run every day.
       No more hunting through shell history — just click to toggle, launch, or inspect.</p>
    <div class="help-section-label">CARD TYPES AT A GLANCE</div>
    ${types.map(t => `
      <div class="help-type-row">
        <span class="help-type-badge ${t.type}">${t.type.toUpperCase()}</span>
        <div class="help-type-row-body"><h4>${t.name}</h4><p>${t.desc}</p></div>
      </div>
    `).join('')}
  `;
}

function _typeHtml(type) {
  const meta = SECTION_META[type];
  const plat = _getPlatform();
  const starters = (STARTER_DATA[plat] || STARTER_DATA.linux).filter(s => s.type === type);
  const currentIds = new Set((_getConfig().commands || []).map(c => c.id));
  return `
    <h3>${meta.title}</h3>
    <p>${meta.desc}</p>
    ${starters.length ? `<div class="help-section-label">STARTER EXAMPLE</div>` : ''}
    ${starters.map(s => `
      <div class="help-example">
        <div class="help-example-header">
          <span class="help-example-label">${s.label}</span>
          ${!currentIds.has(s.id) ? `<button class="btn-recreate" data-id="${s.id}">RECREATE</button>` : ''}
        </div>
        ${s.note ? `<div class="help-example-note">${s.note}</div>` : ''}
      </div>
    `).join('')}
  `;
}

async function _handleRecreate(starterId) {
  const plat = _getPlatform();
  const all = STARTER_DATA[plat] || STARTER_DATA.linux;
  const starter = all.find(s => s.id === starterId);
  if (!starter) return;
  await _addCommand(starter);
  _renderContent();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/help-modal.js
git commit -m "feat: add help-modal.js with section rendering and recreate button logic"
```

---

## Task 7: Wire help modal into app.js

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add import and `platform` state variable**

At the top of `src/renderer/app.js`, add the import after the existing imports (around line 6):

```js
import { initHelpModal, openHelpModal } from './help-modal.js';
```

In the state block (around line 9–16), add:

```js
let platform = 'linux';
```

- [ ] **Step 2: Update `loadAll()` to extract firstRun and platform**

Replace the first two lines of `loadAll()` (currently around lines 50–53):

```js
// Before:
async function loadAll() {
  const raw = await window.api.loadConfig();
  const { commands, changed } = migrateCommands(raw.commands || []);
  config = { ...raw, commands };

// After:
async function loadAll() {
  const raw = await window.api.loadConfig();
  const { firstRun, platform: p } = raw;
  platform = p || 'linux';
  const { commands, changed } = migrateCommands(raw.commands || []);
  config = { commands };
```

Then, after the `renderAll()` call at the end of `loadAll()`, add the auto-open:

```js
  renderAll();
  if (firstRun) openHelpModal();
}
```

- [ ] **Step 3: Add `#btn-help` click handler to the titlebar controls block**

In the titlebar controls section (around line 257 where `btn-prefs` is wired), add after the prefs button handler:

```js
document.getElementById('btn-help').addEventListener('click', () => openHelpModal());
```

- [ ] **Step 4: Add `initHelpModal` to the init block**

At the bottom of `app.js`, in the init block (around lines 302–304):

```js
// Before:
initModal({ getConfig: () => config, persist, renderAll });
initDrawer({ getConfig: () => config, getOutputMap: () => outputMap, getLiveMap: () => liveMap });
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; }, applyTheme: initTheme });

// After:
initModal({ getConfig: () => config, persist, renderAll });
initDrawer({ getConfig: () => config, getOutputMap: () => outputMap, getLiveMap: () => liveMap });
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; }, applyTheme: initTheme });
initHelpModal({
  getConfig:   () => config,
  getPlatform: () => platform,
  addCommand:  async (cmd) => {
    config = { ...config, commands: [...config.commands, cmd] };
    await persist();
    renderAll();
  },
});
```

- [ ] **Step 5: Smoke test — first-run path**

```bash
# Temporarily move the real config file out of the way
mv ~/.commanddeck/commands.json ~/.commanddeck/commands.json.bak 2>/dev/null; npm start
```

Expected:
- App opens with 5 pre-populated cards (Audio Loopback, Wi-Fi, Open Home Folder, System Monitor, Network Toolkit on Linux)
- Help modal opens automatically showing "Welcome to CommandDeck, user"
- Navigate through all 5 sections — each shows correct content
- No RECREATE buttons are visible (all starters are present)

- [ ] **Step 6: Smoke test — ? button and recreate path**

```bash
# Delete one starter from the running app using Edit → Delete, then click ?
```

Expected:
- Clicking `?` opens the help modal
- The section for the deleted card type shows a RECREATE button
- Clicking RECREATE adds the card back to the board (visible immediately)
- The RECREATE button disappears from the modal
- The card is present in `~/.commanddeck/commands.json`

- [ ] **Step 7: Restore backup config**

```bash
mv ~/.commanddeck/commands.json.bak ~/.commanddeck/commands.json 2>/dev/null; true
```

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: wire help modal into app — auto-open on first run, ? button in titlebar"
```

---

## Done

All tasks complete. The feature is ready to merge or PR.

**Verification checklist:**
- [ ] `npm test` passes with no failures
- [ ] First-run: delete `~/.commanddeck/commands.json`, run `npm start` — 5 starter cards + auto-open help modal
- [ ] Help modal `?` button opens correctly from the titlebar
- [ ] All 5 nav sections render correct content
- [ ] RECREATE button appears only for missing starters and works correctly
- [ ] Light theme: open the help modal in light mode — verify it looks correct (theme vars apply automatically)
- [ ] Save the approved design screenshot to `docs/assets/help-modal-screenshot.png`
