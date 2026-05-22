import { migrateCommands, applyReorder, escHtml } from './utils.js';
import { renderCards, renderStats } from './cards.js';
import { openModal, initModal } from './modal.js';
import { openDrawer, initDrawer, getDrawerCommandId } from './drawer.js';
import { initTerminal, getTerminalEntry, deleteTerminalEntry, getActiveTerminalId, setXtermTheme } from './terminal.js';
import { openPrefsModal, initPrefsModal } from './prefs-modal.js';
import { initHelpModal, openHelpModal } from './help-modal.js';

// ─── State ────────────────────────────────────────────────────────────────────
let config = { commands: [] };
let platform = 'linux';
// commandId → { pid, startedAt, logFile }[]
let liveMap = {};
// commandId → latest output lines[]
let outputMap = {};
let activeGroup = 'all';
let searchQuery = '';
let prefs = { hotkey: '', notify: { onCrash: true, onUnexpectedExit: false } };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFirstPid(id) { return (liveMap[id] || [])[0]?.pid; }

// ─── Theme ────────────────────────────────────────────────────────────────────
let osThemeListener = null;

function setTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  setXtermTheme(mode);
}

function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme(pref) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (osThemeListener) {
    mq.removeEventListener('change', osThemeListener);
    osThemeListener = null;
  }
  setTheme(resolveTheme(pref));
  if (pref === 'system') {
    osThemeListener = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', osThemeListener);
  }
}

// ─── Config persistence ───────────────────────────────────────────────────────
async function loadAll() {
  const raw = await window.api.loadConfig();
  const { firstRun, platform: p } = raw;
  platform = p || 'linux';
  const { commands, changed } = migrateCommands(raw.commands || []);
  config = { commands };
  if (changed) await window.api.saveConfig(config);
  liveMap = await window.api.getLiveProcesses();
  prefs = await window.api.loadPrefs();
  document.getElementById('output-drawer').style.height = (prefs.drawerHeight || 240) + 'px';
  initTheme(prefs.theme || 'system');
  renderAll();
  if (firstRun) openHelpModal();
}

async function persist() {
  await window.api.saveConfig(config);
}

// ─── Group list ───────────────────────────────────────────────────────────────
function renderGroups() {
  const tags = ['all', ...new Set(config.commands.flatMap(c => c.tags || []).filter(Boolean))];
  const el = document.getElementById('group-list');
  el.innerHTML = tags.map(t => `
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${escHtml(t)}">
      ${t === 'all' ? 'All Commands' : escHtml(t)}
    </div>
  `).join('');
  el.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', () => {
      activeGroup = item.dataset.group;
      renderAll();
    });
  });
}

// ─── Render coordination ──────────────────────────────────────────────────────
function renderAll() {
  renderGroups();
  renderCards(config, activeGroup, searchQuery, liveMap, {
    onDragEnd: handleDragEnd,
    attachListeners: attachCardListeners,
  });
  renderStats(config, liveMap);
}

// ─── Card event delegation ────────────────────────────────────────────────────
function attachCardListeners() {
  document.getElementById('cards-container').addEventListener('click', handleCardClick, { once: true });
  document.getElementById('cards-container').addEventListener('change', handleCardChange, { once: true });
}

function handleCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) { attachCardListeners(); return; }
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action !== 'toggle') handleCardAction(action, id);
  setTimeout(attachCardListeners, 0);
}

function handleCardChange(e) {
  const input = e.target.closest('[data-action="toggle"]');
  if (input) handleCardAction('toggle', input.dataset.id, input.checked);
  setTimeout(attachCardListeners, 0);
}

async function handleCardAction(action, id, checked) {
  const cmd = config.commands.find(c => c.id === id);
  if (!cmd) return;

  if (action === 'toggle') {
    if (checked) await startCommand(cmd);
    else await stopCommand(cmd);
  } else if (action === 'start') {
    await startCommand(cmd);
  } else if (action === 'kill') {
    const pid = getFirstPid(id);
    if (pid) {
      await window.api.killProcess(pid);
      liveMap[id] = [];
      renderAll();
    }
  } else if (action === 'log') {
    openDrawer(cmd, 'output');
  } else if (action === 'term') {
    openDrawer(cmd, 'term');
  } else if (action === 'open') {
    const result = await window.api.openInTerminal(cmd.content, cmd.id);
    if (result && !result.ok && result.reason === 'no_terminal') {
      new Notification('No terminal found', { body: 'Set the $TERMINAL environment variable to your terminal emulator.' });
    }
  } else if (action === 'edit') {
    openModal(cmd);
  }
}

// ─── Command execution ────────────────────────────────────────────────────────
async function startCommand(cmd) {
  let cmdString, type;
  if (cmd.type === 'toggle') {
    cmdString = cmd.onCmd;
    type = 'toggle-on';
  } else if (cmd.type === 'launcher') {
    cmdString = cmd.launchCmd;
    type = 'launcher';
  } else {
    cmdString = cmd.onCmd;
    type = 'foreground';
  }
  const result = await window.api.runCommand({ commandId: cmd.id, label: cmd.label, cmdString, type });
  if (result.ok) {
    if (!liveMap[cmd.id]) liveMap[cmd.id] = [];
    if (result.pid) {
      liveMap[cmd.id] = [{ pid: result.pid, startedAt: result.startedAt, logFile: result.logFile, lastSession: false }];
    }
    if (type === 'toggle-on') {
      liveMap[cmd.id] = [{ pid: null, startedAt: new Date().toISOString(), logFile: result.logFile, lastSession: false }];
    }
  }
  renderAll();
}

async function stopCommand(cmd) {
  if (cmd.type === 'toggle' && cmd.offCmd) {
    await window.api.runCommand({
      commandId: cmd.id,
      label: cmd.label,
      cmdString: cmd.offCmd,
      type: 'toggle-off',
    });
    liveMap[cmd.id] = [];
  } else {
    const pid = getFirstPid(cmd.id);
    if (pid) await window.api.killProcess(pid);
    liveMap[cmd.id] = [];
  }
  renderAll();
}

// ─── Drag reorder ─────────────────────────────────────────────────────────────
async function handleDragEnd(evt) {
  if (evt.oldIndex === evt.newIndex) return;
  const container = document.getElementById('cards-container');
  const newVisibleIds = [...container.querySelectorAll('.card[data-id]')].map(el => el.dataset.id);
  config.commands = applyReorder(config.commands, newVisibleIds);
  await persist();
}

// ─── Events from main process ─────────────────────────────────────────────────
window.api.onProcessExited(({ commandId, pid, code }) => {
  if (liveMap[commandId]) {
    liveMap[commandId] = liveMap[commandId].filter(p => p.pid !== pid);
  }
  renderAll();
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(`\n[Process exited with code ${code}]\n`);
  const drawerCommandId = getDrawerCommandId();
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

window.api.onProcessOutput(({ commandId, pid, text }) => {
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(text);
  if (outputMap[commandId].length > 500) outputMap[commandId] = outputMap[commandId].slice(-300);
  const drawerCommandId = getDrawerCommandId();
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.api.onPtyData(({ commandId, data }) => {
  const entry = getTerminalEntry(commandId);
  if (!entry) return;
  entry.term.write(data);
  if (!entry.ready) {
    entry.ready = true;
    entry.pendingWrites.splice(0).forEach(d => window.api.ptyWrite(commandId, d));
  }
});

window.api.onPtyExit(({ commandId }) => {
  deleteTerminalEntry(commandId);
});

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('search-box').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderCards(config, activeGroup, searchQuery, liveMap, {
    onDragEnd: handleDragEnd,
    attachListeners: attachCardListeners,
  });
});

// ─── Titlebar controls ────────────────────────────────────────────────────────
document.getElementById('btn-add').addEventListener('click', () => openModal());
document.getElementById('btn-minimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api.toggleMaximize());
document.getElementById('btn-hide').addEventListener('click', () => window.api.hide());
window.api.onWindowMaximized(isMax => {
  const btn = document.getElementById('btn-maximize');
  btn.textContent = isMax ? '❐' : '□';
  btn.title = isMax ? 'Restore' : 'Maximize';
});
document.getElementById('btn-open-logs').addEventListener('click', () => window.api.openLogDir());
document.getElementById('btn-export').addEventListener('click', async () => {
  await window.api.exportConfig();
});
document.getElementById('btn-import').addEventListener('click', async () => {
  const result = await window.api.importConfig();
  if (result.ok) { config = result.data; renderAll(); }
});
document.getElementById('btn-help').addEventListener('click', () => openHelpModal());

// ─── Drawer resize ────────────────────────────────────────────────────────────
(function initDrawerResize() {
  const handle = document.getElementById('drawer-resize-handle');
  const drawer = document.getElementById('output-drawer');
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const board = document.querySelector('.board');
    function onMove(e) {
      const newHeight = Math.round(
        Math.min(Math.max(window.innerHeight - e.clientY, 100), window.innerHeight * 0.6)
      );
      drawer.style.height = newHeight + 'px';
      if (drawer.classList.contains('open')) board.style.paddingBottom = newHeight + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const newHeight = parseInt(drawer.style.height, 10);
      prefs = { ...prefs, drawerHeight: newHeight };
      window.api.savePrefs(prefs);
      const activeTerminalId = getActiveTerminalId();
      if (activeTerminalId) {
        const entry = getTerminalEntry(activeTerminalId);
        if (entry) {
          entry.fitAddon.fit();
          const { cols, rows } = entry.term;
          window.api.ptyResize(activeTerminalId, cols, rows);
        }
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();

// ─── Init ─────────────────────────────────────────────────────────────────────
initModal({ getConfig: () => config, persist, renderAll });
initDrawer({ getConfig: () => config, getOutputMap: () => outputMap, getLiveMap: () => liveMap });
initPrefsModal({ getPrefs: () => prefs, setPrefs: (p) => { prefs = p; }, applyTheme: initTheme });
initHelpModal({
  getConfig:   () => config,
  getPlatform: () => platform || 'linux',
  addCommand:  async (cmd) => {
    config = { ...config, commands: [...config.commands, cmd] };
    await persist();
    renderAll();
  },
});

loadAll();
