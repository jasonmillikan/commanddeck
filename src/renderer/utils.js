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
  // placeholder — implemented in Task 3
  return allCommands;
}

if (typeof module !== 'undefined') {
  module.exports = { migrateCommands, applyReorder };
}
