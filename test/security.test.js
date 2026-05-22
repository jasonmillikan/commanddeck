const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/main/validate-config');

test('validateConfig: accepts valid minimal config', () => {
  const data = { commands: [{ id: 'abc123', label: 'Test', type: 'toggle' }] };
  const result = validateConfig(data);
  assert.equal(result.ok, true);
});

test('validateConfig: rejects non-object input', () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig('string').ok, false);
  assert.equal(validateConfig([]).ok, false);
});

test('validateConfig: rejects missing commands array', () => {
  assert.equal(validateConfig({}).ok, false);
  assert.equal(validateConfig({ commands: 'nope' }).ok, false);
});

test('validateConfig: rejects command with invalid id', () => {
  const badId = { commands: [{ id: 'CAPS-NOT-OK', label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(badId).ok, false);

  const htmlId = { commands: [{ id: '<script>', label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(htmlId).ok, false);

  const longId = { commands: [{ id: 'a'.repeat(33), label: 'X', type: 'toggle' }] };
  assert.equal(validateConfig(longId).ok, false);
});

test('validateConfig: rejects command with missing or non-string label', () => {
  const noLabel = { commands: [{ id: 'abc', type: 'toggle' }] };
  assert.equal(validateConfig(noLabel).ok, false);

  const numLabel = { commands: [{ id: 'abc', label: 42, type: 'toggle' }] };
  assert.equal(validateConfig(numLabel).ok, false);
});

test('validateConfig: rejects command with unknown type', () => {
  const bad = { commands: [{ id: 'abc', label: 'X', type: 'daemon' }] };
  assert.equal(validateConfig(bad).ok, false);
});

test('validateConfig: rejects command with string field over 500 chars', () => {
  const long = 'x'.repeat(501);
  const data = { commands: [{ id: 'abc', label: long, type: 'toggle' }] };
  assert.equal(validateConfig(data).ok, false);
});

test('validateConfig: rejects tags that are not an array of strings', () => {
  const badTags = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: [42] }] };
  assert.equal(validateConfig(badTags).ok, false);

  const objTags = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: {} }] };
  assert.equal(validateConfig(objTags).ok, false);
});

test('validateConfig: accepts all known command types with correct optional fields', () => {
  const commands = [
    { id: 'a1', label: 'Toggle', type: 'toggle', onCmd: 'cmd on', offCmd: 'cmd off', tags: ['Audio'] },
    { id: 'b2', label: 'Launcher', type: 'launcher', launchCmd: 'steam', tags: [] },
    { id: 'c3', label: 'Foreground', type: 'foreground', onCmd: 'syncthing', note: 'runs syncthing' },
    { id: 'd4', label: 'Sheet', type: 'cheatsheet', content: 'ip addr\nip route' },
  ];
  assert.equal(validateConfig({ commands }).ok, true);
});

test('validateConfig: rejects tag string with invalid characters', () => {
  const bad = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: ['<script>'] }] };
  assert.equal(validateConfig(bad).ok, false);
});

test('validateConfig: rejects tag with control characters', () => {
  const tabTag = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: ['tag\twith\ttabs'] }] };
  assert.equal(validateConfig(tabTag).ok, false);

  const newlineTag = { commands: [{ id: 'abc', label: 'X', type: 'toggle', tags: ['tag\nwith\nnewline'] }] };
  assert.equal(validateConfig(newlineTag).ok, false);
});

test('validateConfig: rejects non-boolean autoRestore', () => {
  const bad = { commands: [{ id: 'abc', label: 'X', type: 'toggle', autoRestore: 'yes' }] };
  assert.equal(validateConfig(bad).ok, false);

  const good = { commands: [{ id: 'abc', label: 'X', type: 'toggle', autoRestore: true }] };
  assert.equal(validateConfig(good).ok, true);
});
