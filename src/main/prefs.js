const fs = require('fs');

const DEFAULTS = {
  hotkey: 'Super+D',
  drawerHeight: 240,
  theme: 'system',
  notify: {
    onCrash: true,
    onUnexpectedExit: false,
  },
};

function loadPrefs(prefsPath) {
  try {
    const data = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ...DEFAULTS, notify: { ...DEFAULTS.notify } };
    }
    const notify = (data.notify && typeof data.notify === 'object' && !Array.isArray(data.notify))
      ? data.notify
      : {};
    return { ...DEFAULTS, ...data, notify: { ...DEFAULTS.notify, ...notify } };
  } catch {
    return { ...DEFAULTS, notify: { ...DEFAULTS.notify } };
  }
}

function savePrefs(prefsPath, data) {
  fs.writeFileSync(prefsPath, JSON.stringify(data, null, 2));
}

module.exports = { loadPrefs, savePrefs, DEFAULTS };
