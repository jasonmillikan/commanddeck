const path = require('path');
const fs   = require('fs');
const os   = require('os');

const CONFIG_PATH    = path.join(os.homedir(), '.commanddeck', 'commands.json');
const LOG_DIR        = path.join(os.homedir(), '.commanddeck', 'logs');
const STATE_PATH     = path.join(os.homedir(), '.commanddeck', 'state.json');
const PREFS_PATH     = path.join(os.homedir(), '.commanddeck', 'prefs.json');
const AUTOSTART_PATH = path.join(os.homedir(), '.config', 'autostart', 'commanddeck.desktop');

function loadConfig(configPath = CONFIG_PATH) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { commands: [] };
  }
}

function saveConfig(configPath = CONFIG_PATH, data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

function ensureConfigDir({ configPath = CONFIG_PATH, logDir = LOG_DIR, statePath = STATE_PATH, prefsPath = PREFS_PATH } = {}) {
  const { savePrefs, DEFAULTS } = require('./prefs');
  let firstRun = false;
  if (!fs.existsSync(path.dirname(configPath))) fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  if (!fs.existsSync(configPath)) {
    const plat = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
    const defaultsPath = path.join(__dirname, '..', 'defaults', `commands-${plat}.json`);
    let content = JSON.stringify({ commands: [] }, null, 2);
    if (fs.existsSync(defaultsPath)) {
      try {
        const raw = fs.readFileSync(defaultsPath, 'utf8');
        JSON.parse(raw);
        content = raw;
      } catch { /* fall through to empty default */ }
    }
    fs.writeFileSync(configPath, content);
    firstRun = true;
  }
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify({ toggles: {} }, null, 2));
  }
  if (!fs.existsSync(prefsPath)) {
    savePrefs(prefsPath, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
  }
  return { firstRun };
}

function autostartDesktopContent(app) {
  const execStr = app.isPackaged
    ? `"${process.execPath}"`
    : `"${process.execPath}" "${app.getAppPath()}"`;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=CommandDeck',
    `Exec=${execStr}`,
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
  ].join('\n') + '\n';
}

module.exports = {
  CONFIG_PATH, LOG_DIR, STATE_PATH, PREFS_PATH, AUTOSTART_PATH,
  loadConfig, saveConfig, ensureConfigDir, autostartDesktopContent,
};
