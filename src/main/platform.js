const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, () => {});
  } else {
    process.kill(-pid, 'SIGTERM');
  }
}

function spawnShell(cmdString, options = {}) {
  if (process.platform === 'win32') {
    return spawn('cmd', ['/c', cmdString], options);
  }
  return spawn('bash', ['-c', cmdString], options);
}

function getAutostart(autostartPath) {
  if (process.platform === 'win32') {
    const { app } = require('electron');
    return app.getLoginItemSettings().openAtLogin;
  }
  return fs.existsSync(autostartPath);
}

function setAutostart(enabled, autostartPath, desktopContent) {
  if (process.platform === 'win32') {
    const { app } = require('electron');
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }
  if (enabled) {
    fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
    fs.writeFileSync(autostartPath, desktopContent);
  } else if (fs.existsSync(autostartPath)) {
    fs.unlinkSync(autostartPath);
  }
}

function detectTerminalApp() {
  if (process.platform === 'win32') {
    const dirs = (process.env.PATH || '').split(path.delimiter);
    if (dirs.some(d => fs.existsSync(path.join(d, 'wt.exe')))) return 'wt';
    return 'cmd';
  }
  const dirs = (process.env.PATH || '').split(':');
  const candidates = process.env.TERMINAL
    ? [process.env.TERMINAL, 'kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole']
    : ['kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole'];
  for (const t of candidates) {
    if (dirs.some(d => fs.existsSync(path.join(d, t)))) return t;
  }
  return null;
}

module.exports = { killProcessTree, spawnShell, getAutostart, setAutostart, detectTerminalApp };
