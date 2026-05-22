import { keyEventToAccelerator } from './utils.js';

let hotkeyRecording = false;
let hotkeyRecordPrev = '';
let _getPrefs, _setPrefs, _applyTheme;
let themePrefAtOpen = 'system';

export function initPrefsModal({ getPrefs, setPrefs, applyTheme }) {
  _getPrefs = getPrefs;
  _setPrefs = setPrefs;
  _applyTheme = applyTheme;
}

export async function openPrefsModal() {
  const p = _getPrefs();
  themePrefAtOpen = p.theme || 'system';
  document.querySelector(`input[name="p-theme"][value="${themePrefAtOpen}"]`).checked = true;
  document.getElementById('p-hotkey').value = p.hotkey || '';
  document.getElementById('p-hotkey-error').textContent = '';
  document.getElementById('p-notify-crash').checked = p.notify.onCrash;
  document.getElementById('p-notify-unexpected').checked = p.notify.onUnexpectedExit;
  document.getElementById('p-autostart').checked = await window.api.getAutostart();
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.add('open');
}

export function closePrefsModal() {
  stopHotkeyRecording();
  document.getElementById('prefs-backdrop').classList.remove('open');
}

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

function cancelPrefsModal() {
  _applyTheme(themePrefAtOpen);
  closePrefsModal();
}

document.getElementById('btn-prefs').addEventListener('click', openPrefsModal);
document.getElementById('prefs-close').addEventListener('click', cancelPrefsModal);
document.getElementById('prefs-cancel').addEventListener('click', cancelPrefsModal);
document.getElementById('prefs-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) cancelPrefsModal();
});
document.getElementById('p-hotkey-record').addEventListener('click', () => {
  if (hotkeyRecording) stopHotkeyRecording(true);
  else startHotkeyRecording();
});
document.getElementById('p-hotkey-clear').addEventListener('click', () => {
  stopHotkeyRecording();
  document.getElementById('p-hotkey').value = '';
});
document.querySelectorAll('input[name="p-theme"]').forEach(radio => {
  radio.addEventListener('change', (e) => _applyTheme(e.target.value));
});
document.getElementById('prefs-save').addEventListener('click', async () => {
  const hotkey = document.getElementById('p-hotkey').value.trim();
  const theme = document.querySelector('input[name="p-theme"]:checked').value;
  const p = _getPrefs();
  const updated = {
    ...p,
    hotkey,
    theme,
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
  _setPrefs(updated);
  _applyTheme(theme);
  closePrefsModal();
});
document.getElementById('prefs-sponsor-link').addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openExternal('https://github.com/sponsors/jasonmillikan');
});
