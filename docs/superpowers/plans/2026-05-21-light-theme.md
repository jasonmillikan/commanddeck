# Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Paper" light theme to CommandDeck with OS default and manual override in Preferences, including xterm.js terminal re-theming.

**Architecture:** A new `theme-light.css` file holds only `[data-theme="light"]` CSS variable overrides; `style.css` is the dark default unchanged. A `setTheme(mode)` / `initTheme(pref)` pair in `app.js` drives the `data-theme` attribute on `<html>` and delegates xterm theming to `setXtermTheme(mode)` in `terminal.js`. The Preferences modal radio group persists to `prefs.json` and provides live preview with Cancel-revert.

**Tech Stack:** Vanilla JS ES modules, CSS custom properties, xterm.js `term.options.theme`, `window.matchMedia`, Node.js test runner.

---

### Task 1: Add `theme` to prefs defaults

**Files:**
- Modify: `src/main/prefs.js`
- Modify: `test/prefs.test.js`

- [ ] **Step 1: Add two failing tests to `test/prefs.test.js`**

Append these two tests at the end of the file:

```js
test('loadPrefs returns default theme of "system"', () => {
  const result = loadPrefs('/nonexistent/path/prefs.json');
  assert.equal(result.theme, 'system');
});

test('loadPrefs merges theme from saved data', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ theme: 'light' }));
  const result = loadPrefs(tmp);
  assert.equal(result.theme, 'light');
  fs.unlinkSync(tmp);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: 2 failures — `result.theme` is `undefined`, not `'system'`.

- [ ] **Step 3: Add `theme` to `DEFAULTS` in `src/main/prefs.js`**

Change the `DEFAULTS` object from:

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

To:

```js
const DEFAULTS = {
  hotkey: 'Super+D',
  drawerHeight: 240,
  theme: 'system',
  notify: {
    onCrash: true,
    onUnexpectedExit: false,
  },
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all 44 tests pass, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/main/prefs.js test/prefs.test.js
git commit -m "feat: add theme preference with system default"
```

---

### Task 2: Create `theme-light.css`

**Files:**
- Create: `src/renderer/theme-light.css`

- [ ] **Step 1: Create `src/renderer/theme-light.css`**

```css
/* ── Light Theme (Paper) ───────────────────────────────────────────────────── */
[data-theme="light"] {
  --bg:        #fafaf7;
  --bg2:       #f2f2ec;
  --bg3:       #e8e8e0;
  --border:    #d0d0c4;
  --border2:   #a8a898;
  --accent:    #15803d;
  --accent2:   #0369a1;
  --danger:    #dc2626;
  --warn:      #b45309;
  --text:      #1a1a14;
  --text-dim:  #6b7280;
  --text-mid:  #4b5563;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/theme-light.css
git commit -m "feat: add Paper light theme CSS variable overrides"
```

---

### Task 3: Add xterm theme constants and `setXtermTheme()` to `terminal.js`

**Files:**
- Modify: `src/renderer/terminal.js`

- [ ] **Step 1: Add `XTERM_THEMES` constant and `setXtermTheme` export to `src/renderer/terminal.js`**

Add the following block at the top of the file, before `const terminalMap`:

```js
export const XTERM_THEMES = {
  dark: {
    background: '#0c0e14', foreground: '#e2e8f0', cursor: '#4ade80',
    black: '#1a1e2e',   brightBlack: '#64748b',
    red: '#f87171',     brightRed: '#ef4444',
    green: '#4ade80',   brightGreen: '#86efac',
    yellow: '#fbbf24',  brightYellow: '#fde68a',
    blue: '#60a5fa',    brightBlue: '#93c5fd',
    magenta: '#c084fc', brightMagenta: '#e879f9',
    cyan: '#22d3ee',    brightCyan: '#67e8f9',
    white: '#e2e8f0',   brightWhite: '#f8fafc',
  },
  light: {
    background: '#fafaf7', foreground: '#1a1a14', cursor: '#15803d',
    black: '#4b5563',   brightBlack: '#6b7280',
    red: '#c0392b',     brightRed: '#dc2626',
    green: '#15803d',   brightGreen: '#16a34a',
    yellow: '#92400e',  brightYellow: '#b45309',
    blue: '#1d4ed8',    brightBlue: '#2563eb',
    magenta: '#7c3aed', brightMagenta: '#9333ea',
    cyan: '#0e7490',    brightCyan: '#0891b2',
    white: '#374151',   brightWhite: '#1a1a14',
  },
};
```

- [ ] **Step 2: Add `setXtermTheme` export at the end of `src/renderer/terminal.js`**

Append after `getActiveTerminalId`:

```js
export function setXtermTheme(mode) {
  for (const entry of terminalMap.values()) {
    if (entry) entry.term.options.theme = XTERM_THEMES[mode];
  }
}
```

- [ ] **Step 3: Update `initTerminal` to use `XTERM_THEMES` based on the current `data-theme` attribute**

Inside `initTerminal`, replace the hardcoded `theme` object in the `Terminal` constructor:

```js
  const term = new Terminal({
    theme: { background: '#12151f', foreground: '#e2e8f0', cursor: '#4ade80' },
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursorBlink: true,
  });
```

With:

```js
  const mode = document.documentElement.getAttribute('data-theme') || 'dark';
  const term = new Terminal({
    theme: XTERM_THEMES[mode] || XTERM_THEMES.dark,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursorBlink: true,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/terminal.js
git commit -m "feat: add xterm ANSI theme constants and setXtermTheme()"
```

---

### Task 4: Add theme resolution and `setTheme()` to `app.js`

**Files:**
- Modify: `src/renderer/app.js`

- [ ] **Step 1: Add `setXtermTheme` to the `terminal.js` import line**

Change:

```js
import { initTerminal, getTerminalEntry, deleteTerminalEntry, getActiveTerminalId } from './terminal.js';
```

To:

```js
import { initTerminal, getTerminalEntry, deleteTerminalEntry, getActiveTerminalId, setXtermTheme } from './terminal.js';
```

- [ ] **Step 2: Add `osThemeListener` variable and theme functions to `app.js`**

Add the following block after the `// ─── Helpers` section (after the `getFirstPid` function, before `loadAll`):

```js
// ─── Theme ────────────────────────────────────────────────────────────────────
let osThemeListener = null;

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  setXtermTheme(mode);
}

function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme(pref) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (osThemeListener) {
    mq.removeEventListener('change', osThemeListener);
    osThemeListener = null;
  }
  setTheme(resolveTheme(pref));
  if (pref === 'system') {
    osThemeListener = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', osThemeListener);
  }
}
```

- [ ] **Step 3: Call `initTheme` in `loadAll()` after prefs are loaded**

In the `loadAll` function, after the line `document.getElementById('output-drawer').style.height = ...`, add:

```js
  initTheme(prefs.theme || 'system');
```

The updated end of `loadAll` should look like:

```js
  prefs = await window.api.loadPrefs();
  document.getElementById('output-drawer').style.height = (prefs.drawerHeight || 240) + 'px';
  initTheme(prefs.theme || 'system');
  renderAll();
```

- [ ] **Step 4: Update `initPrefsModal` call to pass `applyTheme`**

At the bottom of `app.js`, change:

```js
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; } });
```

To:

```js
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; }, applyTheme: initTheme });
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: add initTheme/setTheme with OS prefers-color-scheme listener"
```

---

### Task 5: Wire the Appearance radio group in the Prefs modal

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/prefs-modal.js`

- [ ] **Step 1: Add the Appearance section to the prefs modal in `src/renderer/index.html`**

In the prefs modal `<div class="modal-body">`, add the following block as the **first child** (before the `Global Hotkey` label):

```html
        <div class="prefs-section-label">APPEARANCE</div>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" name="p-theme" value="system" />
            System
          </label>
          <label class="radio-label">
            <input type="radio" name="p-theme" value="light" />
            Light
          </label>
          <label class="radio-label">
            <input type="radio" name="p-theme" value="dark" />
            Dark
          </label>
        </div>
```

The modal body should now open with:

```html
      <div class="modal-body">
        <div class="prefs-section-label">APPEARANCE</div>
        <div class="radio-group">
          ...
        </div>
        <label>Global Hotkey
          ...
```

- [ ] **Step 2: Add `.radio-group` and `.radio-label` styles to `src/renderer/style.css`**

Add the following block immediately after the `.checkbox-label input[type="checkbox"]` block (after line 565):

```css
.radio-group {
  display: flex;
  gap: 20px;
}
.radio-label {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-mid);
}
.radio-label input[type="radio"] {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Update `src/renderer/prefs-modal.js` to handle theme**

Replace the entire contents of `src/renderer/prefs-modal.js` with:

```js
import { keyEventToAccelerator } from './utils.js';

let hotkeyRecording = false;
let hotkeyRecordPrev = '';
let _getPrefs, _setPrefs, _applyTheme;
let themePrefAtOpen = 'system';

export function initPrefsModal({ getPrefs, setPrefs, applyTheme }) {
  _getPrefs = getPrefs;
  _setPrefs = setPrefs;
  _applyTheme = applyTheme;
}

export async function openPrefsModal() {
  const p = _getPrefs();
  themePrefAtOpen = p.theme || 'system';
  document.querySelector(`input[name="p-theme"][value="${themePrefAtOpen}"]`).checked = true;
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

function cancelPrefsModal() {
  _applyTheme(themePrefAtOpen);
  closePrefsModal();
}

document.getElementById('btn-prefs').addEventListener('click', openPrefsModal);
document.getElementById('prefs-close').addEventListener('click', cancelPrefsModal);
document.getElementById('prefs-cancel').addEventListener('click', cancelPrefsModal);
document.getElementById('prefs-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) cancelPrefsModal();
});
document.getElementById('p-hotkey-record').addEventListener('click', () => {
  if (hotkeyRecording) stopHotkeyRecording(true);
  else startHotkeyRecording();
});
document.getElementById('p-hotkey-clear').addEventListener('click', () => {
  stopHotkeyRecording();
  document.getElementById('p-hotkey').value = '';
});
document.querySelectorAll('input[name="p-theme"]').forEach(radio => {
  radio.addEventListener('change', (e) => _applyTheme(e.target.value));
});
document.getElementById('prefs-save').addEventListener('click', async () => {
  const hotkey = document.getElementById('p-hotkey').value.trim();
  const theme = document.querySelector('input[name="p-theme"]:checked').value;
  const p = _getPrefs();
  const updated = {
    ...p,
    hotkey,
    theme,
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
  _applyTheme(theme);
  closePrefsModal();
});
```

- [ ] **Step 4: Add the `<link>` for `theme-light.css` to `src/renderer/index.html`**

In `<head>`, after `<link rel="stylesheet" href="style.css" />`, add:

```html
  <link rel="stylesheet" href="theme-light.css" />
```

- [ ] **Step 5: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: all 44 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/index.html src/renderer/style.css src/renderer/prefs-modal.js
git commit -m "feat: wire light theme toggle into Preferences modal"
```

---

### Task 6: Manual E2E verification

No automated tests cover the renderer UI. Verify each behaviour by running the app.

- [ ] **Step 1: Start the app**

```bash
npm start
```

- [ ] **Step 2: Verify OS default applies at boot**

If your OS is in light mode, the app should open in Paper (cream background, dark green accent). If in dark mode, it should open in the dark theme. Confirm `document.documentElement.getAttribute('data-theme')` in DevTools console matches.

- [ ] **Step 3: Verify Preferences modal live preview**

Open Preferences (⚙). Select **Light** — app should switch to Paper immediately without closing the modal. Select **Dark** — should switch back. Select **System** — should revert to OS default.

- [ ] **Step 4: Verify Cancel reverts**

Open Preferences. Switch to a different theme. Click **Cancel** — the app should revert to whatever theme was active when you opened the modal.

- [ ] **Step 5: Verify Save persists**

Open Preferences. Select **Light**. Click **Save Preferences**. Quit and relaunch the app. It should open in Light mode.

- [ ] **Step 6: Verify xterm terminal follows theme**

Add a cheatsheet card if one doesn't exist. Open its TERM drawer. With Light theme active, the terminal should have a cream background and dark text. Switch to Dark in Preferences without closing the drawer — the terminal should update immediately.

- [ ] **Step 7: Final commit**

```bash
git add -p  # stage any fix-up changes from verification
git commit -m "fix: light theme E2E verification fixes" --allow-empty
```

(Use `--allow-empty` only if there were no changes; otherwise stage and commit normally.)
