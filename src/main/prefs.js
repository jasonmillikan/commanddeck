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

function sanitizePrefs(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { hotkey: '', theme: 'system', drawerHeight: 240, notify: { onCrash: false, onUnexpectedExit: false } };
  }
  const { hotkey, theme, drawerHeight, notify } = data;
  return {
    hotkey: typeof hotkey === 'string' ? hotkey.slice(0, 100) : '',
    theme: ['system', 'light', 'dark'].includes(theme) ? theme : 'system',
    drawerHeight: Number.isInteger(drawerHeight) && drawerHeight > 0 ? drawerHeight : 240,
    notify: {
      onCrash: Boolean(notify?.onCrash),
      onUnexpectedExit: Boolean(notify?.onUnexpectedExit),
    },
  };
}

module.exports = { loadPrefs, savePrefs, sanitizePrefs, DEFAULTS };
