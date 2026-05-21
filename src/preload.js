const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (data) => ipcRenderer.invoke('save-config', data),

  // Process management
  getLiveProcesses: () => ipcRenderer.invoke('get-live-processes'),
  runCommand: (opts) => ipcRenderer.invoke('run-command', opts),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', { pid }),

  // Logs
  openLog: (logFile) => ipcRenderer.invoke('open-log', { logFile }),
  openLogDir: () => ipcRenderer.invoke('open-log-dir'),

  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  hide: () => ipcRenderer.invoke('window-hide'),
  toggleMaximize: () => ipcRenderer.invoke('window-maximize'),
  onWindowMaximized: (cb) => ipcRenderer.on('window-maximized', (_, v) => cb(v)),

  // Import / Export
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),

  // Preferences
  loadPrefs: () => ipcRenderer.invoke('load-prefs'),
  savePrefs: (data) => ipcRenderer.invoke('save-prefs', data),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),

  // PTY (in-app terminal)
  ptyCreate:  (commandId) => ipcRenderer.invoke('pty-create', { commandId }),
  ptyWrite:   (commandId, data) => ipcRenderer.invoke('pty-write', { commandId, data }),
  ptyResize:  (commandId, cols, rows) => ipcRenderer.invoke('pty-resize', { commandId, cols, rows }),
  onPtyData:  (cb) => ipcRenderer.on('pty-data', (_, payload) => cb(payload)),

  // Events from main → renderer
  onProcessExited: (cb) => ipcRenderer.on('process-exited', (_, data) => cb(data)),
  onProcessOutput: (cb) => ipcRenderer.on('process-output', (_, data) => cb(data)),
});
