const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { loadPrefs, savePrefs, sanitizePrefs, DEFAULTS } = require('../src/main/prefs');

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

test('loadPrefs returns default theme of "system"', () => {
  const result = loadPrefs('/nonexistent/path/prefs.json');
  assert.equal(result.theme, 'system');
});

test('loadPrefs merges theme from saved data', () => {
  const tmp = path.join(os.tmpdir(), `prefs-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ theme: 'light' }));
  const result = loadPrefs(tmp);
  assert.equal(result.theme, 'light');
  fs.unlinkSync(tmp);
});

test('sanitizePrefs: passes through valid data unchanged', () => {
  const input = { hotkey: 'Super+D', theme: 'dark', drawerHeight: 300, notify: { onCrash: true, onUnexpectedExit: false } };
  const result = sanitizePrefs(input);
  assert.deepEqual(result, input);
});

test('sanitizePrefs: defaults unknown theme to "system"', () => {
  const result = sanitizePrefs({ theme: 'neon' });
  assert.equal(result.theme, 'system');
});

test('sanitizePrefs: clamps hotkey to 100 chars', () => {
  const result = sanitizePrefs({ hotkey: 'A'.repeat(150) });
  assert.equal(result.hotkey.length, 100);
});

test('sanitizePrefs: defaults non-integer drawerHeight to 240', () => {
  assert.equal(sanitizePrefs({ drawerHeight: 'big' }).drawerHeight, 240);
  assert.equal(sanitizePrefs({ drawerHeight: -10 }).drawerHeight, 240);
  assert.equal(sanitizePrefs({ drawerHeight: 0 }).drawerHeight, 240);
  assert.equal(sanitizePrefs({ drawerHeight: 9999 }).drawerHeight, 240);
});

test('sanitizePrefs: coerces notify fields to booleans', () => {
  const result = sanitizePrefs({ notify: { onCrash: 1, onUnexpectedExit: null } });
  assert.equal(result.notify.onCrash, true);
  assert.equal(result.notify.onUnexpectedExit, false);
});

test('sanitizePrefs: ignores unknown top-level keys', () => {
  const result = sanitizePrefs({ hotkey: 'Super+D', evil: 'payload' });
  assert.equal(result.evil, undefined);
});

test('sanitizePrefs: returns DEFAULTS for null or non-object input', () => {
  const result = sanitizePrefs(null);
  assert.equal(result.theme, 'system');
  assert.equal(result.drawerHeight, 240);
  assert.equal(result.notify.onCrash, DEFAULTS.notify.onCrash);
  assert.equal(result.notify.onUnexpectedExit, DEFAULTS.notify.onUnexpectedExit);
});
