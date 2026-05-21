# Light Theme — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

## Summary

Add a light theme ("Paper") to CommandDeck alongside the existing dark theme. The app defaults to following the OS `prefers-color-scheme` setting; users can override to Light or Dark in the Preferences modal. The embedded xterm.js terminal follows the active theme.

---

## Palette — Paper (Light)

| Variable | Dark (current) | Light (Paper) |
|---|---|---|
| `--bg` | `#0c0e14` | `#fafaf7` |
| `--bg2` | `#12151f` | `#f2f2ec` |
| `--bg3` | `#1a1e2e` | `#e8e8e0` |
| `--border` | `#252840` | `#d0d0c4` |
| `--border2` | `#3a3f60` | `#a8a898` |
| `--accent` | `#4ade80` | `#15803d` |
| `--accent2` | `#22d3ee` | `#0369a1` |
| `--danger` | `#f87171` | `#dc2626` |
| `--warn` | `#fbbf24` | `#b45309` |
| `--text` | `#e2e8f0` | `#1a1a14` |
| `--text-dim` | `#64748b` | `#6b7280` |
| `--text-mid` | `#94a3b8` | `#4b5563` |

The accent green is darkened from `#4ade80` → `#15803d` for WCAG contrast on light backgrounds. The brand identity (green-led, terminal aesthetic) is preserved.

---

## Files Changed

| File | Change |
|---|---|
| `src/renderer/theme-light.css` | **new** — `[data-theme="light"]` variable override block only (~20 lines) |
| `src/renderer/index.html` | add `<link>` for `theme-light.css`; add theme radio group to prefs modal markup |
| `src/renderer/style.css` | unchanged — remains the dark default |
| `src/main/prefs.js` | add `theme: "system"` to `DEFAULTS` |
| `src/renderer/prefs-modal.js` | load/save theme radio; live-apply on radio change; revert on Cancel |
| `src/renderer/app.js` | add `initTheme()` and `setTheme(mode)` |
| `src/renderer/terminal.js` | two xterm theme constants; export `setXtermTheme(mode)`; apply at init and on live switch |

No new IPC calls. Theme resolution is entirely renderer-side.

---

## Theme Resolution

```
prefs.theme = "system" → matchMedia("prefers-color-scheme: dark") → "dark" | "light"
prefs.theme = "light"  → "light"
prefs.theme = "dark"   → "dark"
```

`setTheme(mode)` ("light" | "dark"):
1. `document.documentElement.setAttribute("data-theme", mode)` — always set, even for "dark", so JS can read the current theme back from the attribute. Only `[data-theme="light"]` has CSS overrides; `data-theme="dark"` falls through to `:root` defaults.
2. Call `setXtermTheme(mode)` exported from `terminal.js` — iterates `terminalMap` internally and updates `term.options.theme` on each open terminal. Keeps `terminalMap` private to `terminal.js`.

A `matchMedia` listener is registered only when `prefs.theme === "system"`, and unregistered when the user picks a manual override. This prevents ghost OS-change events when the user has locked the theme.

---

## Preferences Modal

New "Appearance" section added at the top of the Preferences modal, above "Global Hotkey":

```
APPEARANCE
○ System   ○ Light   ○ Dark
```

- Radio change fires `setTheme()` immediately (live preview while modal is open)
- Cancel reverts to the theme that was active when the modal opened
- Save persists to `prefs.json` and keeps the current theme

---

## xterm.js Themes

Two constants exported from `terminal.js`:

### Dark
| Slot | Value |
|---|---|
| background | `#0c0e14` |
| foreground | `#e2e8f0` |
| cursor | `#4ade80` |
| black / brightBlack | `#1a1e2e` / `#64748b` |
| red / brightRed | `#f87171` / `#ef4444` |
| green / brightGreen | `#4ade80` / `#86efac` |
| yellow / brightYellow | `#fbbf24` / `#fde68a` |
| blue / brightBlue | `#60a5fa` / `#93c5fd` |
| magenta / brightMagenta | `#c084fc` / `#e879f9` |
| cyan / brightCyan | `#22d3ee` / `#67e8f9` |
| white / brightWhite | `#e2e8f0` / `#f8fafc` |

### Light (Paper)
| Slot | Value |
|---|---|
| background | `#fafaf7` |
| foreground | `#1a1a14` |
| cursor | `#15803d` |
| black / brightBlack | `#4b5563` / `#6b7280` |
| red / brightRed | `#c0392b` / `#dc2626` |
| green / brightGreen | `#15803d` / `#16a34a` |
| yellow / brightYellow | `#92400e` / `#b45309` |
| blue / brightBlue | `#1d4ed8` / `#2563eb` |
| magenta / brightMagenta | `#7c3aed` / `#9333ea` |
| cyan / brightCyan | `#0e7490` / `#0891b2` |
| white / brightWhite | `#374151` / `#1a1a14` |

Yellow goes amber-brown (`#92400e` / `#b45309`) — bright yellow is invisible on cream. White goes dark gray — used as foreground by many CLI tools.

---

## Out of Scope

- **Tray icon theming** — the system tray background is OS-controlled, independent of the app theme. The current `#4ade80` green is legible on both dark and light trays.
- **Per-terminal theme override** — terminal always follows the active app theme. No secondary preference.
