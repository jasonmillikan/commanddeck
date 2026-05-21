const terminalMap = new Map();
let activeTerminalId = null;

export async function initTerminal(cmd) {
  if (terminalMap.has(cmd.id)) return;
  terminalMap.set(cmd.id, null);
  const container = document.createElement('div');
  container.id = `terminal-${cmd.id}`;
  container.className = 'terminal-instance xterm-hidden';
  document.getElementById('drawer-terminals').appendChild(container);

  const term = new Terminal({
    theme: { background: '#12151f', foreground: '#e2e8f0', cursor: '#4ade80' },
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
    cursorBlink: true,
  });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  term.onData(data => window.api.ptyWrite(cmd.id, data));
  terminalMap.set(cmd.id, { term, fitAddon, ready: false, pendingWrites: [] });
  try {
    await window.api.ptyCreate(cmd.id);
  } catch (err) {
    terminalMap.delete(cmd.id);
    container.remove();
    throw err;
  }
}

export function switchToTerminal(cmdId) {
  document.querySelectorAll('.terminal-instance').forEach(el => el.classList.add('xterm-hidden'));
  const container = document.getElementById(`terminal-${cmdId}`);
  if (container) container.classList.remove('xterm-hidden');
  const entry = terminalMap.get(cmdId);
  if (entry) {
    entry.fitAddon.fit();
    const { cols, rows } = entry.term;
    window.api.ptyResize(cmdId, cols, rows);
  }
  activeTerminalId = cmdId;
}

export function getTerminalEntry(cmdId) {
  return terminalMap.get(cmdId);
}

export function deleteTerminalEntry(cmdId) {
  terminalMap.delete(cmdId);
}

export function getActiveTerminalId() {
  return activeTerminalId;
}
