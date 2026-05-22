# CSS Refactor — Shared Patterns (Approach A)

**Date:** 2026-05-22
**Branch:** `feature/css-refactor`
**Scope:** `src/renderer/style.css`, `src/renderer/index.html`, `src/renderer/utils.js`, `src/renderer/help-modal.js`, `src/renderer/app.js`

## Goal

Consolidate duplicated CSS patterns into shared base classes without changing any visual output. No architectural change — style.css stays one file, no build step added.

## Patterns

### 1. Badge system (`type-badge`)

**Problem:** Two independent sets of color rules for the same four command types — one on card type badges, one in the help modal.

**Solution:**
- Add `.type-badge` base class: `font-family: var(--font-mono); font-weight: 600; letter-spacing: 0.08em; border-radius: 3px;`
- Add color modifier classes (shared by both contexts):
  - `.type-toggle` — cyan
  - `.type-launcher` — amber
  - `.type-foreground` — green
  - `.type-cheatsheet` — purple
- `.card-type-badge` keeps its layout properties: `font-size: 9px; padding: 2px 6px; flex-shrink: 0; margin-top: 2px;`
- `.help-type-badge` keeps its layout properties: `font-size: 10px; padding: 3px 8px; margin-top: 2px; white-space: nowrap;`
- Remove `.badge-toggle/launcher/foreground/cheatsheet` and `.help-type-badge.toggle/launcher/foreground/cheatsheet`

**JS/HTML:** In `cards.js`, replace `badge-${type}` with `type-${type}` in the badge class string. In `index.html`, replace `help-type-badge toggle` → `help-type-badge type-toggle` (modifier class is replaced, wrapper class stays).

### 2. Panel surface (`.content-panel`)

**Problem:** `.help-type-row` and `.help-example` repeat the same three surface properties.

**Solution:**
- Add `.content-panel`: `background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);`
- Both elements keep their own classes for layout (padding, flex, gap, margin-bottom)

**HTML:** Add `content-panel` to `.help-type-row` and `.help-example` elements

### 3. Section labels (`.section-label`)

**Problem:** Four "small caps label" elements repeat the same four typographic properties.

**Solution:**
- Add `.section-label`: `font-size: 10px; font-weight: 700; letter-spacing: 0.12em; color: var(--text-dim);`
- Each existing class keeps only its unique properties:
  - `.sidebar-section-label` keeps: `padding: 8px 6px 4px;`
  - `.prefs-section-label` keeps: `margin-top: 6px; padding-top: 12px; padding-bottom: 2px; border-top: 1px solid var(--border);`
  - `.help-nav-label` keeps: `font-size: 9px; padding: 6px 8px 4px;` (overrides font-size)
  - `.help-section-label` keeps: `margin-bottom: 10px;`

**HTML:** Add `section-label` alongside each existing class

### 4. Nav items (`.nav-item`)

**Problem:** `.group-item` and `.help-nav-item` have identical base properties, hover, and active states with minor expression differences. `.group-item` also has a 2px layout shift on activate (no border reserved).

**Solution:**
- Add `.nav-item` base:
  ```css
  padding: 7px 10px;
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text-mid);
  font-size: 13px;
  transition: all 0.12s;
  border-left: 2px solid transparent;
  ```
- Add `.nav-item:hover`: `background: var(--bg3); color: var(--text);`
- Add `.nav-item.active`: `background: var(--bg3); color: var(--accent); border-left-color: var(--accent); padding-left: 8px;`
- `.group-item` and `.help-nav-item` become near-empty (kept as anchors for future overrides)
- Remove duplicate hover/active rules from both classes

**HTML:** Add `nav-item` alongside `.group-item` and `.help-nav-item` elements. Fixes the 2px layout-shift bug on sidebar items as a side effect.

## Shared Patterns block placement

Insert a `/* ── Shared Patterns ──── */` section in `style.css` just before the `/* ── Title bar ──── */` section (after Variables/Reset/Scrollbar). All four new base classes go here.

## Constraints

- All changes are appearance-preserving — no color, size, or layout changes
- Component wrapper class names (`.card-type-badge`, `.help-type-badge`, `.group-item`, `.help-nav-item`, etc.) are kept — only their duplicated properties are removed. Old modifier classes (`.badge-*`, `.help-type-badge.*`) are removed from CSS and replaced in HTML/JS simultaneously.
- No new files, no bundler, no `@import`
- Branch: `feature/css-refactor` off `master`

## Success criteria

- `npm start` shows no visual difference vs. pre-refactor
- All four patterns verified in UI: card badges, help modal badges, help type rows, help examples, all section labels, sidebar nav, help nav
- `style.css` loses ~40 lines net
