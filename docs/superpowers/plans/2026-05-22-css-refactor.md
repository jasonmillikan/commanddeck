# CSS Refactor — Shared Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate four duplicated CSS patterns into shared base classes across `style.css`, `utils.js`, `help-modal.js`, `index.html`, and `app.js` — no visual changes.

**Architecture:** Add a `/* ── Shared Patterns ── */` block near the top of `style.css` (after Scrollbar, before Title bar) containing four new base classes. Then strip the duplicated properties from each component class, and add the base class names to the relevant HTML strings in JS and HTML.

**Tech Stack:** Vanilla CSS, vanilla JS ES modules, Node.js test runner (`node:test`)

---

### Files changed

- Modify: `src/renderer/style.css` — add Shared Patterns block; strip duplicated props from component classes
- Modify: `src/renderer/utils.js` — update `badgeFor()` to emit `type-<type>` instead of `badge-<type>`
- Modify: `src/renderer/help-modal.js` — update badge, panel, section label, and nav item class strings
- Modify: `src/renderer/index.html` — add base class names to section label and nav item elements
- Modify: `src/renderer/app.js` — add `nav-item` to dynamically generated group items
- Modify: `test/utils.test.js` — add `badgeFor` tests

---

## Task 1: Create branch and add Shared Patterns block (additive only)

**Files:**
- Create branch: `feature/css-refactor`
- Modify: `src/renderer/style.css`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/css-refactor
```

- [ ] **Step 2: Insert the Shared Patterns block in style.css**

Locate the line `/* ── Title bar ─────` in `style.css` (currently around line 75). Insert the following block immediately before it:

```css
/* ── Shared Patterns ──────────────────────────────────────────────────────── */
.type-badge {
  font-family: var(--font-mono);
  border-radius: 3px;
}
.type-toggle     { background: rgba(34, 211, 238, 0.12); color: var(--accent2); border: 1px solid rgba(34, 211, 238, 0.2); }
.type-launcher   { background: rgba(251, 191, 36,  0.12); color: var(--warn);    border: 1px solid rgba(251, 191, 36,  0.2); }
.type-foreground { background: rgba(74,  222, 128, 0.12); color: var(--accent);  border: 1px solid rgba(74,  222, 128, 0.2); }
.type-cheatsheet { background: rgba(167, 139, 250, 0.12); color: #a78bfa;        border: 1px solid rgba(167, 139, 250, 0.2); }

.content-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
}

.nav-item {
  padding: 7px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 13px;
  transition: all 0.12s;
  border-left: 2px solid transparent;
}
.nav-item:hover  { background: var(--bg3); color: var(--text); }
.nav-item.active { background: var(--bg3); color: var(--accent); border-left-color: var(--accent); padding-left: 8px; }

```

- [ ] **Step 3: Verify the app still looks correct**

```bash
npm start
```

Open the app. Everything should look identical — no new classes are applied to HTML yet. Close the app (`Ctrl+C` in the terminal).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/style.css
git commit -m "refactor(css): add Shared Patterns block — type-badge, content-panel, section-label, nav-item"
```

---

## Task 2: Badge system — test, CSS, and JS

**Files:**
- Modify: `test/utils.test.js`
- Modify: `src/renderer/utils.js`
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/help-modal.js`

- [ ] **Step 1: Write the failing test**

Open `test/utils.test.js` and add the following block at the end of the file:

```js
let badgeFor;
before(async () => {
  ({ badgeFor } = await import('../src/renderer/utils.js'));
});

test('badgeFor: emits type- modifier class for each command type', () => {
  for (const type of ['toggle', 'launcher', 'foreground', 'cheatsheet']) {
    const html = badgeFor(type);
    assert.ok(html.includes(`type-${type}`), `expected type-${type} in: ${html}`);
    assert.ok(!html.includes(`badge-${type}`), `unexpected badge-${type} in: ${html}`);
  }
});
```

Note: the `before()` call at the top of the existing file already imports `migrateCommands` and `applyReorder`. Add a second `before()` at the end for `badgeFor` — Node's test runner runs all `before()` hooks before tests in their scope.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test 2>&1 | grep -A 3 "badgeFor"
```

Expected: FAIL — `expected type-toggle in: <span class="card-type-badge badge-toggle">TOGGLE</span>`

- [ ] **Step 3: Update `badgeFor()` in utils.js**

Replace the existing `badgeFor` function (lines 40–44):

```js
export function badgeFor(type) {
  const map = { toggle: 'badge-toggle', launcher: 'badge-launcher', foreground: 'badge-foreground', cheatsheet: 'badge-cheatsheet' };
  const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
  return `<span class="card-type-badge ${map[type]}">${labels[type]}</span>`;
}
```

With:

```js
export function badgeFor(type) {
  const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
  return `<span class="card-type-badge type-badge type-${type}">${labels[type]}</span>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test 2>&1 | grep -A 3 "badgeFor"
```

Expected: PASS

- [ ] **Step 5: Update the badge class string in help-modal.js**

In `help-modal.js`, find line 186:

```js
        <span class="help-type-badge ${t.type}">${t.type.toUpperCase()}</span>
```

Replace with:

```js
        <span class="help-type-badge type-badge type-${t.type}">${t.type.toUpperCase()}</span>
```

- [ ] **Step 6: Strip duplicated properties from `.card-type-badge` in style.css**

Find `.card-type-badge` (currently around line 293 — search for `.card-type-badge {`). Replace the full rule:

```css
.card-type-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
  margin-top: 2px;
}
```

With (removing font-family and border-radius, which now come from `.type-badge`):

```css
.card-type-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  flex-shrink: 0;
  margin-top: 2px;
}
```

- [ ] **Step 7: Remove the four `.badge-*` color rules from style.css**

Find and delete these four lines (immediately after `.card-type-badge`):

```css
.badge-toggle  { background: rgba(34, 211, 238, 0.12); color: var(--accent2); border: 1px solid rgba(34, 211, 238, 0.2); }
.badge-launcher{ background: rgba(251, 191, 36, 0.12); color: var(--warn);    border: 1px solid rgba(251, 191, 36, 0.2); }
.badge-foreground{ background: rgba(74, 222, 128, 0.12); color: var(--accent); border: 1px solid rgba(74, 222, 128, 0.2); }
.badge-cheatsheet{ background: rgba(167,139,250,0.12); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }
```

- [ ] **Step 8: Strip duplicated properties from `.help-type-badge` in style.css**

Find `.help-type-badge {` (in the Help Modal section). Replace the full rule:

```css
.help-type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 3px;
  white-space: nowrap;
  margin-top: 2px;
  font-family: var(--font-mono);
}
```

With (removing font-family and border-radius, which now come from `.type-badge`):

```css
.help-type-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  white-space: nowrap;
  margin-top: 2px;
}
```

- [ ] **Step 9: Remove the four `.help-type-badge.*` color rules from style.css**

Find and delete these four lines (immediately after `.help-type-badge`):

```css
.help-type-badge.toggle     { background: rgba(34,211,238,0.13);  color: var(--accent2); border: 1px solid rgba(34,211,238,0.2); }
.help-type-badge.launcher   { background: rgba(251,191,36,0.13);  color: var(--warn);    border: 1px solid rgba(251,191,36,0.2); }
.help-type-badge.foreground { background: rgba(74,222,128,0.13);  color: var(--accent);  border: 1px solid rgba(74,222,128,0.2); }
.help-type-badge.cheatsheet { background: rgba(167,139,250,0.13); color: #a78bfa;        border: 1px solid rgba(167,139,250,0.27); }
```

- [ ] **Step 10: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 11: Verify visually**

```bash
npm start
```

Check: card badges (toggle/launcher/foreground/cheatsheet) look identical. Open Help (? button) → Overview tab — all four type badges look identical. Close app.

- [ ] **Step 12: Commit**

```bash
git add test/utils.test.js src/renderer/utils.js src/renderer/style.css src/renderer/help-modal.js
git commit -m "refactor(css): consolidate badge color rules into type-toggle/launcher/foreground/cheatsheet"
```

---

## Task 3: Panel surface consolidation

**Files:**
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/help-modal.js`

- [ ] **Step 1: Strip surface properties from `.help-type-row` in style.css**

Find `.help-type-row {` in the Help Modal section. Replace the full rule:

```css
.help-type-row {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 13px 16px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 10px;
}
```

With:

```css
.help-type-row {
  padding: 13px 16px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 10px;
}
```

- [ ] **Step 2: Strip surface properties from `.help-example` in style.css**

Find `.help-example {`. Replace the full rule:

```css
.help-example {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 14px 16px;
  margin-bottom: 10px;
}
```

With:

```css
.help-example {
  padding: 14px 16px;
  margin-bottom: 10px;
}
```

- [ ] **Step 3: Add `content-panel` to help-type-row in help-modal.js**

In `help-modal.js`, find line 185:

```js
      <div class="help-type-row">
```

Replace with:

```js
      <div class="help-type-row content-panel">
```

- [ ] **Step 4: Add `content-panel` to help-example in help-modal.js**

In `help-modal.js`, find line 204:

```js
      <div class="help-example">
```

Replace with:

```js
      <div class="help-example content-panel">
```

- [ ] **Step 5: Verify visually**

```bash
npm start
```

Open Help → Overview tab. The four type-row cards should look identical (same background, border, radius). Open Help → any command type tab. The starter example block should look identical. Close app.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/style.css src/renderer/help-modal.js
git commit -m "refactor(css): extract content-panel for help-type-row and help-example surface"
```

---

## Task 4: Section label consolidation

**Files:**
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/help-modal.js`

- [ ] **Step 1: Strip shared properties from `.sidebar-section-label` in style.css**

Find `.sidebar-section-label {`. Replace the full rule:

```css
.sidebar-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  padding: 8px 6px 4px;
}
```

With:

```css
.sidebar-section-label { padding: 8px 6px 4px; }
```

- [ ] **Step 2: Strip shared properties from `.prefs-section-label` in style.css**

Find `.prefs-section-label {`. Replace the full rule:

```css
.prefs-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  margin-top: 6px;
  padding-top: 12px;
  padding-bottom: 2px;
  border-top: 1px solid var(--border);
}
```

With:

```css
.prefs-section-label {
  margin-top: 6px;
  padding-top: 12px;
  padding-bottom: 2px;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 3: Strip shared properties from `.help-nav-label` in style.css**

Find `.help-nav-label {`. Replace the full rule:

```css
.help-nav-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  padding: 6px 8px 4px;
}
```

With (keeping `font-size: 9px` because it overrides the 10px in `.section-label`):

```css
.help-nav-label { font-size: 9px; padding: 6px 8px 4px; }
```

- [ ] **Step 4: Strip shared properties from `.help-section-label` in style.css**

Find `.help-section-label {`. Replace the full rule:

```css
.help-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--text-dim);
  margin-bottom: 10px;
}
```

With:

```css
.help-section-label { margin-bottom: 10px; }
```

- [ ] **Step 5: Add `section-label` to sidebar label in index.html**

Find line 42 in `index.html`:

```html
      <div class="sidebar-section-label">TAGS</div>
```

Replace with:

```html
      <div class="sidebar-section-label section-label">TAGS</div>
```

- [ ] **Step 6: Add `section-label` to the three prefs section labels in index.html**

Find and replace all three `prefs-section-label` divs in `index.html` (lines 137, 152, 157):

```html
        <div class="prefs-section-label">APPEARANCE</div>
```
→
```html
        <div class="prefs-section-label section-label">APPEARANCE</div>
```

```html
        <div class="prefs-section-label">STARTUP</div>
```
→
```html
        <div class="prefs-section-label section-label">STARTUP</div>
```

```html
        <div class="prefs-section-label">NOTIFICATIONS</div>
```
→
```html
        <div class="prefs-section-label section-label">NOTIFICATIONS</div>
```

- [ ] **Step 7: Add `section-label` to help-nav-label in help-modal.js**

In `help-modal.js`, find line 154:

```js
  nav.innerHTML = '<div class="help-nav-label">SECTIONS</div>' +
```

Replace with:

```js
  nav.innerHTML = '<div class="help-nav-label section-label">SECTIONS</div>' +
```

- [ ] **Step 8: Add `section-label` to help-section-label in help-modal.js**

In `help-modal.js`, find line 183:

```js
    <div class="help-section-label">CARD TYPES AT A GLANCE</div>
```

Replace with:

```js
    <div class="help-section-label section-label">CARD TYPES AT A GLANCE</div>
```

Then find line 202:

```js
    ${starters.length ? `<div class="help-section-label">STARTER EXAMPLE</div>` : ''}
```

Replace with:

```js
    ${starters.length ? `<div class="help-section-label section-label">STARTER EXAMPLE</div>` : ''}
```

- [ ] **Step 9: Verify visually**

```bash
npm start
```

Check: "TAGS" label in sidebar looks identical. Open Preferences (⚙) — "APPEARANCE", "STARTUP", "NOTIFICATIONS" labels look identical. Open Help — "SECTIONS" nav label and "CARD TYPES AT A GLANCE" label look identical. Open a command type tab — "STARTER EXAMPLE" label looks identical. Close app.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/style.css src/renderer/index.html src/renderer/help-modal.js
git commit -m "refactor(css): extract section-label base class for sidebar, prefs, and help labels"
```

---

## Task 5: Nav item consolidation

**Files:**
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/help-modal.js`

- [ ] **Step 1: Remove all `.group-item` CSS rules from style.css**

Find and delete the following three rules in the Sidebar section:

```css
.group-item {
  padding: 7px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 13px;
  transition: all 0.12s;
}
.group-item:hover { background: var(--bg3); color: var(--text); }
.group-item.active { background: var(--bg3); color: var(--accent); border-left: 2px solid var(--accent); padding-left: 8px; }
```

(The `.group-item` class name is kept in HTML/JS — it just has no CSS properties of its own now.)

- [ ] **Step 2: Remove all `.help-nav-item` CSS rules from style.css**

Find and delete the following three rules in the Help Modal section:

```css
.help-nav-item {
  padding: 7px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 13px;
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
```

- [ ] **Step 3: Add `nav-item` to the static group item in index.html**

Find line 44 in `index.html`:

```html
        <div class="group-item active" data-group="all">All Commands</div>
```

Replace with:

```html
        <div class="group-item nav-item active" data-group="all">All Commands</div>
```

- [ ] **Step 4: Add `nav-item` to dynamically generated group items in app.js**

In `app.js`, find line 75:

```js
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${escHtml(t)}">
```

Replace with:

```js
    <div class="group-item nav-item ${activeGroup === t ? 'active' : ''}" data-group="${escHtml(t)}">
```

- [ ] **Step 5: Add `nav-item` to help nav items in help-modal.js**

In `help-modal.js`, find line 156:

```js
      `<div class="help-nav-item${s.id === _activeSection ? ' active' : ''}" data-section="${s.id}">${s.label}</div>`
```

Replace with:

```js
      `<div class="help-nav-item nav-item${s.id === _activeSection ? ' active' : ''}" data-section="${s.id}">${s.label}</div>`
```

- [ ] **Step 6: Verify visually**

```bash
npm start
```

Check: sidebar tag items (hover and active state) look and behave identically. Switch between "All Commands" and a tag — the active highlight (green left border) should animate correctly with no layout jump. Open Help — nav items (Overview, Toggle, Launcher, Foreground, Cheatsheet) hover and active states look identical. Click between sections — active highlight switches correctly. Close app.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/style.css src/renderer/index.html src/renderer/app.js src/renderer/help-modal.js
git commit -m "refactor(css): extract nav-item base class for sidebar and help modal nav; fix 2px layout-shift on sidebar active"
```

---

## Task 6: Final check

**Files:** Read-only verification

- [ ] **Step 1: Count net lines removed from style.css**

```bash
git diff main..HEAD -- src/renderer/style.css | grep -c "^-"
git diff main..HEAD -- src/renderer/style.css | grep -c "^+"
```

Expected: roughly 60+ lines removed, ~35 lines added (the Shared Patterns block). Net reduction ~40 lines.

- [ ] **Step 2: Full UI verification checklist**

```bash
npm start
```

Work through each item:

1. **Card badges** — add or view all four command types; badges show correct colors (cyan/amber/green/purple)
2. **Help modal badges** — open Help → Overview; all four type rows show correct badge colors
3. **Help content panels** — type rows and starter examples have correct background/border/radius surface
4. **Sidebar section label** — "TAGS" label shows correct dim color and letter-spacing
5. **Prefs section labels** — open Preferences; "APPEARANCE", "STARTUP", "NOTIFICATIONS" have correct styling with top border divider
6. **Help nav label** — open Help; "SECTIONS" label shows correct styling
7. **Help section labels** — "CARD TYPES AT A GLANCE" and "STARTER EXAMPLE" show correct styling
8. **Sidebar nav items** — hover turns bg, active shows green left border with no layout jump
9. **Help nav items** — hover and active states work correctly; clicking between sections switches active highlight

- [ ] **Step 3: Update the spec to reflect actual file scope**

The original spec listed `cards.js` but the badge logic lives in `utils.js` and `help-modal.js`. Open `docs/superpowers/specs/2026-05-22-css-refactor-design.md` and update the Scope line:

```
**Scope:** `src/renderer/style.css`, `src/renderer/index.html`, `src/renderer/utils.js`, `src/renderer/help-modal.js`, `src/renderer/app.js`
```

- [ ] **Step 4: Commit the spec correction and finalize**

```bash
git add docs/superpowers/specs/2026-05-22-css-refactor-design.md
git commit -m "docs: correct spec scope — utils.js and help-modal.js, not cards.js"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feature/css-refactor
```
