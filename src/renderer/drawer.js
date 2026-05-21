import { initTerminal, switchToTerminal, getTerminalEntry } from './terminal.js';
import { escHtml } from './utils.js';

let drawerCommandId = null;
let drawerLogFile = null;
let _getConfig, _getOutputMap, _getLiveMap;

export function initDrawer({ getConfig, getOutputMap, getLiveMap }) {
  _getConfig = getConfig;
  _getOutputMap = getOutputMap;
  _getLiveMap = getLiveMap;
}

export function getDrawerCommandId() {
  return drawerCommandId;
}

export function openDrawer(cmd, mode = 'output') {
  drawerCommandId = cmd.id;
  const logBtn = document.getElementById('drawer-open-log');
  const runAllBtn = document.getElementById('drawer-run-all');
  const outputEl = document.getElementById('drawer-output');
  const snippetPanel = document.getElementById('drawer-snippet-panel');
  const terminalsEl = document.getElementById('drawer-terminals');
  document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;

  if (mode === 'term') {
    logBtn.style.display = 'none';
    runAllBtn.style.display = '';
    outputEl.style.display = 'none';
    snippetPanel.style.display = '';
    terminalsEl.style.display = '';

    snippetPanel.innerHTML = (cmd.content || '')
      .split('\n')
      .map(line => `<div class="snippet-line" data-cmd="${escHtml(line)}">${escHtml(line)}</div>`)
      .join('');

    snippetPanel.onclick = (e) => {
      const lineEl = e.target.closest('.snippet-line');
      if (!lineEl) return;
      const entry = getTerminalEntry(cmd.id);
      if (entry?.ready) {
        window.api.ptyWrite(cmd.id, lineEl.dataset.cmd);
      } else if (entry) {
        entry.pendingWrites.push(lineEl.dataset.cmd);
      }
    };

    initTerminal(cmd).then(() => switchToTerminal(cmd.id));
  } else {
    logBtn.style.display = cmd.type === 'cheatsheet' ? 'none' : '';
    runAllBtn.style.display = 'none';
    outputEl.style.display = '';
    snippetPanel.style.display = 'none';
    terminalsEl.style.display = 'none';
    drawerLogFile = (_getLiveMap()[cmd.id] || [])[0]?.logFile || null;
    const lines = _getOutputMap()[cmd.id] || [];
    outputEl.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  const drawer = document.getElementById('output-drawer');
  drawer.classList.add('open');
  document.querySelector('.board').style.paddingBottom = drawer.offsetHeight + 'px';
}

document.getElementById('drawer-close').addEventListener('click', () => {
  document.getElementById('output-drawer').classList.remove('open');
  document.querySelector('.board').style.paddingBottom = '';
});

document.getElementById('drawer-open-log').addEventListener('click', async () => {
  if (drawerLogFile) await window.api.openLog(drawerLogFile);
});

document.getElementById('drawer-run-all').addEventListener('click', () => {
  if (!drawerCommandId) return;
  const cmd = _getConfig().commands.find(c => c.id === drawerCommandId);
  if (!cmd?.content) return;
  const lines = cmd.content.split('\n').filter(l => l.trim() !== '');
  lines.forEach(line => window.api.ptyWrite(drawerCommandId, line + '\r'));
});
