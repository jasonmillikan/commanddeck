const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, globalShortcut, Notification } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty-prebuilt-multiarch');

const { buildTrayIcon, buildAppIcon } = require('./tray-icon');
const { loadState, saveState } = require('./state');
const { loadPrefs, savePrefs, DEFAULTS } = require('./prefs');

// null = no alert; 'red' = crash (non-zero exit); 'amber' = unexpected clean exit
let alertState = null;

// PIDs the user intentionally killed — checked in exit handlers to suppress false alerts.
// Kept as a separate Set rather than a flag on liveProcesses entries because the
// kill-process handler deletes the entry immediately (before the process actually exits),
// so reading entry.userKilled inside the exit event would always see undefined.
const killedByUser = new Set();

let prefs = {};

// ─── Config file path ────────────────────────────────────────────────────────
const CONFIG_PATH    = path.join(os.homedir(), '.commanddeck', 'commands.json');
const LOG_DIR        = path.join(os.homedir(), '.commanddeck', 'logs');
const STATE_PATH     = path.join(os.homedir(), '.commanddeck', 'state.json');
const PREFS_PATH     = path.join(os.homedir(), '.commanddeck', 'prefs.json');
const AUTOSTART_PATH = path.join(os.homedir(), '.config', 'autostart', 'commanddeck.desktop');

function autostartDesktopContent() {
  // In dev (npm start) we need to pass the app directory to the electron binary.
  // In a packaged build, the executable is self-contained.
  const exec = app.isPackaged
    ? `"${process.execPath}"`
    : `"${process.execPath}" "${app.getAppPath()}"`;
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=CommandDeck',
    `Exec=${exec}`,
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
  ].join('\n') + '\n';
}

// commandId → { startedAt, logFile } — verified active this session
const activeTogglesMeta = new Map();
// commandIds active last session, not yet verified (remember-only)
const lastSessionToggles = new Set();

function saveCurrentState() {
  saveState(STATE_PATH, [...activeTogglesMeta.keys(), ...lastSessionToggles]);
}

function ensureConfigDir() {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ commands: [] }, null, 2));
  }
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ toggles: {} }, null, 2));
  }
  if (!fs.existsSync(PREFS_PATH)) {
    savePrefs(PREFS_PATH, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
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

function detectTerminalApp() {
  // PATH uses ':' as separator — this function is Linux-only (macOS/Windows callers return early)
  const dirs = (process.env.PATH || '').split(':');
  // xterm excluded: it uses -e rather than -- for command execution
  const candidates = process.env.TERMINAL
    ? [process.env.TERMINAL, 'kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole']
    : ['kitty', 'alacritty', 'gnome-terminal', 'xfce4-terminal', 'konsole'];
  for (const t of candidates) {
    if (dirs.some(d => fs.existsSync(path.join(d, t)))) return t;
  }
  return null;
}

// ─── Live process registry (in-memory, not persisted) ────────────────────────
// pid → { pid, commandId, startedAt, logFile, process? }
const liveProcesses = new Map();
const ptyProcesses = new Map(); // commandId → pty process

// ─── Window & Tray ───────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

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
    icon: buildAppIcon(),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('show', () => {
    alertState = null;
    updateTrayIcon();
  });

  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

function createTray() {
  // Inline SVG-based tray icon (fallback to empty image if no asset)
  tray = new Tray(nativeImage.createEmpty()); // updateTrayIcon() sets the real icon immediately after
  tray.setToolTip('CommandDeck');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show CommandDeck',
      click: () => { mainWindow.show(); mainWindow.focus(); }
    },
    { type: 'separator' },
    {
      label: 'Quit (stop foreground processes)',
      click: () => {
        killAllProcesses();
        app.exit(0);
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    if (entry.type === 'launcher') continue;
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {}
  }
  liveProcesses.clear();
}

function updateTrayIcon() {
  if (!tray) return;
  const running = liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size;
  tray.setImage(buildTrayIcon(running, alertState));
}

function restoreToggleState() {
  const state = loadState(STATE_PATH);
  const cfg = loadConfig();
  const commandMap = new Map(cfg.commands.map(c => [c.id, c]));

  for (const [commandId, active] of Object.entries(state.toggles)) {
    if (!active) continue;
    const cmd = commandMap.get(commandId);
    if (!cmd || cmd.type !== 'toggle') continue;

    if (cmd.autoRestore) {
      try {
        spawnCommand(commandId, cmd.label, cmd.onCmd, 'toggle-on');
      } catch (err) {
        console.error(`[restore] Failed to spawn ${commandId}:`, err.message);
      }
    } else {
      lastSessionToggles.add(commandId);
    }
  }
  updateTrayIcon();
}

// ─── Process helpers ─────────────────────────────────────────────────────────

function logLine(logFile, line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
}

function notifyProcessExit(label, code, wasUserKilled, type) {
  if (wasUserKilled || type === 'toggle-on') return;
  let body;
  if (code !== 0 && prefs.notify?.onCrash) {
    body = `"${label}" stopped with an error (code ${code})`;
  } else if (code === 0 && prefs.notify?.onUnexpectedExit) {
    body = `"${label}" exited unexpectedly`;
  }
  if (!body) return;
  const n = new Notification({ title: 'CommandDeck', body });
  n.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
  n.show();
}

function spawnCommand(commandId, label, cmdString, type) {
  const ts = Date.now();
  const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
  logLine(logFile, `Starting: ${cmdString}`);

  const child = spawn('bash', ['-c', cmdString], {
    detached: true, // own process group so -pid group kill reaches bash's children
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
      notifyProcessExit(label, code, wasUserKilled, type);
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
      notifyProcessExit(label, code, wasUserKilled, type);
      if (type === 'toggle-on' && code === 0) {
        activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
        lastSessionToggles.delete(commandId);
        saveCurrentState();
      } else if (type === 'toggle-on') {
        lastSessionToggles.delete(commandId);
        saveCurrentState();
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
ipcMain.handle('load-prefs', () => loadPrefs(PREFS_PATH));
ipcMain.handle('get-autostart', () => fs.existsSync(AUTOSTART_PATH));
ipcMain.handle('set-autostart', (_, enabled) => {
  if (enabled) {
    fs.mkdirSync(path.dirname(AUTOSTART_PATH), { recursive: true });
    fs.writeFileSync(AUTOSTART_PATH, autostartDesktopContent());
  } else if (fs.existsSync(AUTOSTART_PATH)) {
    fs.unlinkSync(AUTOSTART_PATH);
  }
  return { ok: true };
});

ipcMain.handle('save-prefs', (_, data) => {
  globalShortcut.unregisterAll();
  if (data.hotkey) {
    const ok = globalShortcut.register(data.hotkey, toggleWindow);
    if (!ok) return { ok: false, error: 'hotkey_conflict' };
  }
  prefs = { ...data };
  savePrefs(PREFS_PATH, prefs);
  return { ok: true };
});

ipcMain.handle('get-live-processes', () => {
  const result = {};
  for (const [pid, entry] of liveProcesses.entries()) {
    result[entry.commandId] = result[entry.commandId] || [];
    result[entry.commandId].push({ pid, startedAt: entry.startedAt, logFile: entry.logFile, lastSession: false });
  }
  for (const [commandId, meta] of activeTogglesMeta.entries()) {
    if (!result[commandId]) {
      result[commandId] = [{ pid: null, startedAt: meta.startedAt, logFile: meta.logFile, lastSession: false }];
    }
  }
  for (const commandId of lastSessionToggles) {
    if (!result[commandId]) {
      result[commandId] = [{ pid: null, startedAt: null, logFile: null, lastSession: true }];
    }
  }
  return result;
});

ipcMain.handle('run-command', async (_, { commandId, label, cmdString, type }) => {
  if (type === 'toggle-on' || type === 'launcher' || type === 'foreground') {
    const result = spawnCommand(commandId, label, cmdString, type);
    updateTrayIcon();
    return { ok: true, ...result };
  }
  if (type === 'toggle-off') {
    const ts = Date.now();
    const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
    const result = await runOneShot(cmdString, logFile);
    if (result.ok) {
      activeTogglesMeta.delete(commandId);
      lastSessionToggles.delete(commandId);
      saveCurrentState();
      updateTrayIcon();
    }
    return { ok: result.ok, logFile };
  }
  return { ok: false, error: 'Unknown type' };
});

ipcMain.handle('kill-process', (_, { pid }) => {
  try {
    killedByUser.add(pid);
    process.kill(-pid, 'SIGTERM');
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

ipcMain.handle('pty-create', (_, { commandId }) => {
  if (ptyProcesses.has(commandId)) return { ok: true };
  const shellExe = process.platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash');
  const ptyProcess = pty.spawn(shellExe, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env,
  });
  ptyProcess.onData(data => {
    if (mainWindow) mainWindow.webContents.send('pty-data', { commandId, data });
  });
  ptyProcess.onExit(({ exitCode }) => {
    ptyProcesses.delete(commandId);
    if (mainWindow) mainWindow.webContents.send('pty-exit', { commandId, exitCode });
  });
  ptyProcesses.set(commandId, ptyProcess);
  return { ok: true };
});

ipcMain.handle('pty-write', (_, { commandId, data }) => {
  if (typeof data !== 'string') return { ok: false };
  ptyProcesses.get(commandId)?.write(data);
  return { ok: true };
});

ipcMain.handle('pty-resize', (_, { commandId, cols, rows }) => {
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) return { ok: false };
  ptyProcesses.get(commandId)?.resize(cols, rows);
  return { ok: true };
});

ipcMain.handle('open-in-terminal', async (_, { content, cmdId }) => {
  if (typeof content !== 'string' || typeof cmdId !== 'string') return { ok: false, reason: 'invalid_args' };
  const safeCmdId = cmdId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const tmpFile = path.join(os.tmpdir(), `commanddeck-${safeCmdId}-${Date.now()}.sh`);
  fs.writeFileSync(tmpFile, content, { mode: 0o600 });
  setTimeout(() => { try { fs.unlinkSync(tmpFile); } catch {} }, 30000);

  if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "cat '${tmpFile}'; exec $SHELL"`;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  }

  if (process.platform === 'win32') {
    spawn('cmd', ['/K', `type "${tmpFile}"`], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  }

  const terminal = detectTerminalApp();
  if (!terminal) return { ok: false, reason: 'no_terminal' };
  // Pass tmpFile as $1 to avoid shell interpolation
  spawn(terminal, ['--', 'bash', '-c', 'cat "$1"; exec $SHELL', '--', tmpFile], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
});

ipcMain.handle('window-minimize', () => mainWindow.minimize());
ipcMain.handle('window-hide', () => mainWindow.hide());
ipcMain.handle('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.handle('export-config', async () => {
  const ts = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(os.homedir(), `commanddeck-backup-${ts}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify(loadConfig(), null, 2));
    return { ok: true };
  } catch (e) {
    dialog.showErrorBox('Export failed', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('import-config', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false, canceled: true };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  } catch (e) {
    dialog.showErrorBox('Import failed', `Could not read file: ${e.message}`);
    return { ok: false, error: e.message };
  }
  const current = loadConfig();
  const count = (current.commands || []).length;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Continue', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: `This will replace your ${count} current command${count === 1 ? '' : 's'}.`,
    detail: 'This cannot be undone.',
  });
  if (response !== 0) return { ok: false, canceled: true };
  saveConfig(data);
  return { ok: true, data };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  ensureConfigDir();
  prefs = loadPrefs(PREFS_PATH);
  createWindow();
  createTray();
  if (prefs.hotkey) globalShortcut.register(prefs.hotkey, toggleWindow);
  // Auto-restore spawns run before the renderer is ready. IPC events (process-exited,
  // process-output) may be dropped if the renderer hasn't loaded yet — this is safe
  // because the renderer re-derives toggle state from getLiveProcesses() on boot.
  restoreToggleState();
});

app.on('window-all-closed', (e) => {
  // Don't quit — we live in the tray
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  for (const ptyProc of ptyProcesses.values()) {
    try { ptyProc.kill(); } catch {}
  }
});
