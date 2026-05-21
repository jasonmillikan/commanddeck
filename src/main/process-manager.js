const { spawn, exec } = require('child_process');
const path = require('path');
const fs   = require('fs');
const { Notification } = require('electron');
const { loadState, saveState } = require('./state');
const { loadConfig, LOG_DIR, STATE_PATH } = require('./config-io');

// pid → { pid, commandId, label, startedAt, logFile, type, process? }
const liveProcesses = new Map();
const killedByUser  = new Set();
const activeTogglesMeta = new Map();
const lastSessionToggles = new Set();
let alertState = null;

let _getMainWindow, _updateTrayIcon, _prefs;

function init({ getMainWindow, updateTrayIcon, prefs = {} }) {
  _getMainWindow  = getMainWindow;
  _updateTrayIcon = updateTrayIcon;
  _prefs          = prefs;
}

function setPrefs(prefs) {
  _prefs = prefs;
}

function getLiveProcesses() {
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
}

function getAlertState() { return alertState; }
function clearAlert()     { alertState = null; }

function recordToggleActive(commandId, meta) {
  activeTogglesMeta.set(commandId, meta);
}

function clearToggleActive(commandId) {
  activeTogglesMeta.delete(commandId);
  lastSessionToggles.delete(commandId);
}

function saveCurrentState(statePath = STATE_PATH) {
  saveState(statePath, [...activeTogglesMeta.keys(), ...lastSessionToggles]);
}

function logLine(logFile, line) {
  const ts = new Date().toISOString();
  fs.appendFileSync(logFile, `[${ts}] ${line}\n`);
}

function notifyProcessExit(label, code, wasUserKilled, type) {
  if (wasUserKilled || type === 'toggle-on') return;
  let body;
  if (code !== 0 && _prefs?.notify?.onCrash) {
    body = `"${label}" stopped with an error (code ${code})`;
  } else if (code === 0 && _prefs?.notify?.onUnexpectedExit) {
    body = `"${label}" exited unexpectedly`;
  }
  if (!body) return;
  const n = new Notification({ title: 'CommandDeck', body });
  n.on('click', () => { _getMainWindow()?.show(); _getMainWindow()?.focus(); });
  n.show();
}

function spawnCommand(commandId, label, cmdString, type) {
  const ts = Date.now();
  const logFile = path.join(LOG_DIR, `${commandId}-${ts}.log`);
  logLine(logFile, `Starting: ${cmdString}`);

  const child = spawn('bash', ['-c', cmdString], {
    detached: true,
    stdio: type === 'launcher' ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  });

  const entry = {
    pid: child.pid, commandId, label,
    startedAt: new Date().toISOString(), logFile, type,
    process: type !== 'launcher' ? child : null,
  };
  liveProcesses.set(child.pid, entry);

  if (type === 'launcher') {
    child.unref();
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      _getMainWindow()?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled) {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
    });
  } else {
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, text.trimEnd());
      _getMainWindow()?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      logLine(logFile, `STDERR: ${text.trimEnd()}`);
      _getMainWindow()?.webContents.send('process-output', { commandId, pid: child.pid, text });
    });
    child.on('exit', (code) => {
      const wasUserKilled = killedByUser.has(child.pid);
      killedByUser.delete(child.pid);
      logLine(logFile, `Exited with code ${code}`);
      liveProcesses.delete(child.pid);
      _getMainWindow()?.webContents.send('process-exited', { commandId, pid: child.pid, code });
      if (!wasUserKilled && type !== 'toggle-on') {
        if (code !== 0) alertState = 'red';
        else if (alertState !== 'red') alertState = 'amber';
      }
      notifyProcessExit(label, code, wasUserKilled, type);
      if (type === 'toggle-on' && code === 0) {
        activeTogglesMeta.set(commandId, { startedAt: entry.startedAt, logFile });
        lastSessionToggles.delete(commandId);
        saveCurrentState();
      }
      _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
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

function killAllProcesses() {
  for (const [pid, entry] of liveProcesses.entries()) {
    if (entry.type === 'launcher') continue;
    try { process.kill(-pid, 'SIGTERM'); } catch {}
  }
  liveProcesses.clear();
}

function killProcess(pid) {
  killedByUser.add(pid);
  process.kill(-pid, 'SIGTERM');
  liveProcesses.delete(pid);
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
  _updateTrayIcon({ running: liveProcesses.size + activeTogglesMeta.size + lastSessionToggles.size, alertState });
}

module.exports = {
  init, setPrefs,
  getLiveProcesses, getAlertState, clearAlert,
  recordToggleActive, clearToggleActive,
  saveCurrentState,
  logLine, notifyProcessExit,
  spawnCommand, runOneShot,
  killAllProcesses, killProcess,
  restoreToggleState,
  liveProcesses, activeTogglesMeta, lastSessionToggles,
};
