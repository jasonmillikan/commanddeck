import { escHtml, badgeFor, formatTime } from './utils.js';

let sortableInstance = null;

function commandIsRunning(id, liveMap) { return (liveMap[id] || []).length > 0; }
function getFirstPid(id, liveMap)      { return (liveMap[id] || [])[0]?.pid; }
function getStartedAt(id, liveMap)     { return (liveMap[id] || [])[0]?.startedAt; }

export function filteredCommands(config, activeGroup, searchQuery) {
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

export function renderCard(cmd, liveMap) {
  if (cmd.type === 'cheatsheet') {
    const previewLine = (cmd.content || '').split('\n')[0] || '';
    return `
      <div class="card" data-id="${cmd.id}">
        <div class="card-drag-handle">⠿</div>
        <div class="card-body" data-action="term" data-id="${cmd.id}">
          <div class="card-header">
            <div class="card-info">
              <div class="card-label">${escHtml(cmd.label)}</div>
              ${cmd.note ? `<div class="card-note">${escHtml(cmd.note)}</div>` : ''}
            </div>
            ${badgeFor(cmd.type)}
          </div>
          <div class="card-cmd" title="${escHtml(cmd.content || '')}">${escHtml(previewLine)}</div>
          <div class="card-actions">
            <button class="card-btn card-btn-open" data-action="open" data-id="${cmd.id}">OPEN</button>
            <button class="card-btn card-btn-term" data-action="term" data-id="${cmd.id}">TERM</button>
            <button class="card-btn card-btn-edit" data-action="edit" data-id="${cmd.id}">EDIT</button>
          </div>
        </div>
      </div>
    `;
  }
  const running = commandIsRunning(cmd.id, liveMap);
  const pid = getFirstPid(cmd.id, liveMap);
  const startedAt = getStartedAt(cmd.id, liveMap);
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
  } else {
    actionsHtml = `
      ${running ? `<button class="card-btn card-btn-kill" data-action="kill" data-id="${cmd.id}">KILL</button>` : ''}
      <button class="card-btn card-btn-log"    data-action="log"    data-id="${cmd.id}">LOG</button>
      <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${cmd.id}">EDIT</button>
    `;
  }

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

export function renderCards(config, activeGroup, searchQuery, liveMap, { onDragEnd, attachListeners }) {
  const container = document.getElementById('cards-container');
  const cmds = filteredCommands(config, activeGroup, searchQuery);
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
  container.innerHTML = cmds.map(cmd => renderCard(cmd, liveMap)).join('');
  attachListeners();
  if (sortableInstance) sortableInstance.destroy();
  sortableInstance = Sortable.create(container, {
    handle: '.card-drag-handle',
    animation: 150,
    onEnd: onDragEnd,
  });
}

export function renderStats(config, liveMap) {
  const running = Object.values(liveMap).filter(arr => arr.length > 0).length;
  document.getElementById('stat-running').textContent = `${running} running`;
  document.getElementById('stat-total').textContent = `${config.commands.length} total`;
}
