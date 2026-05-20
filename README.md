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

Features:
- ✅ System tray — minimize to tray, always reachable
- ✅ PID tracking & timestamps for running processes
- ✅ Kill button for any running process
- ✅ Output log capture (foreground commands)
- ✅ Log files saved to `~/.commanddeck/logs/`
- ✅ Config saved to `~/.commanddeck/commands.json` (plain JSON, version-control friendly)
- ✅ Export / Import config
- ✅ Group/tag commands, search/filter
- ✅ Toggle state persists across restarts (auto-restore on startup)
- ✅ Global hotkey to show/hide window (configurable in Preferences)
- ✅ Desktop notifications on process crash or unexpected exit (configurable in Preferences)
- ✅ Launch at login (configurable in Preferences)

---

## Quick Start

### Prerequisites

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
- **Type** — Toggle, Launcher, or Foreground (see table above)
- **ON Command** — the command to run when toggled on / launched
- **OFF Command** — (Toggle only) the command to run when toggled off
- **Group** — optional tag like `Audio`, `Gaming`, `Sync`

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
      "group": "Audio",
      "onCmd": "pactl load-module module-loopback latency_msec=1",
      "offCmd": "pactl unload-module module-loopback"
    },
    {
      "id": "def456",
      "label": "Steam",
      "note": "Launch Steam client",
      "type": "launcher",
      "group": "Gaming",
      "launchCmd": "flatpak run com.valveSoftware.Steam"
    },
    {
      "id": "ghi789",
      "label": "Syncthing",
      "note": "File sync daemon",
      "type": "foreground",
      "group": "Sync",
      "onCmd": "syncthing -allow-newer-config"
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

- [ ] Drag-to-reorder cards
- [ ] Card groups as collapsible sections
- [ ] `.deb` / AppImage packaging
- [ ] Dark/light theme toggle

---

## License

MIT — do whatever you want with it.
