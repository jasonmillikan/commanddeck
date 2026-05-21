// ─── State ────────────────────────────────────────────────────────────────────
let config = { commands: [] };
// commandId → { pid, startedAt, logFile }[]
let liveMap = {};
// commandId → latest output lines[]
let outputMap = {};
let activeGroup = 'all';
let searchQuery = '';
let editingId = null;
let modalTags = [];
let drawerCommandId = null;
let drawerLogFile = null;
let sortableInstance = null;
let prefs = { hotkey: '', notify: { onCrash: true, onUnexpectedExit: false } };
const terminalMap = new Map(); // commandId → { term, fitAddon }
let activeTerminalId = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function commandIsRunning(id) {
  return (liveMap[id] || []).length > 0;
}

function getFirstPid(id) {
  return (liveMap[id] || [])[0]?.pid;
}

function getStartedAt(id) {
  return (liveMap[id] || [])[0]?.startedAt;
}

function getLogFile(id) {
  return (liveMap[id] || [])[0]?.logFile;
}

// ─── Config persistence ───────────────────────────────────────────────────────
async function loadAll() {
  const raw = await window.api.loadConfig();
  const { commands, changed } = migrateCommands(raw.commands || []);
  config = { ...raw, commands };
  if (changed) await window.api.saveConfig(config);
  liveMap = await window.api.getLiveProcesses();
  prefs = await window.api.loadPrefs();
  document.getElementById('output-drawer').style.height = (prefs.drawerHeight || 240) + 'px';
  renderAll();
}

async function persist() {
  await window.api.saveConfig(config);
}

// ─── Group list ───────────────────────────────────────────────────────────────
function renderGroups() {
  const tags = ['all', ...new Set(config.commands.flatMap(c => c.tags || []).filter(Boolean))];
  const el = document.getElementById('group-list');
  el.innerHTML = tags.map(t => `
    <div class="group-item ${activeGroup === t ? 'active' : ''}" data-group="${t}">
      ${t === 'all' ? 'All Commands' : t}
    </div>
  `).join('');
  el.querySelectorAll('.group-item').forEach(item => {
    item.addEventListener('click', () => {
      activeGroup = item.dataset.group;
      renderAll();
    });
  });
}

// ─── Cards ────────────────────────────────────────────────────────────────────
function filteredCommands() {
  return config.commands.filter(cmd => {
    const tagOk = activeGroup === 'all' || (cmd.tags || []).includes(activeGroup);
    const q = searchQuery.toLowerCase();
    const searchOk = !q ||
      cmd.label.toLowerCase().includes(q) ||
      (cmd.note || '').toLowerCase().includes(q) ||
      (cmd.onCmd || '').toLowerCase().includes(q) ||
      (cmd.content || '').toLowerCase().includes(q);
    return tagOk && searchOk;
  });
}

function badgeFor(type) {
  const map = { toggle: 'badge-toggle', launcher: 'badge-launcher', foreground: 'badge-foreground', cheatsheet: 'badge-cheatsheet' };
  const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
  return `<span class="card-type-badge ${map[type]}">${labels[type]}</span>`;
}

function renderCard(cmd) {
  if (cmd.type === 'cheatsheet') {
    const previewLine = (cmd.content || '').split('\n')[0] || '';
    return `
      <div class="card" data-id="${cmd.id}">
        <div class="card-drag-handle">⠿</div>
        <div class="card-body" data-action="view" data-id="${cmd.id}">
          <div class="card-header">
            <div class="card-info">
              <div class="card-label">${escHtml(cmd.label)}</div>
              ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
            </div>
            ${badgeFor(cmd.type)}
          </div>
          <div class="card-cmd" title="${escHtml(cmd.content || '')}">${escHtml(previewLine)}</div>
          <div class="card-actions">
            <button class="card-btn card-btn-view"   data-action="view"   data-id="${cmd.id}">VIEW</button>
            <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
          </div>
        </div>
      </div>
    `;
  }
  const running = commandIsRunning(cmd.id);
  const pid = getFirstPid(cmd.id);
  const startedAt = getStartedAt(cmd.id);
  const displayCmd = running && cmd.type === 'toggle'
    ? (cmd.offCmd || cmd.onCmd)
    : (cmd.onCmd || cmd.launchCmd || '');
  const isLastSession = (liveMap[cmd.id] || [])[0]?.lastSession === true;

  let metaHtml;
  if (!running) {
    metaHtml = `<div class="card-meta"><div class="meta-dot"></div><span>idle</span></div>`;
  } else if (isLastSession) {
    metaHtml = `<div class="card-meta"><div class="meta-dot last-session"></div><span class="meta-last-session">last session</span></div>`;
  } else {
    metaHtml = `
    <div class="card-meta">
      <div class="meta-dot live"></div>
      ${pid ? `<span class="meta-pid">PID ${pid}</span>` : ''}
      ${startedAt ? `<span class="meta-time">since ${formatTime(startedAt)}</span>` : ''}
    </div>
  `;
  }

  // Bottom action buttons vary by type and state
  let actionsHtml = '';
  if (cmd.type === 'toggle') {
    actionsHtml = `
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  } else if (cmd.type === 'launcher') {
    actionsHtml = `
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  } else { // foreground
    actionsHtml = `
      ${running ? `<button class="card-btn card-btn-kill" data-action="kill" data-id="${cmd.id}">KILL</button>` : ''}
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  }

  // Toggle switch for toggle-type; Launch button for others
  let controlHtml = '';
  if (cmd.type === 'toggle') {
    controlHtml = `
      <div class="toggle-wrap">
        <span class="toggle-label">${running ? 'ON' : 'OFF'}</span>
        <label class="toggle">
          <input type="checkbox" data-action="toggle" data-id="${cmd.id}" ${running ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  } else {
    const btnLabel = cmd.type === 'launcher' ? 'LAUNCH' : 'START';
    controlHtml = running
      ? `<div class="toggle-wrap"><span class="toggle-label" style="color:var(--accent)">● RUNNING</span></div>`
      : `<div class="toggle-wrap">
           <button class="card-btn card-btn-start" data-action="start" data-id="${cmd.id}" style="border:none;text-align:left;flex:none;padding:4px 0">${btnLabel}</button>
         </div>`;
  }

  return `
    <div class="card ${running ? 'running' : ''}" data-id="${cmd.id}">
      <div class="card-drag-handle">⠿</div>
      <div class="card-body">
        <div class="card-header">
          <div class="card-info">
            <div class="card-label">${escHtml(cmd.label)}</div>
            ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
          </div>
          ${badgeFor(cmd.type)}
        </div>
        <div class="card-cmd" title="${escHtml(displayCmd)}">${escHtml(displayCmd)}</div>
        ${metaHtml}
        ${controlHtml}
        <div class="card-actions">${actionsHtml}</div>
      </div>
    </div>
  `;
}

function escHtml(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function keyEventToAccelerator(e) {
  const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS']);
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key === 'ArrowUp') key = 'Up';
  else if (key === 'ArrowDown') key = 'Down';
  else if (key === 'ArrowLeft') key = 'Left';
  else if (key === 'ArrowRight') key = 'Right';
  else if (key.length === 1) key = key.toUpperCase();

  const isFunctionKey = /^F\d+$/.test(key);
  if (parts.length === 0 && !isFunctionKey) return null;

  return [...parts, key].join('+');
}

let hotkeyRecording = false;
let hotkeyRecordPrev = '';

function startHotkeyRecording() {
  hotkeyRecording = true;
  hotkeyRecordPrev = document.getElementById('p-hotkey').value;
  const input = document.getElementById('p-hotkey');
  input.value = '';
  input.placeholder = 'Press keys…';
  input.classList.add('recording');
  document.getElementById('p-hotkey-record').textContent = 'Cancel';
  document.addEventListener('keydown', handleHotkeyCapture);
}

function stopHotkeyRecording(revert = false) {
  if (!hotkeyRecording) return;
  hotkeyRecording = false;
  const input = document.getElementById('p-hotkey');
  input.classList.remove('recording');
  input.placeholder = 'None';
  document.getElementById('p-hotkey-record').textContent = 'Record';
  document.removeEventListener('keydown', handleHotkeyCapture);
  if (revert) input.value = hotkeyRecordPrev;
}

function handleHotkeyCapture(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopHotkeyRecording(true); return; }
  const acc = keyEventToAccelerator(e);
  if (!acc) return;
  document.getElementById('p-hotkey').value = acc;
  stopHotkeyRecording();
}

async function handleDragEnd(evt) {
  if (evt.oldIndex === evt.newIndex) return;
  const container = document.getElementById('cards-container');
  const newVisibleIds = [...container.querySelectorAll('.card[data-id]')].map(el => el.dataset.id);
  config.commands = applyReorder(config.commands, newVisibleIds);
  await persist();
}

function renderCards() {
  const container = document.getElementById('cards-container');
  const cmds = filteredCommands();
  if (cmds.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⬡</div>
        <div class="empty-state-text">${config.commands.length === 0 ? 'No commands yet' : 'No matches'}</div>
        <div class="empty-state-hint">${config.commands.length === 0 ? 'Click "+ New Command" to get started' : 'Try a different search or tag'}</div>
      </div>`;
    if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }
    return;
  }
  container.innerHTML = cmds.map(renderCard).join('');
  attachCardListeners();
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(container, {
    handle: '.card-drag-handle',
    animation: 150,
    onEnd: handleDragEnd,
  });
}

function renderStats() {
  const running = Object.values(liveMap).filter(arr => arr.length > 0).length;
  document.getElementById('stat-running').textContent = `${running} running`;
  document.getElementById('stat-total').textContent = `${config.commands.length} total`;
}

function renderAll() {
  renderGroups();
  renderCards();
  renderStats();
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
  // re-attach after handling
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
    if (checked) {
      await startCommand(cmd);
    } else {
      await stopCommand(cmd);
    }
  } else if (action === 'start') {
    await startCommand(cmd);
  } else if (action === 'kill') {
    const pid = getFirstPid(id);
    if (pid) {
      await window.api.killProcess(pid);
      liveMap[id] = [];
      renderAll();
    }
  } else if (action === 'log' || action === 'view') {
    openDrawer(cmd);
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
    // For toggle-on (one-shot), mark as "active" with no PID
    if (type === 'toggle-on') {
      liveMap[cmd.id] = [{ pid: null, startedAt: new Date().toISOString(), logFile: result.logFile, lastSession: false }];
    }
  }
  renderAll();
}

async function stopCommand(cmd) {
  if (cmd.type === 'toggle' && cmd.offCmd) {
    const result = await window.api.runCommand({
      commandId: cmd.id,
      label: cmd.label,
      cmdString: cmd.offCmd,
      type: 'toggle-off'
    });
    liveMap[cmd.id] = [];
  } else {
    const pid = getFirstPid(cmd.id);
    if (pid) await window.api.killProcess(pid);
    liveMap[cmd.id] = [];
  }
  renderAll();
}

// ─── In-app terminal ─────────────────────────────────────────────────────────
async function initTerminal(cmd) {
  if (terminalMap.has(cmd.id)) return;
  terminalMap.set(cmd.id, null); // claim slot before any await to prevent double-init on concurrent calls
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
  try {
    await window.api.ptyCreate(cmd.id);
  } catch (err) {
    terminalMap.delete(cmd.id);
    container.remove();
    throw err;
  }
  terminalMap.set(cmd.id, { term, fitAddon });
}

function switchToTerminal(cmdId) {
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

// ─── Output drawer ────────────────────────────────────────────────────────────
function openDrawer(cmd) {
  drawerCommandId = cmd.id;
  const logBtn = document.getElementById('drawer-open-log');
  document.getElementById('drawer-title').textContent = `▸ ${cmd.label}`;
  const out = document.getElementById('drawer-output');

  if (cmd.type === 'cheatsheet') {
    drawerLogFile = null;
    logBtn.style.display = 'none';
    out.textContent = cmd.content || '(empty)';
    out.scrollTop = 0;
  } else {
    drawerLogFile = getLogFile(cmd.id);
    logBtn.style.display = '';
    const lines = outputMap[cmd.id] || [];
    out.textContent = lines.length ? lines.join('') : '(no output captured yet — start the command first)';
    out.scrollTop = out.scrollHeight;
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

// ─── Modal ────────────────────────────────────────────────────────────────────
function renderTagChips() {
  const wrap = document.getElementById('f-tags-wrap');
  const input = document.getElementById('f-tags-input');
  // Remove existing chips (leave the input in place)
  wrap.querySelectorAll('.tag-chip').forEach(el => el.remove());
  modalTags.forEach((tag, i) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<button class="tag-chip-remove" data-index="${i}" tabindex="-1">×</button>`;
    wrap.insertBefore(chip, input);
  });
}

function populateTagsDatalist() {
  const all = [...new Set(config.commands.flatMap(c => c.tags || []).filter(Boolean))];
  const dl = document.getElementById('tags-datalist');
  dl.innerHTML = all.map(t => `<option value="${escHtml(t)}">`).join('');
}

function openModal(cmd = null) {
  editingId = cmd?.id || null;
  document.getElementById('modal-title').textContent = cmd ? 'Edit Command' : 'New Command';
  document.getElementById('f-label').value = cmd?.label || '';
  document.getElementById('f-note').value = cmd?.note || '';
  document.getElementById('f-type').value = cmd?.type || 'toggle';
  document.getElementById('f-on').value = cmd?.onCmd || cmd?.launchCmd || '';
  document.getElementById('f-off').value = cmd?.offCmd || '';
  document.getElementById('f-auto-restore').checked = cmd?.autoRestore || false;
  document.getElementById('f-content').value = cmd?.content || '';
  modalTags = [...(cmd?.tags || [])];
  populateTagsDatalist();
  renderTagChips();
  document.getElementById('f-tags-input').value = '';
  updateModalFields();
  document.getElementById('modal-delete').style.display = editingId ? '' : 'none';
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('f-label').focus();
}

function updateModalFields() {
  const type = document.getElementById('f-type').value;
  const onLabel = document.getElementById('f-on-label');
  const onRow = document.getElementById('f-on-row');
  const offRow = document.getElementById('f-off-row');
  const autoRestoreRow = document.getElementById('f-auto-restore-row');
  const contentRow = document.getElementById('f-content-row');

  if (type === 'cheatsheet') {
    onRow.style.display = 'none';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    contentRow.style.display = '';
    return;
  }
  contentRow.style.display = 'none';
  onRow.style.display = '';
  if (type === 'toggle') {
    onLabel.firstChild.textContent = 'ON Command ';
    offRow.style.display = '';
    autoRestoreRow.style.display = '';
  } else if (type === 'launcher') {
    onLabel.firstChild.textContent = 'Launch Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  } else {
    onLabel.firstChild.textContent = 'Command ';
    offRow.style.display = 'none';
    autoRestoreRow.style.display = 'none';
    document.getElementById('f-auto-restore').checked = false;
  }
}

document.getElementById('f-type').addEventListener('change', updateModalFields);

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.getElementById('modal-delete').style.display = 'none';
  editingId = null;
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-delete').addEventListener('click', async () => {
  const cmd = config.commands.find(c => c.id === editingId);
  if (!cmd) return;
  if (confirm(`Delete "${cmd.label}"?`)) {
    config.commands = config.commands.filter(c => c.id !== editingId);
    await persist();
    closeModal();
    renderAll();
  }
});
document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Tag chip input events
document.getElementById('f-tags-wrap').addEventListener('click', e => {
  const btn = e.target.closest('.tag-chip-remove');
  if (btn) {
    modalTags.splice(Number(btn.dataset.index), 1);
    renderTagChips();
  } else {
    document.getElementById('f-tags-input').focus();
  }
});

document.getElementById('f-tags-input').addEventListener('keydown', e => {
  const input = e.target;
  if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
    e.preventDefault();
    const tag = input.value.trim().replace(/,$/, '');
    if (tag && !modalTags.includes(tag)) modalTags.push(tag);
    input.value = '';
    renderTagChips();
  } else if (e.key === 'Backspace' && input.value === '' && modalTags.length > 0) {
    modalTags.pop();
    renderTagChips();
  }
});

document.getElementById('f-tags-input').addEventListener('change', e => {
  // Handle datalist selection (fires 'change' when an option is picked)
  const tag = e.target.value.trim();
  if (tag && !modalTags.includes(tag)) {
    modalTags.push(tag);
    e.target.value = '';
    renderTagChips();
  }
});

document.getElementById('modal-save').addEventListener('click', async () => {
  const label = document.getElementById('f-label').value.trim();
  const type = document.getElementById('f-type').value;

  // Flush any partially-typed tag in the input
  const tagInput = document.getElementById('f-tags-input');
  const pending = tagInput.value.trim().replace(/,$/, '');
  if (pending && !modalTags.includes(pending)) modalTags.push(pending);
  tagInput.value = '';

  if (type === 'cheatsheet') {
    const content = document.getElementById('f-content').value.trim();
    if (!label || !content) { alert('Label and content are required.'); return; }
    const entry = {
      id: editingId || uid(),
      label,
      note: document.getElementById('f-note').value.trim(),
      type: 'cheatsheet',
      tags: [...modalTags],
      content,
    };
    if (editingId) {
      const idx = config.commands.findIndex(c => c.id === editingId);
      if (idx !== -1) config.commands[idx] = entry;
    } else {
      config.commands.push(entry);
    }
    await persist();
    closeModal();
    renderAll();
    return;
  }

  const onCmd = document.getElementById('f-on').value.trim();
  if (!label || !onCmd) { alert('Label and command are required.'); return; }

  const entry = {
    id: editingId || uid(),
    label,
    note: document.getElementById('f-note').value.trim(),
    type,
    tags: [...modalTags],
    ...(type === 'toggle' ? {
      onCmd,
      offCmd: document.getElementById('f-off').value.trim(),
      autoRestore: document.getElementById('f-auto-restore').checked,
    } : {}),
    ...(type === 'launcher'  ? { launchCmd: onCmd } : {}),
    ...(type === 'foreground'? { onCmd } : {}),
  };

  if (editingId) {
    const idx = config.commands.findIndex(c => c.id === editingId);
    if (idx !== -1) config.commands[idx] = entry;
  } else {
    config.commands.push(entry);
  }
  await persist();
  closeModal();
  renderAll();
});

// ─── Preferences modal ───────────────────────────────────────────────────────
async function openPrefsModal() {
  document.getElementById('p-hotkey').value = prefs.hotkey || '';
  document.getElementById('p-hotkey-error').textContent = '';
  document.getElementById('p-notify-crash').checked = prefs.notify.onCrash;
  document.getElementById('p-notify-unexpected').checked = prefs.notify.onUnexpectedExit;
  document.getElementById('p-autostart').checked = await window.api.getAutostart();
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.add('open');
}

function closePrefsModal() {
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.remove('open');
}

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
document.getElementById('btn-prefs').addEventListener('click', openPrefsModal);
document.getElementById('prefs-close').addEventListener('click', closePrefsModal);
document.getElementById('prefs-cancel').addEventListener('click', closePrefsModal);
document.getElementById('prefs-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closePrefsModal();
});
document.getElementById('p-hotkey-record').addEventListener('click', () => {
  if (hotkeyRecording) stopHotkeyRecording(true);
  else startHotkeyRecording();
});
document.getElementById('p-hotkey-clear').addEventListener('click', () => {
  stopHotkeyRecording();
  document.getElementById('p-hotkey').value = '';
});
document.getElementById('prefs-save').addEventListener('click', async () => {
  const hotkey = document.getElementById('p-hotkey').value.trim();
  const updated = {
    ...prefs,
    hotkey,
    notify: {
      onCrash: document.getElementById('p-notify-crash').checked,
      onUnexpectedExit: document.getElementById('p-notify-unexpected').checked,
    },
  };
  const result = await window.api.savePrefs(updated);
  if (!result.ok && result.error === 'hotkey_conflict') {
    document.getElementById('p-hotkey-error').textContent = 'That shortcut is already in use — try another.';
    return;
  }
  await window.api.setAutostart(document.getElementById('p-autostart').checked);
  prefs = updated;
  closePrefsModal();
});

document.getElementById('btn-export').addEventListener('click', async () => {
  await window.api.exportConfig();
});

document.getElementById('btn-import').addEventListener('click', async () => {
  const result = await window.api.importConfig();
  if (result.ok) { config = result.data; renderAll(); }
});

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('search-box').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderCards();
});

// ─── Events from main process ─────────────────────────────────────────────────
window.api.onProcessExited(({ commandId, pid, code }) => {
  if (liveMap[commandId]) {
    liveMap[commandId] = liveMap[commandId].filter(p => p.pid !== pid);
  }
  renderAll();
  // Append to output
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(`\n[Process exited with code ${code}]\n`);
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

window.api.onProcessOutput(({ commandId, pid, text }) => {
  if (!outputMap[commandId]) outputMap[commandId] = [];
  outputMap[commandId].push(text);
  // Cap at ~500 lines
  if (outputMap[commandId].length > 500) outputMap[commandId] = outputMap[commandId].slice(-300);
  if (drawerCommandId === commandId) {
    const out = document.getElementById('drawer-output');
    out.textContent = outputMap[commandId].join('');
    out.scrollTop = out.scrollHeight;
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.api.onPtyData(({ commandId, data }) => {
  terminalMap.get(commandId)?.term.write(data);
});

loadAll();

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
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
})();
