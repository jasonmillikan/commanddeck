const path = require('path');
const fs   = require('fs');
const os   = require('os');

function register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell }) {
  const { CONFIG_PATH, LOG_DIR, AUTOSTART_PATH, loadConfig, saveConfig, autostartDesktopContent, detectTerminalApp } = cfgIo;
  const { spawn } = require('child_process');

  ipcMain.handle('load-config', () => loadConfig());
  ipcMain.handle('save-config', (_, data) => { saveConfig(CONFIG_PATH, data); return true; });

  ipcMain.handle('load-prefs', () => {
    const { loadPrefs } = require('./prefs');
    const { PREFS_PATH } = cfgIo;
    return loadPrefs(PREFS_PATH);
  });

  ipcMain.handle('get-autostart', () => fs.existsSync(AUTOSTART_PATH));

  ipcMain.handle('set-autostart', (_, enabled) => {
    if (enabled) {
      const { app } = require('electron');
      fs.mkdirSync(path.dirname(AUTOSTART_PATH), { recursive: true });
      fs.writeFileSync(AUTOSTART_PATH, autostartDesktopContent(app));
    } else if (fs.existsSync(AUTOSTART_PATH)) {
      fs.unlinkSync(AUTOSTART_PATH);
    }
    return { ok: true };
  });

  ipcMain.handle('save-prefs', (_, data) => {
    const { savePrefs } = require('./prefs');
    const { PREFS_PATH } = cfgIo;
    globalShortcut.unregisterAll();
    if (data.hotkey) {
      const ok = globalShortcut.register(data.hotkey, win.toggleWindow);
      if (!ok) return { ok: false, error: 'hotkey_conflict' };
    }
    procMgr.setPrefs(data);
    savePrefs(PREFS_PATH, data);
    return { ok: true };
  });

  ipcMain.handle('get-live-processes', () => procMgr.getLiveProcesses());

  ipcMain.handle('run-command', async (_, { commandId, label, cmdString, type }) => {
    if (type === 'toggle-on' || type === 'launcher' || type === 'foreground') {
      const result = procMgr.spawnCommand(commandId, label, cmdString, type);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true, ...result };
    }
    if (type === 'toggle-off') {
      const ts = Date.now();
      const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
      const result = await procMgr.runOneShot(cmdString, logFile);
      if (result.ok) {
        procMgr.clearToggleActive(commandId);
        procMgr.saveCurrentState();
        win.updateTrayIcon({
          running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
          alertState: procMgr.getAlertState(),
        });
      }
      return { ok: result.ok, logFile };
    }
    return { ok: false, error: 'Unknown type' };
  });

  ipcMain.handle('kill-process', (_, { pid }) => {
    if (!Number.isInteger(pid) || pid <= 1) return { ok: false, error: 'invalid_pid' };
    if (![...procMgr.liveProcesses.values()].flat().some(p => p.pid === pid)) {
      return { ok: false, error: 'unknown_pid' };
    }
    try {
      procMgr.killProcess(pid);
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: procMgr.getAlertState(),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('open-log', (_, { logFile }) => { shell.openPath(logFile); return true; });
  ipcMain.handle('open-log-dir', () => { shell.openPath(LOG_DIR); return true; });
  ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

  ipcMain.handle('pty-create', (_, { commandId }) => ptyMgr.ptyCreate(commandId));
  ipcMain.handle('pty-write',  (_, { commandId, data }) => ptyMgr.ptyWrite(commandId, data));
  ipcMain.handle('pty-resize', (_, { commandId, cols, rows }) => ptyMgr.ptyResize(commandId, cols, rows));

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
    spawn(terminal, ['--', 'bash', '-c', 'cat "$1"; exec $SHELL', '--', tmpFile], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });

  ipcMain.handle('window-minimize', () => win.getMainWindow().minimize());
  ipcMain.handle('window-hide',     () => win.getMainWindow().hide());
  ipcMain.handle('window-maximize', () => {
    const w = win.getMainWindow();
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });

  ipcMain.handle('export-config', async () => {
    const ts = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(win.getMainWindow(), {
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
    const { canceled, filePaths } = await dialog.showOpenDialog(win.getMainWindow(), {
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
    const { response } = await dialog.showMessageBox(win.getMainWindow(), {
      type: 'warning',
      buttons: ['Continue', 'Cancel'],
      defaultId: 1, cancelId: 1,
      message: `This will replace your ${count} current command${count === 1 ? '' : 's'}.`,
      detail: 'This cannot be undone.',
    });
    if (response !== 0) return { ok: false, canceled: true };
    saveConfig(CONFIG_PATH, data);
    return { ok: true, data };
  });
}

module.exports = { register };
