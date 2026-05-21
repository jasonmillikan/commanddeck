const pty = require('node-pty');
const os  = require('os');

const ptyProcesses = new Map();
let _getMainWindow;

function init({ getMainWindow }) {
  _getMainWindow = getMainWindow;
}

function ptyCreate(commandId) {
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
    const win = _getMainWindow();
    if (win) win.webContents.send('pty-data', { commandId, data });
  });
  ptyProcess.onExit(({ exitCode }) => {
    ptyProcesses.delete(commandId);
    const win = _getMainWindow();
    if (win) win.webContents.send('pty-exit', { commandId, exitCode });
  });
  ptyProcesses.set(commandId, ptyProcess);
  return { ok: true };
}

function ptyWrite(commandId, data) {
  if (typeof data !== 'string') return { ok: false };
  ptyProcesses.get(commandId)?.write(data);
  return { ok: true };
}

function ptyResize(commandId, cols, rows) {
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1) return { ok: false };
  ptyProcesses.get(commandId)?.resize(cols, rows);
  return { ok: true };
}

function killAllPty() {
  for (const proc of ptyProcesses.values()) {
    try { proc.kill(); } catch {}
  }
}

module.exports = { init, ptyCreate, ptyWrite, ptyResize, killAllPty };
