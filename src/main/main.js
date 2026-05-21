const { app, ipcMain, globalShortcut, dialog, shell } = require('electron');
const path = require('path');

const cfgIo   = require('./config-io');
const win     = require('./window');
const procMgr = require('./process-manager');
const ptyMgr  = require('./pty-manager');
const ipc     = require('./ipc-handlers');
const { loadPrefs } = require('./prefs');

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  cfgIo.ensureConfigDir();
  const prefs = loadPrefs(cfgIo.PREFS_PATH);

  const preloadPath  = path.join(__dirname, 'preload.js');
  const rendererPath = path.join(__dirname, '..', 'renderer', 'index.html');

  win.createWindow(preloadPath, rendererPath, {
    onShow: () => {
      procMgr.clearAlert();
      win.updateTrayIcon({
        running: procMgr.liveProcesses.size + procMgr.activeTogglesMeta.size + procMgr.lastSessionToggles.size,
        alertState: null,
      });
    },
  });
  win.createTray(win.toggleWindow, () => { procMgr.killAllProcesses(); app.exit(0); });

  procMgr.init({ getMainWindow: win.getMainWindow, updateTrayIcon: win.updateTrayIcon, prefs });
  ptyMgr.init({ getMainWindow: win.getMainWindow });

  ipc.register(ipcMain, { procMgr, ptyMgr, win, cfgIo, globalShortcut, dialog, shell });

  if (prefs.hotkey) globalShortcut.register(prefs.hotkey, win.toggleWindow);

  // Auto-restore spawns run before the renderer is ready. IPC events (process-exited,
  // process-output) may be dropped if the renderer hasn't loaded yet — this is safe
  // because the renderer re-derives toggle state from getLiveProcesses() on boot.
  procMgr.restoreToggleState();
});

app.on('window-all-closed', (e) => {
  // Don't quit — we live in the tray
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ptyMgr.killAllPty();
  ipc.cleanupTempFiles();
});
