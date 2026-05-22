// ─── Starter data (mirrors src/defaults/*.json for recreate functionality) ────
const STARTER_DATA = {
  linux: [
    {
      id: 'starter-linux-audio-loopback', label: 'Audio Loopback', type: 'toggle', tags: ['Audio'],
      note: 'Routes mic to speakers. Requires PulseAudio or PipeWire (standard on Ubuntu, Fedora, Arch).',
      onCmd: 'pactl load-module module-loopback latency_msec=1',
      offCmd: 'pactl unload-module module-loopback',
    },
    {
      id: 'starter-linux-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: 'Requires NetworkManager (standard on most desktop distros).',
      onCmd: 'nmcli radio wifi on', offCmd: 'nmcli radio wifi off',
    },
    {
      id: 'starter-linux-home-folder', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your default file manager — works across GNOME, KDE, XFCE, and others.',
      launchCmd: 'xdg-open ~',
    },
    {
      id: 'starter-linux-system-monitor', label: 'System Monitor', type: 'foreground', tags: ['System'],
      note: 'Install if needed: sudo apt install htop (or dnf/pacman equivalent).',
      onCmd: 'htop',
    },
    {
      id: 'starter-linux-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics. nmap requires separate installation.',
      content: 'ip addr show\nip route\nss -tulnp\ncurl ifconfig.me\nnmap -sn 192.168.1.0/24',
    },
  ],
  darwin: [
    {
      id: 'starter-mac-dark-mode', label: 'Dark Mode', type: 'toggle', tags: ['Appearance'],
      note: 'Toggles system-wide dark/light appearance.',
      onCmd:  "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to true'",
      offCmd: "osascript -e 'tell app \"System Events\" to tell appearance preferences to set dark mode to false'",
    },
    {
      id: 'starter-mac-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: "Turns the Wi-Fi radio on or off. Interface is usually en0, but may vary — run 'networksetup -listallhardwareports' to confirm.",
      onCmd: 'networksetup -setairportpower en0 on', offCmd: 'networksetup -setairportpower en0 off',
    },
    {
      id: 'starter-mac-finder', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your home directory in Finder.',
      launchCmd: 'open ~',
    },
    {
      id: 'starter-mac-keep-awake', label: 'Keep Awake', type: 'foreground', tags: ['System'],
      note: 'Prevents the display from sleeping while running. Kill to allow sleep again.',
      onCmd: 'caffeinate -d',
    },
    {
      id: 'starter-mac-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics for macOS.',
      content: 'ifconfig\nnetstat -rn\ncurl ifconfig.me\nnetworksetup -listallnetworkservices\nscutil --dns',
    },
  ],
  win32: [
    {
      id: 'starter-win-dark-mode', label: 'Dark Mode', type: 'toggle', tags: ['Appearance'],
      note: 'Toggles app dark/light theme via registry.',
      onCmd:  'reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 0 /f',
      offCmd: 'reg add HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize /v AppsUseLightTheme /t REG_DWORD /d 1 /f',
    },
    {
      id: 'starter-win-wifi', label: 'Wi-Fi', type: 'toggle', tags: ['Network'],
      note: "Interface name may vary — run 'netsh interface show interface' to find yours.",
      onCmd: 'netsh interface set interface "Wi-Fi" enabled',
      offCmd: 'netsh interface set interface "Wi-Fi" disabled',
    },
    {
      id: 'starter-win-file-explorer', label: 'Open Home Folder', type: 'launcher', tags: ['Apps'],
      note: 'Opens your home directory in File Explorer.',
      launchCmd: 'explorer.exe %USERPROFILE%',
    },
    {
      id: 'starter-win-ping-monitor', label: 'Ping Monitor', type: 'foreground', tags: ['Network'],
      note: 'Continuous connectivity check — streams output to the in-app terminal.',
      onCmd: 'ping -t 8.8.8.8',
    },
    {
      id: 'starter-win-network-toolkit', label: 'Network Toolkit', type: 'cheatsheet', tags: ['Network'],
      note: 'Common network diagnostics for Windows.',
      content: 'ipconfig /all\nnetstat -an\ntracert 8.8.8.8\nnslookup google.com\narp -a',
    },
  ],
};

const SECTION_META = {
  toggle: {
    title: 'Toggle Commands',
    desc: 'Run one command to turn something ON, another to turn it OFF. Perfect for system settings you flip regularly — audio routing, Wi-Fi, display modes. Toggle state is remembered between sessions.',
  },
  launcher: {
    title: 'Launcher Commands',
    desc: "Fire-and-forget. Spawns a process detached from CommandDeck — the app keeps running even after CommandDeck closes. Use this for apps and long-lived services you don't need to monitor.",
  },
  foreground: {
    title: 'Foreground Commands',
    desc: 'Runs a managed process attached to CommandDeck. Output streams to the in-app terminal drawer in real time, and you can kill it with the KILL button. Use this for servers, monitors, and sync daemons.',
  },
  cheatsheet: {
    title: 'Cheatsheet Cards',
    desc: 'Read-only reference cards. Each line of content becomes a clickable snippet in the in-app terminal (TERM button) — click to send the command straight to the shell. Use OPEN to view the full sheet in your system terminal.',
  },
};

const SECTIONS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'toggle',     label: '⇄ Toggle' },
  { id: 'launcher',   label: '⚡ Launcher' },
  { id: 'foreground', label: '▶ Foreground' },
  { id: 'cheatsheet', label: '≡ Cheatsheet' },
];

// ─── State ────────────────────────────────────────────────────────────────────
let _getConfig    = null;
let _getPlatform  = null;
let _addCommand   = null;
let _activeSection = 'overview';

// ─── Public API ───────────────────────────────────────────────────────────────
export function initHelpModal({ getConfig, getPlatform, addCommand }) {
  _getConfig   = getConfig;
  _getPlatform = getPlatform;
  _addCommand  = addCommand;

  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  document.getElementById('help-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeHelpModal();
  });
  document.getElementById('help-content').addEventListener('click', e => {
    const btn = e.target.closest('.btn-recreate');
    if (btn) _handleRecreate(btn.dataset.id);
  });
}

export function openHelpModal() {
  _activeSection = 'overview';
  _renderNav();
  _renderContent();
  document.getElementById('help-backdrop').classList.add('open');
}

export function closeHelpModal() {
  document.getElementById('help-backdrop').classList.remove('open');
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function _renderNav() {
  const nav = document.getElementById('help-nav');
  nav.innerHTML = '<div class="help-nav-label">SECTIONS</div>' +
    SECTIONS.map(s =>
      `<div class="help-nav-item${s.id === _activeSection ? ' active' : ''}" data-section="${s.id}">${s.label}</div>`
    ).join('');
  nav.querySelectorAll('.help-nav-item').forEach(el => {
    el.addEventListener('click', () => {
      _activeSection = el.dataset.section;
      _renderNav();
      _renderContent();
    });
  });
}

function _renderContent() {
  document.getElementById('help-content').innerHTML =
    _activeSection === 'overview' ? _overviewHtml() : _typeHtml(_activeSection);
}

function _overviewHtml() {
  const types = [
    { type: 'toggle',     name: 'ON / OFF command pairs',  desc: 'Flip system settings with two commands. e.g. load/unload a module, start/stop a service.' },
    { type: 'launcher',   name: 'Fire &amp; forget',       desc: 'Launch an app detached. It keeps running after CommandDeck closes.' },
    { type: 'foreground', name: 'Managed process',         desc: 'Runs attached, streams output, killable. Perfect for servers or sync daemons.' },
    { type: 'cheatsheet', name: 'Reference card',          desc: 'Clickable snippets in an in-app terminal. No command runs until you choose.' },
  ];
  return `
    <h3>What is CommandDeck?</h3>
    <p>CommandDeck lives in your system tray and gives you a visual board of terminal commands you run every day.
       No more hunting through shell history — just click to toggle, launch, or inspect.</p>
    <div class="help-section-label">CARD TYPES AT A GLANCE</div>
    ${types.map(t => `
      <div class="help-type-row">
        <span class="help-type-badge ${t.type}">${t.type.toUpperCase()}</span>
        <div class="help-type-row-body"><h4>${t.name}</h4><p>${t.desc}</p></div>
      </div>
    `).join('')}
  `;
}

function _typeHtml(type) {
  const meta = SECTION_META[type];
  const plat = _getPlatform();
  const starters = (STARTER_DATA[plat] || STARTER_DATA.linux).filter(s => s.type === type);
  const currentIds = new Set((_getConfig().commands || []).map(c => c.id));
  return `
    <h3>${meta.title}</h3>
    <p>${meta.desc}</p>
    ${starters.length ? `<div class="help-section-label">STARTER EXAMPLE</div>` : ''}
    ${starters.map(s => `
      <div class="help-example">
        <div class="help-example-header">
          <span class="help-example-label">${s.label}</span>
          ${!currentIds.has(s.id) ? `<button class="btn-recreate" data-id="${s.id}">RECREATE</button>` : ''}
        </div>
        ${s.note ? `<div class="help-example-note">${s.note}</div>` : ''}
      </div>
    `).join('')}
  `;
}

async function _handleRecreate(starterId) {
  const plat = _getPlatform();
  const all = STARTER_DATA[plat] || STARTER_DATA.linux;
  const starter = all.find(s => s.id === starterId);
  if (!starter) return;
  await _addCommand(starter);
  _renderContent();
}
