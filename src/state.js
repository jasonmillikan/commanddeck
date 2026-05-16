const fs = require('fs');

function loadState(statePath) {
  try {
    const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (data && typeof data.toggles === 'object' && !Array.isArray(data.toggles) && data.toggles !== null) {
      return data;
    }
    return { toggles: {} };
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
