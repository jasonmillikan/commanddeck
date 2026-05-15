const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { buildTrayIcon } = require('./tray-icon');

// null = no alert; 'red' = crash (non-zero exit); 'amber' = unexpected clean exit
let alertState = null;

// PIDs the user intentionally killed — checked in exit handlers to suppress false alerts.
// Kept as a separate Set rather than a flag on liveProcesses entries because the
// kill-process handler deletes the entry immediately (before the process actually exits),
// so reading entry.userKilled inside the exit event would always see undefined.
const killedByUser = new Set();

// ─── Config file path ────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(os.homedir(), '.commanddeck', 'commands.json');
const LOG_DIR = path.join(os.homedir(), '.commanddeck', 'logs');

function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ commands: [] }, null, 2));
  }
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { commands: [] };
  }
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// ─── Live process registry (in-memory, not persisted) ────────────────────────
// pid → { pid, commandId, startedAt, logFile, process? }
const liveProcesses = new Map();

// ─── Window & Tray ───────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  // Inline SVG-based tray icon (fallback to empty image if no asset)
  let icon;
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('CommandDeck');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show CommandDeck',
      click: () => { mainWindow.show(); mainWindow.focus(); }
    },
    { type: 'separator' },
    {
      label: 'Quit (kill all managed processes)',
      click: () => {
        killAllProcesses();
        app.exit(0);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  liveProcesses.clear();
}

// ─── Process helpers ─────────────────────────────────────────────────────────

function logLine(logFile, line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
}

function spawnCommand(commandId, label, cmdString, type) {
  const ts = Date.now();
  const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
  logLine(logFile, `Starting: ${cmdString}`);

  const child = spawn('bash', ['-c', cmdString], {
    detached: type === 'launcher', // detach launchers so they outlive us
    stdio: type === 'launcher' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  });

  const entry = {
    pid: child.pid,
    commandId,
    label,
    startedAt: new Date().toISOString(),
    logFile,
    type,
    process: type !== 'launcher' ? child : null,
  };
  liveProcesses.set(child.pid, entry);

  if (type === 'launcher') {
    child.unref(); // let it run independently
    // For launchers we watch if the child exits quickly (indicating failure)
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      mainWindow?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled) {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      updateTrayIcon();
    });
  } else {
    // Foreground: stream stdout/stderr to log and to renderer
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, text.trimEnd());
      mainWindow?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, `STDERR: ${text.trimEnd()}`);
      mainWindow?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      mainWindow?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      // toggle-on commands are intentionally one-shot — don't alert on their exit
      if (!wasUserKilled && type !== 'toggle-on') {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      updateTrayIcon();
    });
  }

  return { pid: child.pid, startedAt: entry.startedAt, logFile };
}

function runOneShot(cmdString, logFile) {
  return new Promise((resolve) => {
    logLine(logFile, `One-shot: ${cmdString}`);
    exec(cmdString, (err, stdout, stderr) => {
      if (stdout) logLine(logFile, stdout.trimEnd());
      if (stderr) logLine(logFile, `STDERR: ${stderr.trimEnd()}`);
      logLine(logFile, err ? `Failed: ${err.message}` : 'Completed OK');
      resolve({ ok: !err, stdout, stderr });
    });
  });
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('load-config', () => loadConfig());
ipcMain.handle('save-config', (_, data) => { saveConfig(data); return true; });

ipcMain.handle('get-live-processes', () => {
  const result = {};
  for (const [pid, entry] of liveProcesses.entries()) {
    result[entry.commandId] = result[entry.commandId] || [];
    result[entry.commandId].push({ pid, startedAt: entry.startedAt, logFile: entry.logFile });
  }
  return result;
});

ipcMain.handle('run-command', async (_, { commandId, label, cmdString, type }) => {
  if (type === 'toggle-on' || type === 'launcher' || type === 'foreground') {
    const result = spawnCommand(commandId, label, cmdString, type);
    return { ok: true, ...result };
  }
  if (type === 'toggle-off') {
    const ts = Date.now();
    const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
    const result = await runOneShot(cmdString, logFile);
    return { ok: result.ok, logFile };
  }
  return { ok: false, error: 'Unknown type' };
});

ipcMain.handle('kill-process', (_, { pid }) => {
  try {
    killedByUser.add(pid);
    process.kill(pid, 'SIGTERM');
    liveProcesses.delete(pid);
    updateTrayIcon();
    return { ok: true };
  } catch (e) {
    killedByUser.delete(pid);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-log', (_, { logFile }) => {
  shell.openPath(logFile);
  return true;
});

ipcMain.handle('open-log-dir', () => {
  shell.openPath(LOG_DIR);
  return true;
});

ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-hide', () => mainWindow.hide());

ipcMain.handle('export-config', (_, { filePath }) => {
  try {
    const data = loadConfig();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('import-config', (_, { filePath }) => {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    saveConfig(data);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ensureConfigDir();
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  // Don't quit — we live in the tray
  e.preventDefault();
});
