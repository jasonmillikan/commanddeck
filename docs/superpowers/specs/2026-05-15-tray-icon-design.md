# Tray Icon Design

**Date:** 2026-05-15
**Status:** Approved

## Overview

CommandDeck currently shows an invisible tray icon (empty `nativeImage`) because `assets/tray-icon.png` does not exist. This spec defines a stateful, programmatically-generated tray icon that communicates app state at a glance — no static image files, no extra dependencies, no build step.

## Visual Design

**Shape:** 2×2 grid of rounded squares on a dark background.
**Canvas size:** 22×22px (standard Ubuntu system tray size).
**Background:** `#0c0e14` with `rx=3` rounded corners.
**Active square fill:** `#4ade80` (terminal green, matches app accent).
**Idle square:** outlined only, `#3a4060` stroke, no fill.
**Square geometry:** each cell is 8×8px with `rx=1.5`, arranged in a 2×2 grid with 2px gap and 2px outer padding.

The grid reads as a miniature "command deck" — a board of toggleable cards. Filled squares = running processes.

## States

The icon reflects the live process count and any unexpected exit events.

| State | Trigger | Filled Squares | Badge |
|---|---|---|---|
| **Idle** | 0 processes running | 0 (all dim outlines) | none |
| **Active** | 1–3 processes running | 1–3 squares filled (top-left → bottom-right → top-right → bottom-left fill order) | none |
| **Full** | 4+ processes running | All 4 filled | none |
| **Alert — red** | Any foreground/launcher process exited with code ≠ 0 (crash) | Reflects current count | Red circle (`#f87171`), 3px radius, top-right corner |
| **Alert — amber** | Any process exited with code 0 but not killed by the user (unexpected clean exit) | Reflects current count | Amber circle (`#fbbf24`), 3px radius, top-right corner |

**Fill order for 1–3 squares:** top-left, bottom-right, top-right. This diagonal pattern reads clearly at 22px and avoids an L-shape that could look like an error indicator.

**Badge position:** cx=19, cy=3 (top-right, slightly outside the grid, overlapping the icon border). Crisp at 22px.

**Multiple alerts:** if both red and amber events are pending, red takes priority.

## Alert Lifecycle

- **Set:** when `process-exited` IPC event fires and the exit was not user-initiated (i.e. the user did not call `killProcess()` for that pid).
- **Clear:** automatically when `mainWindow` is shown (either via tray click or "Show CommandDeck" menu item). Opening the window implies the user has seen/acknowledged the state.
- **No persistence:** alert state is in-memory only. App restart clears it.

## Implementation Approach

Icon is generated programmatically in `main.js` at runtime — no static image files, no extra npm packages.

**Approach:** A helper function `buildTrayIcon(runningCount, alertLevel)` constructs an SVG string for the given state, base64-encodes it, and passes it to `nativeImage.createFromDataURL('data:image/svg+xml;base64,...')`. Electron v29+ on Linux resolves SVG data URLs through its Chromium layer, producing a crisp `nativeImage` ready for `tray.setImage()`.

**Fallback** (if SVG data URLs prove unreliable at runtime): pre-render the 5 icon variants as inline base64 PNG string constants in a `src/tray-icons.js` module, generated once by a small dev script `scripts/gen-tray-icons.js` that launches a hidden Electron `BrowserWindow`, draws each state on a `<canvas>`, and calls `toDataURL('image/png')`.

**User-initiated kill tracking:** `liveProcesses` entries gain a `userKilled: boolean` field (default `false`). `kill-process` IPC handler sets `userKilled: true` on the entry before calling `SIGTERM`. The `process-exited` handler checks this flag — if `true`, the exit is expected and no alert is raised; if `false`, alert state is set based on exit code.

## Icon Update Triggers

`tray.setImage()` is called (synchronously) whenever:

1. App startup — after `createTray()`, set to current state (idle on fresh start).
2. `process-exited` event received in main — recompute state, update icon.
3. `mainWindow` `show` event — clear any alert badge, recompute state, update icon.
4. `run-command` IPC handler completes successfully — a new process is live, update count.
5. `kill-process` IPC handler completes — process count drops, update icon.

## Files Changed

| File | Change |
|---|---|
| `src/main.js` | Add `buildTrayIcon(state)`, `updateTrayIcon()`, call on all trigger points |
| `src/main.js` | Track user-initiated kills in `liveProcesses` to distinguish crash from clean exit |
| `assets/` | Directory created (was missing); no static icon files needed |

## Out of Scope

- Animated icons (e.g. pulsing on alert) — deferred.
- Per-command icon state (showing which specific command crashed) — deferred; tooltip handles this.
- Windows/macOS icon sizes — Ubuntu 22 (22×22) is the only target for now.
