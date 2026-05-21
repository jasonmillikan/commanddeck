export const XTERM_THEMES = {
  dark: {
    background: '#0c0e14', foreground: '#e2e8f0', cursor: '#4ade80',
    black: '#1a1e2e',   brightBlack: '#64748b',
    red: '#f87171',     brightRed: '#ef4444',
    green: '#4ade80',   brightGreen: '#86efac',
    yellow: '#fbbf24',  brightYellow: '#fde68a',
    blue: '#60a5fa',    brightBlue: '#93c5fd',
    magenta: '#c084fc', brightMagenta: '#e879f9',
    cyan: '#22d3ee',    brightCyan: '#67e8f9',
    white: '#e2e8f0',   brightWhite: '#f8fafc',
  },
  light: {
    background: '#fafaf7', foreground: '#1a1a14', cursor: '#15803d',
    black: '#4b5563',   brightBlack: '#6b7280',
    red: '#c0392b',     brightRed: '#dc2626',
    green: '#15803d',   brightGreen: '#16a34a',
    yellow: '#92400e',  brightYellow: '#b45309',
    blue: '#1d4ed8',    brightBlue: '#2563eb',
    magenta: '#7c3aed', brightMagenta: '#9333ea',
    cyan: '#0e7490',    brightCyan: '#0891b2',
    white: '#374151',   brightWhite: '#1a1a14',
  },
};

const terminalMap = new Map();
let activeTerminalId = null;

export async function initTerminal(cmd) {
  if (terminalMap.has(cmd.id)) return;
  terminalMap.set(cmd.id, null);
  const container = document.createElement('div');
  container.id = `terminal-${cmd.id}`;
  container.className = 'terminal-instance xterm-hidden';
  document.getElementById('drawer-terminals').appendChild(container);

  const mode = document.documentElement.getAttribute('data-theme') || 'dark';
  const term = new Terminal({
    theme: XTERM_THEMES[mode] || XTERM_THEMES.dark,
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

export function setXtermTheme(mode) {
  for (const entry of terminalMap.values()) {
    if (entry) entry.term.options.theme = XTERM_THEMES[mode];
  }
}
