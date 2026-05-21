# Sponsorship & Donation Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-pressure sponsorship support via a GitHub FUNDING.yml, a README section, and a passive strip in the in-app Preferences modal.

**Architecture:** Three independent, additive changes: a static config file for GitHub's Sponsor button, a new README section, and a UI strip in the Preferences modal wired to a new `openExternal` IPC channel. The IPC channel follows the exact same pattern as the existing `open-log` and `open-log-dir` handlers — no new patterns introduced.

**Tech Stack:** Electron `shell.openExternal`, contextBridge IPC, vanilla HTML/CSS with CSS variables (dark/light theming handled automatically by existing variable system).

---

## File Map

| File | Change |
|---|---|
| `.github/FUNDING.yml` | Create — GitHub Sponsor button config |
| `README.md` | Modify — add `## Support` section before `## License` |
| `src/main/preload.js` | Modify — expose `openExternal` on `window.api` |
| `src/main/ipc-handlers.js` | Modify — register `open-external` IPC handler |
| `src/renderer/index.html` | Modify — add `.prefs-sponsor` div in `#prefs-modal` |
| `src/renderer/style.css` | Modify — add `.prefs-sponsor` styles |
| `src/renderer/prefs-modal.js` | Modify — wire click handler for sponsor link |

No changes needed to `theme-light.css` — the strip uses existing CSS variables (`--bg`, `--border`, `--accent`, `--text-dim`, `--danger`) which theme-light.css already overrides.

---

## Task 1: Create `.github/FUNDING.yml`

**Files:**
- Create: `.github/FUNDING.yml`

- [ ] **Step 1: Create the `.github` directory and write FUNDING.yml**

```bash
mkdir .github
```

Create `.github/FUNDING.yml` with this exact content:

```yaml
github: YOUR_GITHUB_USERNAME
ko_fi: YOUR_KOFI_USERNAME
```

> Note: Replace `YOUR_GITHUB_USERNAME` and `YOUR_KOFI_USERNAME` with the real values once the accounts are set up. The file is valid as-is (GitHub will ignore entries with placeholder-looking values that don't resolve to real accounts, and the Sponsor button simply won't appear until a valid github entry is set).

- [ ] **Step 2: Verify the file exists and is valid YAML**

```bash
cat .github/FUNDING.yml
```

Expected output:
```
github: YOUR_GITHUB_USERNAME
ko_fi: YOUR_KOFI_USERNAME
```

- [ ] **Step 3: Commit**

```bash
git add .github/FUNDING.yml
git commit -m "feat: add FUNDING.yml for GitHub Sponsors and Ko-fi"
```

---

## Task 2: Add Support Section to README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Locate the insertion point**

Open `README.md`. Find the `## Roadmap (future ideas)` section and the `## License` section below it. The new section goes between them, after the `---` separator that precedes `## License`.

The end of the file currently looks like this (last ~10 lines):

```markdown
- [ ] `.deb` / AppImage packaging
- [ ] Dark/light theme toggle

---

## License

MIT — do whatever you want with it.
```

- [ ] **Step 2: Insert the Support section**

Replace the final `---` + `## License` block with:

```markdown
- [ ] `.deb` / AppImage packaging
- [ ] Dark/light theme toggle

---

## Support

If CommandDeck saves you time or friction, a small sponsorship would be deeply appreciated.
GitHub Sponsors is the easiest way to help — Ko-fi works too if you prefer.

- **[GitHub Sponsors](https://github.com/sponsors/YOUR_GITHUB_USERNAME)** — recurring or one-time, directly on GitHub
- **[Ko-fi](https://ko-fi.com/YOUR_KOFI_USERNAME)** — buy me a coffee, no account needed

---

## License

MIT — do whatever you want with it.
```

- [ ] **Step 3: Verify the section appears correctly**

```bash
tail -20 README.md
```

Expected: the Support section with two bullet links sits between the Roadmap and License sections, each separated by `---`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add Support section to README"
```

---

## Task 3: Add `openExternal` IPC Channel

**Files:**
- Modify: `src/main/preload.js`
- Modify: `src/main/ipc-handlers.js`

- [ ] **Step 1: Add `openExternal` to preload.js**

In `src/main/preload.js`, add the new method in the `// System terminal` section (after line 34, before the `// PTY` block):

```js
  // System terminal
  openInTerminal: (content, cmdId) => ipcRenderer.invoke('open-in-terminal', { content, cmdId }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
```

- [ ] **Step 2: Register the handler in ipc-handlers.js**

In `src/main/ipc-handlers.js`, add the handler alongside the existing `open-log` and `open-log-dir` handlers (lines 85–86):

```js
  ipcMain.handle('open-log', (_, { logFile }) => { shell.openPath(logFile); return true; });
  ipcMain.handle('open-log-dir', () => { shell.openPath(LOG_DIR); return true; });
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));
```

- [ ] **Step 3: Verify the app still starts cleanly**

```bash
npm start
```

Expected: app opens, no console errors. Close the app.

- [ ] **Step 4: Commit**

```bash
git add src/main/preload.js src/main/ipc-handlers.js
git commit -m "feat: expose openExternal IPC channel"
```

---

## Task 4: Add Sponsor Strip HTML to Preferences Modal

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Locate the insertion point in index.html**

In `src/renderer/index.html`, find the closing `</div>` of `.modal-body` inside `#prefs-modal` and the opening `<div class="modal-footer">` immediately after it (around lines 163–164):

```html
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="prefs-cancel">Cancel</button>
        <button class="btn-primary" id="prefs-save">Save Preferences</button>
      </div>
```

- [ ] **Step 2: Insert the sponsor strip div between modal-body and modal-footer**

```html
      </div>
      <div class="prefs-sponsor">
        <span class="prefs-sponsor-heart">♥</span>
        Enjoying CommandDeck?
        <a href="#" id="prefs-sponsor-link">Sponsor this project</a>
        — it means a lot.
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="prefs-cancel">Cancel</button>
        <button class="btn-primary" id="prefs-save">Save Preferences</button>
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add sponsor strip HTML to Preferences modal"
```

---

## Task 5: Style the Sponsor Strip

**Files:**
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Add `.prefs-sponsor` styles to style.css**

Append the following block after the `.prefs-section-label` rule (after line 723 in style.css). Insert it before the `/* ── In-app terminal ──` comment:

```css
.prefs-sponsor {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 20px;
  background: var(--bg);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  flex-wrap: wrap;
}
.prefs-sponsor-heart { color: var(--danger); }
.prefs-sponsor a {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
}
.prefs-sponsor a:hover { text-decoration: underline; }
```

> No changes needed to `theme-light.css` — all colours reference CSS variables that the light theme already overrides (`--bg`, `--border`, `--accent`, `--text-dim`, `--danger`).

- [ ] **Step 2: Start the app and open Preferences (⚙ in the titlebar)**

```bash
npm start
```

Verify visually:
- A thin dark strip appears between the settings form and the Cancel/Save buttons
- It contains a red ♥, muted grey text, and a green "Sponsor this project" link
- Toggle to Light theme in Preferences and confirm the strip re-colours correctly (green link becomes dark green, background becomes light paper tone)

Close the app.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/style.css
git commit -m "feat: style Preferences modal sponsor strip"
```

---

## Task 6: Wire the Sponsor Link Click Handler

**Files:**
- Modify: `src/renderer/prefs-modal.js`

- [ ] **Step 1: Add the click listener at the bottom of prefs-modal.js**

Append after the last `document.getElementById(...)` listener block (after line 108):

```js
document.getElementById('prefs-sponsor-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openExternal('https://github.com/sponsors/YOUR_GITHUB_USERNAME');
});
```

> Replace `YOUR_GITHUB_USERNAME` with the real value once the GitHub Sponsors profile is set up.

- [ ] **Step 2: Start the app, open Preferences, and click "Sponsor this project"**

```bash
npm start
```

Expected: clicking the link opens `https://github.com/sponsors/YOUR_GITHUB_USERNAME` in the system browser. The Preferences modal stays open. No console errors.

Close the app.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/prefs-modal.js
git commit -m "feat: wire sponsor link in Preferences modal"
```

---

## Done

All three deliverables are complete:
- `.github/FUNDING.yml` — GitHub will show the Sponsor button once real usernames are set
- `README.md` — Support section between Roadmap and License
- In-app Preferences strip — passive, always visible, opens GitHub Sponsors in browser

**Remaining action (owner):** Replace all `YOUR_GITHUB_USERNAME` and `YOUR_KOFI_USERNAME` placeholders with real values once accounts are ready. Three locations: `.github/FUNDING.yml`, `README.md` (two places), `src/renderer/prefs-modal.js`.
