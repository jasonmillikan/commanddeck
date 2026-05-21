const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadConfig, saveConfig, ensureConfigDir } = require('../src/config-io');

test('loadConfig: returns empty commands when file missing', () => {
  const result = loadConfig(path.join(os.tmpdir(), 'nonexistent-' + Date.now() + '.json'));
  assert.deepEqual(result, { commands: [] });
});

test('loadConfig: returns parsed data when file exists', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  const data = { commands: [{ id: 'a', label: 'Test' }] };
  fs.writeFileSync(tmp, JSON.stringify(data));
  const result = loadConfig(tmp);
  assert.deepEqual(result, data);
  fs.unlinkSync(tmp);
});

test('loadConfig: returns empty commands on malformed JSON', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  fs.writeFileSync(tmp, 'not-json{{{');
  const result = loadConfig(tmp);
  assert.deepEqual(result, { commands: [] });
  fs.unlinkSync(tmp);
});

test('saveConfig: writes JSON to disk', () => {
  const tmp = path.join(os.tmpdir(), 'cd-test-' + Date.now() + '.json');
  const data = { commands: [{ id: 'b', label: 'Save test' }] };
  saveConfig(tmp, data);
  const read = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.deepEqual(read, data);
  fs.unlinkSync(tmp);
});

test('ensureConfigDir: creates missing directories', () => {
  const base = path.join(os.tmpdir(), 'cd-ensure-' + Date.now());
  const configPath = path.join(base, 'sub', 'commands.json');
  const logDir = path.join(base, 'logs');
  const statePath = path.join(base, 'state.json');
  const prefsPath = path.join(base, 'prefs.json');
  ensureConfigDir({ configPath, logDir, statePath, prefsPath });
  assert.ok(fs.existsSync(path.dirname(configPath)));
  assert.ok(fs.existsSync(logDir));
  assert.ok(fs.existsSync(configPath));
  fs.rmSync(base, { recursive: true });
});
