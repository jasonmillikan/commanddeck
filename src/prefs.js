const fs = require('fs');

const DEFAULTS = {
  hotkey: 'Super+D',
  notify: {
    onCrash: true,
    onUnexpectedExit: false,
  },
};

function loadPrefs(prefsPath) {
  try {
    const data = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    return {
      ...DEFAULTS,
      ...data,
      notify: { ...DEFAULTS.notify, ...(data.notify || {}) },
    };
  } catch {
    return { ...DEFAULTS, notify: { ...DEFAULTS.notify } };
  }
}

function savePrefs(prefsPath, data) {
  fs.writeFileSync(prefsPath, JSON.stringify(data, null, 2));
}

module.exports = { loadPrefs, savePrefs, DEFAULTS };
