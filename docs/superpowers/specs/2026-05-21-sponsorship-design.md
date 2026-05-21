---
name: Sponsorship & Donation Support
description: Add GitHub Sponsors + Ko-fi support via FUNDING.yml, README section, and in-app Preferences modal strip
type: project
---

# Sponsorship & Donation Support

## Overview

CommandDeck is heading toward packaged releases and GitHub distribution. Many users will install the app without ever reading the README. This feature adds tasteful, low-pressure sponsorship support in three places: the GitHub repo (FUNDING.yml), the README, and the in-app Preferences modal.

Tone throughout: warm and appreciative, never pushy. The ask should feel like a note from the author, not a fundraising campaign.

## Deliverable 1 — `.github/FUNDING.yml`

**New file:** `.github/FUNDING.yml`

Tells GitHub to display a "Sponsor" button on the repository header. Two platforms:

```yaml
github: YOUR_GITHUB_USERNAME
ko_fi: YOUR_KOFI_USERNAME
```

Both values are placeholders to be filled in once the user has their GitHub Sponsors profile and Ko-fi page set up.

## Deliverable 2 — README Support Section

**File:** `README.md`

Add a new `## Support` section placed between `## Roadmap (future ideas)` and `## License`. Separated from adjacent sections with a `---` horizontal rule above it (consistent with the rest of the README).

```markdown
---

## Support

If CommandDeck saves you time or friction, a small sponsorship would be deeply appreciated.
GitHub Sponsors is the easiest way to help — Ko-fi works too if you prefer.

- **[GitHub Sponsors](https://github.com/sponsors/YOUR_GITHUB_USERNAME)** — recurring or one-time, directly on GitHub
- **[Ko-fi](https://ko-fi.com/YOUR_KOFI_USERNAME)** — buy me a coffee, no account needed
```

No badges, no images — plain prose and links only, matching the README's utilitarian style.

## Deliverable 3 — In-App Preferences Modal Strip

A thin, passive strip inserted between the `modal-body` and `modal-footer` of the Preferences dialog. Always visible; no dismiss control. Clicking the sponsor link opens GitHub Sponsors in the system browser.

### Visual Design

- **Background:** `#0c0e14` (darkest app bg layer) with top/bottom `1px` borders at `#2a2f45`
- **Layout:** full-width, `~36px` tall, single line — heart icon + sentence + link
- **Text:** `11px`, muted (`#4b5673`), monospace (matching app font)
- **Heart icon:** `#f87171` (red accent)
- **Link:** `#4ade80` (green accent), no underline, opens via `shell.openExternal()`
- **Light theme:** background `#e8e8e0`, borders `#ccc`, text `#999`, link `#15803d`
- **Copy:** `♥ Enjoying CommandDeck? Sponsor this project — it means a lot.`

### Implementation

**`src/renderer/index.html`**
Add a `.prefs-sponsor` div directly between `<div class="modal-body">…</div>` and `<div class="modal-footer">` inside `#prefs-modal`:

```html
<div class="prefs-sponsor">
  <span class="prefs-sponsor-heart">♥</span>
  Enjoying CommandDeck?
  <a href="#" id="prefs-sponsor-link">Sponsor this project</a>
  — it means a lot.
</div>
```

**`src/renderer/style.css`**
New `.prefs-sponsor` block. Also add `[data-theme="light"] .prefs-sponsor` override in `theme-light.css`.

**`src/renderer/prefs-modal.js`**
Wire click handler for `#prefs-sponsor-link` → `window.api.openExternal('https://github.com/sponsors/YOUR_GITHUB_USERNAME')`.

**`src/main/preload.js`**
Expose new method on `contextBridge`:
```js
openExternal: (url) => ipcRenderer.invoke('open-external', url)
```

**`src/main/ipc-handlers.js`**
Register handler:
```js
ipcMain.handle('open-external', (_e, url) => shell.openExternal(url))
```
`shell` is already imported in the main process for `openLog` / `openLogDir`.

## Out of Scope

- Ko-fi link in the in-app strip — GitHub Sponsors is the primary CTA; the README covers Ko-fi for users who read it
- Dismiss / "don't show again" toggle — keeping it passive and always-visible avoids storing extra pref state
- Any analytics or click tracking
