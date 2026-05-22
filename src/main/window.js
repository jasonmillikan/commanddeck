const { BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { buildTrayIcon, buildAppIcon } = require('./tray-icon');

let mainWindow = null;
let tray = null;

function getMainWindow() {
  return mainWindow;
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function createWindow(preloadPath, rendererPath, callbacks = {}) {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: buildAppIcon(),
    show: false,
  });

  mainWindow.loadFile(rendererPath);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('show', () => { if (callbacks.onShow) callbacks.onShow(); });
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

function createTray(onToggle, onQuit) {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('CommandDeck');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show CommandDeck', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit (stop foreground processes)', click: onQuit },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', onToggle);
  updateTrayIcon({ running: 0, alertState: null });
}

function updateTrayIcon({ running, alertState }) {
  if (!tray) return;
  tray.setImage(buildTrayIcon(running, alertState));
}

module.exports = { getMainWindow, toggleWindow, createWindow, createTray, updateTrayIcon };
