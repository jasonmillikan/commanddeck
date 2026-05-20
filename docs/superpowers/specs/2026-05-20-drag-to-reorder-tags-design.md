# Drag-to-Reorder Cards + Tags Design

**Date:** 2026-05-20
**Branch:** feature/drag-to-reorder-tags

## Overview

Two tightly coupled changes: replace the single `group` field with a multi-value `tags` array, and add drag-to-reorder for cards using SortableJS. The data model change is a prerequisite for the ordering story — with a single flat order (no per-group ordering complexity), drag-to-reorder becomes straightforward.

---

## 1. Data Model

### Schema change

`group` (string) is replaced by `tags` (string array):

```json
{
  "id": "abc123",
  "label": "Audio Loopback",
  "type": "toggle",
  "tags": ["Audio", "Monitoring"],
  "onCmd": "pactl load-module module-loopback latency_msec=1",
  "offCmd": "pactl unload-module module-loopback"
}
```

### Migration

On `loadConfig()`, before returning data to the renderer:

1. For any command that has `group` but no `tags`: convert to `tags: [group]`, drop `group`
2. If any migration occurred, immediately call `saveConfig()` to persist
3. Commands with neither `group` nor `tags` get `tags: []`

Migration is silent and lossless. After first run, the old `group` field is gone.

### Ordering

Card order is the sole authority of the `config.commands` array index. There is no per-tag ordering. After any drag operation, the reordered array is persisted immediately via `saveConfig()`.

---

## 2. Tags UI in the Edit Modal

The current single "Group" text input is replaced by a tag chip input:

- Existing tags render as removable chips: `Audio ×` `Monitoring ×`
- A text input sits below/after the chips
- Typing shows a native `<datalist>` autocomplete dropdown populated with all tags currently in use across all commands (deduped case-insensitively, first-seen casing shown)
- **Enter** or **,** confirms a typed tag and converts it to a chip
- **Backspace** on an empty input removes the last chip
- Tags are stored as-typed (case-preserving); autocomplete deduplicates case-insensitively
- The field label changes from "Group" to "Tags"

---

## 3. Sidebar Tag Filter

Minimal changes — behavior is the same, source data changes:

- Tag list derived from `tags` arrays across all commands (instead of `group` field)
- Clicking a tag filters to commands whose `tags` array includes that tag
- A command with `tags: ["Audio", "Monitoring"]` appears under both filters
- "all" item at top remains unchanged
- No visual changes to the sidebar

---

## 4. Drag Handle

Each card gets a left-edge handle strip:

- ~28px wide, full card height, rendered as the first child inside `.card`
- Existing card content shifts right by 28px (via padding or flex layout adjustment)
- Contains a grip icon (`⠿`) centered vertically
- Default: `color: var(--text-dim)`, `opacity: 0.4`
- Hover: `color: var(--text)`, `opacity: 1`
- `cursor: grab` on the handle; `cursor: grabbing` while actively dragging
- Card's left `border-radius` is preserved by applying it to the handle strip

---

## 5. SortableJS Integration

### Installation & loading

```
npm install sortablejs
```

Loaded in `index.html` before `app.js`:

```html
<script src="../../node_modules/sortablejs/Sortable.min.js"></script>
```

### Initialization

Sortable is initialized on `#cards-container` after every `renderCards()` call (since `innerHTML` replacement destroys and recreates DOM nodes). The previous Sortable instance must be destroyed first to avoid duplicate handlers and memory leaks:

```js
if (sortableInstance) sortableInstance.destroy();
sortableInstance = Sortable.create(container, {
  handle: '.card-drag-handle',
  animation: 150,
  onEnd: handleDragEnd,
});
```

`sortableInstance` is a module-level variable in `app.js`.

### Reorder persistence (`handleDragEnd`)

1. Read new DOM order: `[...container.querySelectorAll('[data-id]')].map(el => el.dataset.id)`
2. Reorder `config.commands` to match
3. Call `saveConfig(config)`

### Filtered view behavior

When a tag filter is active, only a subset of cards is visible in the DOM. Dragging within a filtered view reorders only those cards among their existing positions in the full array — non-visible cards are not affected.

Algorithm:
1. Collect visible card IDs in new DOM order
2. Find the indices those cards occupied in `config.commands` (before the drag)
3. Sort those indices ascending
4. Place the newly-ordered visible commands back at those same indices
5. All other commands remain at their original indices

Example: full array `[A, B, C, D, E]`, filter shows `[A, C, D]`, user drags D before C → full array becomes `[A, B, D, C, E]`.

---

## 6. Files Affected

| File | Change |
|---|---|
| `package.json` | Add `sortablejs` dependency |
| `src/renderer/index.html` | Add SortableJS `<script>` tag; update edit modal group input → tag chip input markup |
| `src/renderer/style.css` | Add `.card-drag-handle` styles; add tag chip styles; update `.card` left padding |
| `src/renderer/app.js` | Migration logic in `loadConfig` handler; update `renderCard` to include handle; update `renderCards` to init Sortable; add `handleDragEnd`; update edit modal save/load for `tags`; update sidebar tag derivation |
| `src/main.js` | No changes required |
| `src/preload.js` | No changes required |

---

## 7. Out of Scope

- `checkCmd` field for verifying real system toggle state (noted in CLAUDE.md as a follow-on)
- Collapsible tag sections on the board
- Drag-to-assign-tag (dragging a card onto a sidebar tag item to add that tag)
- Touch/mobile support (Linux desktop target only)
