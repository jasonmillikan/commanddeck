# Drag-to-Reorder Cards + Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `group` field with a multi-value `tags` array and add drag-to-reorder cards via SortableJS with a left-edge drag handle.

**Architecture:** Pure logic (migration, reorder algorithm) lives in a new `src/renderer/utils.js` that is loadable in both the browser and Node.js test environment. SortableJS is installed via npm and loaded via a `<script>` tag. Card order is determined solely by the `config.commands` array index; after any drag, the reordered array is immediately persisted.

**Tech Stack:** SortableJS (npm), Node.js built-in test runner (`node --test`), vanilla JS/HTML/CSS (no build step).

**Spec:** `docs/superpowers/specs/2026-05-20-drag-to-reorder-tags-design.md`

---

### Task 1: Install SortableJS and add script tags

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/index.html:157`

- [ ] **Step 1: Install SortableJS**

```bash
npm install sortablejs
```

Expected: `sortablejs` appears in `package.json` dependencies and `node_modules/sortablejs/Sortable.min.js` exists.

- [ ] **Step 2: Add script tags to index.html**

In `src/renderer/index.html`, replace:
```html
  <script src="app.js"></script>
```
with:
```html
  <script src="utils.js"></script>
  <script src="../../node_modules/sortablejs/Sortable.min.js"></script>
  <script src="app.js"></script>
```

- [ ] **Step 3: Verify app still loads**

Run `npm start`, confirm the window opens with no console errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/renderer/index.html
git commit -m "feat: install sortablejs, add utils.js and sortable script tags"
```

---

### Task 2: Create utils.js with migrateCommands + tests

**Files:**
- Create: `src/renderer/utils.js`
- Create: `test/utils.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/utils.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateCommands } = require('../src/renderer/utils');

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/utils.test.js
```

Expected: fails with "Cannot find module '../src/renderer/utils'"

- [ ] **Step 3: Create utils.js with migrateCommands**

Create `src/renderer/utils.js`:

```js
function migrateCommands(commands) {
  let changed = false;
  const migrated = commands.map(cmd => {
    if (cmd.tags !== undefined) return cmd;
    changed = true;
    const { group, ...rest } = cmd;
    return { ...rest, tags: group ? [group] : [] };
  });
  return { commands: migrated, changed };
}

function applyReorder(allCommands, newVisibleIds) {
  // placeholder — implemented in Task 3
  return allCommands;
}

if (typeof module !== 'undefined') {
  module.exports = { migrateCommands, applyReorder };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/utils.test.js
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils.js test/utils.test.js
git commit -m "feat: add utils.js with migrateCommands, add tests"
```

---

### Task 3: Add applyReorder to utils.js + tests

**Files:**
- Modify: `src/renderer/utils.js`
- Modify: `test/utils.test.js`

- [ ] **Step 1: Write the failing tests**

First, update the existing `require` at the top of `test/utils.test.js` to also destructure `applyReorder`:

```js
const { migrateCommands, applyReorder } = require('../src/renderer/utils');
```

Then append these tests to the bottom of `test/utils.test.js`:

```js
test('applyReorder: reorders full unfiltered list', () => {
  const commands = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ];
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
  // Visible (audio filter): [a, c, d] — drag d before c → new visible order [a, d, c]
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

- [ ] **Step 2: Run tests to verify new ones fail**

```bash
node --test test/utils.test.js
```

Expected: the 4 new `applyReorder` tests fail (placeholder returns unchanged array).

- [ ] **Step 3: Implement applyReorder in utils.js**

Replace the placeholder `applyReorder` in `src/renderer/utils.js`:

```js
function applyReorder(allCommands, newVisibleIds) {
  // Find which indices in allCommands are currently occupied by visible cards
  const visibleSet = new Set(newVisibleIds);
  const positions = [];
  for (let i = 0; i < allCommands.length; i++) {
    if (visibleSet.has(allCommands[i].id)) positions.push(i);
  }
  // Map each new visible ID to its command object
  const byId = Object.fromEntries(allCommands.map(c => [c.id, c]));
  const result = [...allCommands];
  positions.forEach((pos, i) => {
    result[pos] = byId[newVisibleIds[i]];
  });
  return result;
}
```

- [ ] **Step 4: Run all tests to verify they pass**

```bash
node --test test/utils.test.js
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/utils.js test/utils.test.js
git commit -m "feat: implement applyReorder in utils.js, add tests"
```

---

### Task 4: Wire migration into loadAll() in app.js

**Files:**
- Modify: `src/renderer/app.js:42-47`

`migrateCommands` is available globally because `utils.js` is loaded before `app.js` via a `<script>` tag.

- [ ] **Step 1: Update loadAll to migrate and save if changed**

In `src/renderer/app.js`, replace the `loadAll` function (lines 42–47):

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

- [ ] **Step 2: Verify migration works manually**

If you have a `~/.commanddeck/commands.json` with `"group"` fields, run `npm start`. Check that `~/.commanddeck/commands.json` now has `"tags"` arrays instead of `"group"` fields.

If you don't have an existing config, create a test one:
```bash
mkdir -p ~/.commanddeck
cat > ~/.commanddeck/commands.json << 'EOF'
{
  "commands": [
    { "id": "test1", "label": "Test", "type": "toggle", "group": "Audio", "onCmd": "echo on", "offCmd": "echo off" }
  ]
}
EOF
```
Run `npm start`, then `cat ~/.commanddeck/commands.json` — confirm `"tags": ["Audio"]` appears and `"group"` is gone.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: auto-migrate group → tags on loadAll"
```

---

### Task 5: Update sidebar for tags

**Files:**
- Modify: `src/renderer/app.js:54-81`
- Modify: `src/renderer/index.html:38`

- [ ] **Step 1: Update renderGroups to derive tags**

In `src/renderer/app.js`, replace `renderGroups` (lines 54–68):

```js
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
```

- [ ] **Step 2: Update filteredCommands to filter by tags array**

In `src/renderer/app.js`, replace `filteredCommands` (lines 71–81):

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

- [ ] **Step 3: Update sidebar label in index.html**

In `src/renderer/index.html` line 38, replace:
```html
      <div class="sidebar-section-label">GROUPS</div>
```
with:
```html
      <div class="sidebar-section-label">TAGS</div>
```

- [ ] **Step 4: Verify in the app**

Run `npm start`. Confirm:
- Sidebar shows "TAGS" label
- Tags derived from `tags` arrays appear in the sidebar
- Clicking a tag filters cards correctly
- "All Commands" still shows everything

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.js src/renderer/index.html
git commit -m "feat: sidebar uses tags array for filtering"
```

---

### Task 6: Add drag handle markup to renderCard

**Files:**
- Modify: `src/renderer/app.js:157-172`

This wraps existing card content in `.card-body` and adds `.card-drag-handle` as the first sibling.

- [ ] **Step 1: Update the return value of renderCard**

In `src/renderer/app.js`, replace the `return` statement at the end of `renderCard` (lines 157–172):

```js
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
```

- [ ] **Step 2: Verify the app renders without errors**

Run `npm start`. Cards should still render (they'll look broken without CSS — that's Task 7). Confirm no JS errors in the console.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: add card-drag-handle and card-body wrapper to renderCard"
```

---

### Task 7: Drag handle CSS and card-body layout

**Files:**
- Modify: `src/renderer/style.css:179-201`

- [ ] **Step 1: Update .card and add .card-body and .card-drag-handle styles**

In `src/renderer/style.css`, replace the `.card` block and its immediate modifiers (lines 179–201):

```css
.card {
  width: var(--card-w);
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: row;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: var(--border2);
  transition: background 0.2s;
}
.card.running::before { background: var(--accent); }
.card.running { border-color: rgba(74, 222, 128, 0.25); box-shadow: 0 0 20px rgba(74, 222, 128, 0.06); }
.card:hover { border-color: var(--border2); }

.card-drag-handle {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--text-dim);
  opacity: 0.35;
  border-right: 1px solid var(--border);
  font-size: 13px;
  transition: opacity 0.15s, color 0.15s;
  user-select: none;
}
.card-drag-handle:hover { opacity: 1; color: var(--text); }
.card-drag-handle:active { cursor: grabbing; }

.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
```

- [ ] **Step 2: Verify layout in the app**

Run `npm start`. Cards should look correct: narrow grip strip on the left, all card content to the right. The grip brightens on hover. The top accent bar still spans the full card width.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/style.css
git commit -m "feat: add drag handle and card-body CSS"
```

---

### Task 8: SortableJS initialization and handleDragEnd

**Files:**
- Modify: `src/renderer/app.js:1-12` (state block)
- Modify: `src/renderer/app.js:237-251` (renderCards)

`applyReorder` is available globally via `utils.js`.

- [ ] **Step 1: Add sortableInstance to module-level state**

In `src/renderer/app.js`, add one line after line 10 (`let drawerLogFile = null;`):

```js
let sortableInstance = null;
```

- [ ] **Step 2: Add handleDragEnd function**

In `src/renderer/app.js`, add this function directly before `renderCards` (before line 237):

```js
async function handleDragEnd() {
  const container = document.getElementById('cards-container');
  const newVisibleIds = [...container.querySelectorAll('[data-id]')].map(el => el.dataset.id);
  config.commands = applyReorder(config.commands, newVisibleIds);
  await persist();
}
```

- [ ] **Step 3: Initialize Sortable in renderCards**

In `src/renderer/app.js`, replace `renderCards` (the function that ends at line 251):

```js
function renderCards() {
  const container = document.getElementById('cards-container');
  const cmds = filteredCommands();
  if (cmds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⬡</div>
        <div class="empty-state-text">${config.commands.length === 0 ? 'No commands yet' : 'No matches'}</div>
        <div class="empty-state-hint">${config.commands.length === 0 ? 'Click "+ New Command" to get started' : 'Try a different search or group'}</div>
      </div>`;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    return;
  }
  container.innerHTML = cmds.map(renderCard).join('');
  attachCardListeners();
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(container, {
    handle: '.card-drag-handle',
    animation: 150,
    onEnd: handleDragEnd,
  });
}
```

- [ ] **Step 4: Verify drag-to-reorder works**

Run `npm start`. Grab a card by its left-edge handle and drag it to a new position. Release. Confirm:
- The card visually lands in the new position
- `~/.commanddeck/commands.json` reflects the new order (check with `cat ~/.commanddeck/commands.json`)
- After a restart (`npm start`), cards appear in the new order

- [ ] **Step 5: Verify filtered drag works**

Add commands with at least two different tags. Filter to one tag. Drag a card. Confirm that non-visible cards remain in their original relative positions in `commands.json`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: SortableJS drag-to-reorder with filtered view support"
```

---

### Task 9: Update edit modal markup for tag chips

**Files:**
- Modify: `src/renderer/index.html:96-98`

- [ ] **Step 1: Replace the group input with tag chip markup**

In `src/renderer/index.html`, replace lines 96–98:
```html
        <label>Group / Tag
          <input type="text" id="f-group" placeholder="e.g. Audio, Gaming, Sync…" />
        </label>
```
with:
```html
        <label>Tags
          <div class="tag-input-wrap" id="f-tags-wrap">
            <input type="text" id="f-tags-input" placeholder="Add tag…" list="tags-datalist" autocomplete="off" />
          </div>
          <datalist id="tags-datalist"></datalist>
        </label>
```

- [ ] **Step 2: Verify the modal opens without errors**

Run `npm start`, click "+ New Command". The modal should open. The Tags field will look unstyled for now (CSS is Task 10). No JS errors should appear.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: replace group input with tag chip markup in edit modal"
```

---

### Task 10: Tag chip CSS

**Files:**
- Modify: `src/renderer/style.css` — add after `.card-btn-delete:hover` rule (after line 320)

- [ ] **Step 1: Add tag chip styles**

In `src/renderer/style.css`, add after the `.card-btn-delete:hover` rule (line 320):

```css
/* ── Tag chip input ─────────────────────────────────────────────────────────── */
.tag-input-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: var(--radius);
  min-height: 36px;
  cursor: text;
}
.tag-input-wrap:focus-within {
  border-color: var(--accent2);
  outline: none;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(34, 211, 238, 0.1);
  border: 1px solid rgba(34, 211, 238, 0.25);
  color: var(--accent2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}
.tag-chip-remove {
  background: none;
  border: none;
  color: var(--accent2);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
  opacity: 0.6;
  transition: opacity 0.1s;
}
.tag-chip-remove:hover { opacity: 1; }
#f-tags-input {
  border: none;
  background: none;
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  outline: none;
  flex: 1;
  min-width: 80px;
  padding: 0;
}
```

- [ ] **Step 2: Verify chip styles in the app**

Run `npm start`, open the Add Command modal. The Tags field should look like a bordered chip container with a text input inside. No chips yet — JS is Task 11.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/style.css
git commit -m "feat: add tag chip input CSS"
```

---

### Task 11: Tag chip interaction logic

**Files:**
- Modify: `src/renderer/app.js` — state block, openModal, modal-save handler

- [ ] **Step 1: Add modalTags state and renderTagChips function**

In `src/renderer/app.js`, after the `let editingId = null;` line (line 9), add:

```js
let modalTags = [];
```

Then add the following two functions anywhere before `openModal` (before line 383):

```js
function renderTagChips() {
  const wrap = document.getElementById('f-tags-wrap');
  const input = document.getElementById('f-tags-input');
  // Remove existing chips (leave the input in place)
  wrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
  modalTags.forEach((tag, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<button class="tag-chip-remove" data-index="${i}" tabindex="-1">×</button>`;
    wrap.insertBefore(chip, input);
  });
}

function populateTagsDatalist() {
  const all = [...new Set(config.commands.flatMap(c => c.tags || []).filter(Boolean))];
  const dl = document.getElementById('tags-datalist');
  dl.innerHTML = all.map(t => `<option value="${escHtml(t)}">`).join('');
}
```

- [ ] **Step 2: Wire chip interaction events**

Add the following block after the `document.getElementById('modal-backdrop').addEventListener(...)` call (after line 431):

```js
// Tag chip input events
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
  // Handle datalist selection (fires 'change' when an option is picked)
  const tag = e.target.value.trim();
  if (tag && !modalTags.includes(tag)) {
    modalTags.push(tag);
    e.target.value = '';
    renderTagChips();
  }
});
```

- [ ] **Step 3: Update openModal to use tags**

In `src/renderer/app.js`, replace `openModal` (lines 383–396):

```js
function openModal(cmd = null) {
  editingId = cmd?.id || null;
  document.getElementById('modal-title').textContent = cmd ? 'Edit Command' : 'New Command';
  document.getElementById('f-label').value = cmd?.label || '';
  document.getElementById('f-note').value = cmd?.note || '';
  document.getElementById('f-type').value = cmd?.type || 'toggle';
  document.getElementById('f-on').value = cmd?.onCmd || cmd?.launchCmd || '';
  document.getElementById('f-off').value = cmd?.offCmd || '';
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  modalTags = [...(cmd?.tags || [])];
  populateTagsDatalist();
  renderTagChips();
  document.getElementById('f-tags-input').value = '';
  updateModalFields();
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('f-label').focus();
}
```

- [ ] **Step 4: Update modal-save handler to write tags**

In `src/renderer/app.js`, replace the `modal-save` click handler (lines 433–463). The key change is replacing `group: document.getElementById('f-group').value.trim()` with `tags: [...modalTags]`:

```js
document.getElementById('modal-save').addEventListener('click', async () => {
  const label = document.getElementById('f-label').value.trim();
  const type = document.getElementById('f-type').value;
  const onCmd = document.getElementById('f-on').value.trim();
  if (!label || !onCmd) { alert('Label and command are required.'); return; }

  // Flush any partially-typed tag in the input
  const tagInput = document.getElementById('f-tags-input');
  const pending = tagInput.value.trim();
  if (pending && !modalTags.includes(pending)) modalTags.push(pending);
  tagInput.value = '';

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

- [ ] **Step 5: Verify the full tag flow**

Run `npm start` and confirm:
- Opening "New Command" shows empty Tags field
- Typing a tag name and pressing Enter converts it to a chip
- Typing a tag name and pressing comma converts it to a chip
- Clicking `×` on a chip removes it
- Backspace on empty input removes the last chip
- The datalist shows existing tags as you type
- Saving a command writes `tags` array to `commands.json` (no `group` field)
- Editing a command pre-populates its tags as chips
- Sidebar TAGS list updates to include new tags

- [ ] **Step 6: Run all tests to confirm nothing broken**

```bash
node --test test/utils.test.js test/tray-icon.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/app.js
git commit -m "feat: tag chip input — add/remove chips, datalist autocomplete, openModal and save wired up"
```
