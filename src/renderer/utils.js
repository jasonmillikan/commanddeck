export function migrateCommands(commands) {
  let changed = false;
  const migrated = commands.map(cmd => {
    if (cmd.tags !== undefined) return cmd;
    changed = true;
    const { group, ...rest } = cmd;
    return { ...rest, tags: group ? [group] : [] };
  });
  return { commands: migrated, changed };
}

export function applyReorder(allCommands, newVisibleIds) {
  const visibleSet = new Set(newVisibleIds);
  const positions = [];
  for (let i = 0; i < allCommands.length; i++) {
    if (visibleSet.has(allCommands[i].id)) positions.push(i);
  }
  const byId = Object.fromEntries(allCommands.map(c => [c.id, c]));
  const result = [...allCommands];
  positions.forEach((pos, i) => {
    result[pos] = byId[newVisibleIds[i]];
  });
  return result;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function badgeFor(type) {
  const labels = { toggle: 'TOGGLE', launcher: 'LAUNCHER', foreground: 'FOREGROUND', cheatsheet: 'SHEET' };
  return `<span class="card-type-badge type-badge type-${type}">${labels[type]}</span>`;
}

export function keyEventToAccelerator(e) {
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
