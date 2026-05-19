const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadPrefs, savePrefs, DEFAULTS } = require('../src/prefs');

test('loadPrefs returns defaults when file is missing', () => {
  const result = loadPrefs('/nonexistent/path/prefs.json');
  assert.deepEqual(result, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
});

test('loadPrefs merges saved data over defaults', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ hotkey: 'Ctrl+Space', notify: { onCrash: false } }));
  const result = loadPrefs(tmp);
  assert.equal(result.hotkey, 'Ctrl+Space');
  assert.equal(result.notify.onCrash, false);
  assert.equal(result.notify.onUnexpectedExit, DEFAULTS.notify.onUnexpectedExit);
  fs.unlinkSync(tmp);
});

test('savePrefs writes JSON to disk', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  const data = { hotkey: 'Super+D', notify: { onCrash: true, onUnexpectedExit: false } };
  savePrefs(tmp, data);
  assert.deepEqual(JSON.parse(fs.readFileSync(tmp, 'utf8')), data);
  fs.unlinkSync(tmp);
});

test('loadPrefs handles malformed JSON gracefully', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, 'not valid json {{ ');
  const result = loadPrefs(tmp);
  assert.deepEqual(result, { ...DEFAULTS, notify: { ...DEFAULTS.notify } });
  fs.unlinkSync(tmp);
});

test('loadPrefs falls back to default notify when notify field is not an object', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ hotkey: 'Ctrl+A', notify: 'crash-only' }));
  const result = loadPrefs(tmp);
  assert.equal(result.hotkey, 'Ctrl+A');
  assert.deepEqual(result.notify, DEFAULTS.notify);
  fs.unlinkSync(tmp);
});
