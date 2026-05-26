# ⬡ CommandDeck

A toggle board for terminal commands. Stop hunting through shell history — manage your daily commands with a click.

![CommandDeck](https://img.shields.io/badge/platform-Linux-green) ![Electron](https://img.shields.io/badge/built%20with-Electron-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it does

CommandDeck sits in your system tray and gives you a visual board of commands you run regularly. Three command types are supported:

| Type | How it works | Example |
|---|---|---|
| **Toggle** | ON command to activate, OFF command to deactivate | `pactl load-module ...` / `pactl unload-module ...` |
| **Launcher** | Fires and detaches (the app lives on its own) | `flatpak run com.valveSoftware.Steam` |
| **Foreground** | Runs managed — output is captured, PID tracked, killable | `syncthing -allow-newer-config` |
| **Cheatsheet** | Reference card — open snippets in an in-app terminal or your system terminal | `ip addr show`, `ss -tulnp` |

Features:
- ✅ System tray — minimize to tray, always reachable
- ✅ PID tracking & timestamps for running processes
- ✅ Kill button for any running process
- ✅ Output log capture (foreground commands)
- ✅ Log files saved to `~/.commanddeck/logs/`
- ✅ Config saved to `~/.commanddeck/commands.json` (plain JSON, version-control friendly)
- ✅ Export / Import config
- ✅ Multi-tag commands, sidebar tag filter, drag-to-reorder cards
- ✅ Toggle state persists across restarts (auto-restore on startup)
- ✅ Global hotkey to show/hide window (configurable in Preferences)
- ✅ Desktop notifications on process crash or unexpected exit (configurable in Preferences)
- ✅ Launch at login (configurable in Preferences)

---

## Quick Start

### Prerequisites

- **Ubuntu 22.04+** — development is intended for Ubuntu 22.04 or newer. Older distros (e.g. Ubuntu 20.04) ship GCC 9, which cannot compile the `node-pty` native module against Node.js 24 headers. Contributors on older systems will need to source a newer compiler themselves.

- **Node.js** v18+ — install via [nvm](https://github.com/nvm-sh/nvm) or your package manager:
  ```bash
  # Ubuntu/Debian
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

### Install & Run

```bash
# 1. Clone or unzip the project
cd commanddeck

# 2. Install dependencies (just Electron)
npm install

# 3. Run it
npm start
```

That's it. The app window opens and an icon appears in your system tray.

---

## Adding your first command

Click **+ New Command** and fill in:

- **Label** — a short name, e.g. `Steam` or `Audio Loopback`
- **Note** — optional reminder of what it does
- **Type** — Toggle, Launcher, Foreground, or Cheatsheet (see table above)
- **ON Command** — the command to run when toggled on / launched
- **OFF Command** — (Toggle only) the command to run when toggled off
- **Content** — (Cheatsheet only) newline-separated list of commands. Each line appears as a clickable snippet — click to send it to the in-app terminal, or open the whole sheet in your system terminal.
- **Tags** — optional, e.g. `Audio`, `Gaming`. A command can have multiple tags. Click a tag in the sidebar to filter. Drag cards by their left-edge grip handle to reorder.

---

## Config file

Your commands are stored at `~/.commanddeck/commands.json`. Example:

```json
{
  "commands": [
    {
      "id": "abc123",
      "label": "Audio Loopback",
      "note": "Routes mic to speakers for monitoring",
      "type": "toggle",
      "tags": ["Audio"],
      "onCmd": "pactl load-module module-loopback latency_msec=1",
      "offCmd": "pactl unload-module module-loopback"
    },
    {
      "id": "def456",
      "label": "Steam",
      "note": "Launch Steam client",
      "type": "launcher",
      "tags": ["Gaming"],
      "launchCmd": "flatpak run com.valveSoftware.Steam"
    },
    {
      "id": "ghi789",
      "label": "Syncthing",
      "note": "File sync daemon",
      "type": "foreground",
      "tags": ["Sync"],
      "onCmd": "syncthing -allow-newer-config"
    },
    {
      "id": "jkl012",
      "label": "Network Info",
      "note": "Handy network commands",
      "type": "cheatsheet",
      "tags": ["Network"],
      "content": "ip addr show\nip route\nss -tulnp"
    }
  ]
}
```

---

## Log files

All command output is saved to `~/.commanddeck/logs/`. Each run gets its own timestamped log file. Click **LOG** on any card to view recent output in the drawer, or **⌂** in the titlebar to open the logs directory.

---

## Autostart on login

Open **Preferences** (⚙ in the titlebar) and enable **Launch at login**. CommandDeck writes a `.desktop` file to `~/.config/autostart/` automatically — no terminal commands needed.

---

## Roadmap (future ideas)

- [x] Drag-to-reorder cards
- [ ] Card tags as collapsible sections
- [ ] `.deb` / AppImage packaging
- [x] Dark/light theme (Paper)

---

## Support

If CommandDeck saves you time or friction, a small sponsorship would be deeply appreciated.
GitHub Sponsors is the easiest way to help — Ko-fi works too if you prefer.

- **[GitHub Sponsors](https://github.com/sponsors/jasonmillikan)** — recurring or one-time, directly on GitHub
- **[Ko-fi](https://ko-fi.com/jasonmillikan)** — buy me a coffee, no account needed

---

## License

MIT — do whatever you want with it.
