const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateCommands } = require('../src/renderer/utils');

test('migrateCommands: group string → tags array', () => {
  const input = [{ id: 'a', label: 'A', group: 'Audio' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.equal(commands[0].group, undefined);
  assert.equal(changed, true);
});

test('migrateCommands: no group → empty tags array', () => {
  const input = [{ id: 'a', label: 'A' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, []);
  assert.equal(changed, true);
});

test('migrateCommands: empty group string → empty tags array', () => {
  const input = [{ id: 'a', label: 'A', group: '' }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, []);
  assert.equal(commands[0].group, undefined);
  assert.equal(changed, true);
});

test('migrateCommands: already has tags → no change', () => {
  const input = [{ id: 'a', label: 'A', tags: ['Audio'] }];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.equal(changed, false);
});

test('migrateCommands: mixed batch — some migrated, some not', () => {
  const input = [
    { id: 'a', label: 'A', group: 'Audio' },
    { id: 'b', label: 'B', tags: ['Sync'] },
  ];
  const { commands, changed } = migrateCommands(input);
  assert.deepEqual(commands[0].tags, ['Audio']);
  assert.deepEqual(commands[1].tags, ['Sync']);
  assert.equal(changed, true);
});
