const fs = require('fs');

function loadState(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { toggles: {} };
  }
}

function saveState(statePath, activeIds) {
  const toggles = {};
  for (const id of activeIds) toggles[id] = true;
  fs.writeFileSync(statePath, JSON.stringify({ toggles }, null, 2));
}

module.exports = { loadState, saveState };
