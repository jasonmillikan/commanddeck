function migrateCommands(commands) {
  let changed = false;
  const migrated = commands.map(cmd => {
    if (cmd.tags !== undefined) return cmd;
    changed = true;
    const { group, ...rest } = cmd;
    return { ...rest, tags: group ? [group] : [] };
  });
  return { commands: migrated, changed };
}

function applyReorder(allCommands, newVisibleIds) {
  // Find which indices in allCommands are currently occupied by visible cards
  const visibleSet = new Set(newVisibleIds);
  const positions = [];
  for (let i = 0; i < allCommands.length; i++) {
    if (visibleSet.has(allCommands[i].id)) positions.push(i);
  }
  // Map each new visible ID to its command object
  const byId = Object.fromEntries(allCommands.map(c => [c.id, c]));
  const result = [...allCommands];
  positions.forEach((pos, i) => {
    result[pos] = byId[newVisibleIds[i]];
  });
  return result;
}

if (typeof module !== 'undefined') {
  module.exports = { migrateCommands, applyReorder };
}
