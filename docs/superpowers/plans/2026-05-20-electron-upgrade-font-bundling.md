# Electron Upgrade + Font Bundling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Electron from v29 to v42 and replace Google Fonts CDN links with locally bundled WOFF2 files.

**Architecture:** Two independent changes executed sequentially. The Electron upgrade is a version bump + `npm install` with regression verification against existing tests. Font bundling downloads 6 WOFF2 files via the Google Fonts CSS2 API (Latin subset only), adds `@font-face` declarations to `style.css`, and removes the two external Google Fonts `<link>` tags from `index.html`. Font family names in CSS are unchanged — everything flows through the existing `--font-mono` and `--font-ui` CSS variables.

**Tech Stack:** Electron 42, Node.js npm, Python 3 stdlib (for font download), WOFF2

---

## Files

| File | Change |
|------|--------|
| `package.json` | Bump `electron` from `^29.0.0` to `^42.0.0` |
| `package-lock.json` | Updated by `npm install` |
| `src/renderer/style.css` | Add 6 `@font-face` declarations at the very top |
| `src/renderer/index.html` | Remove 2 Google Fonts `<link>` tags |
| `src/renderer/fonts/jetbrains-mono-400.woff2` | New binary asset |
| `src/renderer/fonts/jetbrains-mono-600.woff2` | New binary asset |
| `src/renderer/fonts/jetbrains-mono-700.woff2` | New binary asset |
| `src/renderer/fonts/syne-400.woff2` | New binary asset |
| `src/renderer/fonts/syne-700.woff2` | New binary asset |
| `src/renderer/fonts/syne-800.woff2` | New binary asset |

---

## Task 1: Establish test baseline

**Files:** none modified

- [ ] **Step 1: Run existing tests**

```bash
npm test
```

Expected: all tests pass. If any fail, stop and fix before proceeding.

---

## Task 2: Upgrade Electron to v42

**Files:**
- Modify: `package.json`
- Updated automatically: `package-lock.json`

- [ ] **Step 1: Bump the version in package.json**

In `package.json`, change line `"electron": "^29.0.0"` to:

```json
"electron": "^42.0.0"
```

- [ ] **Step 2: Install**

```bash
npm install
```

Expected: resolves and installs `electron@42.x.x`, updates `package-lock.json`. No errors.

- [ ] **Step 3: Confirm installed version**

```bash
npx electron --version
```

Expected: prints `v42.x.x`.

- [ ] **Step 4: Run tests — verify no regressions**

```bash
npm test
```

Expected: same tests pass as in Task 1.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade electron from v29 to v42"
```

---

## Task 3: Download font files

**Files:**
- Create: `src/renderer/fonts/` (directory + 6 WOFF2 files)

- [ ] **Step 1: Run font download script**

From the project root:

```bash
python3 -c "
import urllib.request, re, os

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
os.makedirs('src/renderer/fonts', exist_ok=True)

fonts = [
    ('JetBrains+Mono', 'jetbrains-mono', [400, 600, 700]),
    ('Syne',           'syne',           [400, 700, 800]),
]

for family, slug, weights in fonts:
    for w in weights:
        url = f'https://fonts.googleapis.com/css2?family={family}:wght@{w}&display=swap'
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        css = urllib.request.urlopen(req).read().decode()
        urls = re.findall(r'src: url\((https://[^)]+\.woff2)\)', css)
        font_url = urls[-1]  # last entry is the latin subset
        fname = f'src/renderer/fonts/{slug}-{w}.woff2'
        urllib.request.urlretrieve(font_url, fname)
        print(f'Downloaded {fname}')
"
```

Expected output:
```
Downloaded src/renderer/fonts/jetbrains-mono-400.woff2
Downloaded src/renderer/fonts/jetbrains-mono-600.woff2
Downloaded src/renderer/fonts/jetbrains-mono-700.woff2
Downloaded src/renderer/fonts/syne-400.woff2
Downloaded src/renderer/fonts/syne-700.woff2
Downloaded src/renderer/fonts/syne-800.woff2
```

- [ ] **Step 2: Verify all 6 files exist and are non-empty**

```bash
ls -lh src/renderer/fonts/
```

Expected: 6 `.woff2` files, each between 10–80 KB. If any are 0 bytes, the download failed — re-run Step 1.

- [ ] **Step 3: Confirm git will track the font files**

```bash
git status src/renderer/fonts/
```

Expected: shows 6 untracked files. If they appear as ignored, inspect `.gitignore` for any `*.woff2` or `fonts/` patterns (none are present as of this writing, but verify).

- [ ] **Step 4: Commit font files**

```bash
git add src/renderer/fonts/
git commit -m "feat: add locally bundled WOFF2 font files (latin subset)"
```

---

## Task 4: Wire up local fonts

**Files:**
- Modify: `src/renderer/style.css`
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add @font-face declarations at the top of style.css**

Open `src/renderer/style.css`. Insert the following block at the very top of the file, before the existing `/* ── Variables */` comment:

```css
/* ─── Local Fonts ─────────────────────────────────────────────────────────── */
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-400.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-600.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('./fonts/jetbrains-mono-700.woff2') format('woff2');
}
@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('./fonts/syne-400.woff2') format('woff2');
}
@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('./fonts/syne-700.woff2') format('woff2');
}
@font-face {
  font-family: 'Syne';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url('./fonts/syne-800.woff2') format('woff2');
}

```

No other changes to `style.css` — the existing `--font-mono: 'JetBrains Mono', monospace` and `--font-ui: 'Syne', sans-serif` variable definitions on lines 17–18 are correct as-is.

- [ ] **Step 2: Remove Google Fonts link tags from index.html**

Open `src/renderer/index.html`. Delete these two lines (currently lines 7–8):

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@400;700;800&display=swap" rel="stylesheet">
```

The remaining `<link rel="stylesheet" href="style.css" />` line stays unchanged.

- [ ] **Step 3: Verify no googleapis references remain**

```bash
grep -r "googleapis" src/
```

Expected: no output (exit code 1 from grep is fine — means no matches).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/style.css src/renderer/index.html
git commit -m "feat: load fonts locally, remove Google Fonts CDN dependency"
```

---

## Task 5: Smoke test

**Files:** none modified

- [ ] **Step 1: Launch the app**

```bash
npm start
```

- [ ] **Step 2: Visual font check**

Verify in the running app:
- Headings and UI labels (title bar name, tag chips, modal headings) render in **Syne** — a distinct, rounded geometric sans-serif
- Command text, PID/timestamp meta, log output, and version badge render in **JetBrains Mono** — a clear monospace
- No text falls back to a browser default (no Times New Roman or system serif visible anywhere)

- [ ] **Step 3: Verify no CDN requests in DevTools**

Press `Ctrl+Shift+I` to open DevTools. Go to the **Network** tab. Press `Ctrl+R` to reload. In the filter box, search for `googleapis`.

Expected: zero results. Neither `fonts.googleapis.com` nor `fonts.gstatic.com` appears in the network log.

- [ ] **Step 4: Confirm tests still pass**

```bash
npm test
```

Expected: all tests pass.
