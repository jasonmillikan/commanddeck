const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let migrateCommands, applyReorder;

before(async () => {
  ({ migrateCommands, applyReorder } = await import('../src/renderer/utils.js'));
});

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

test('applyReorder: reorders full unfiltered list', () => {
  const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const result = applyReorder(commands, ['b', 'a', 'c']);
  assert.deepEqual(result.map(c => c.id), ['b', 'a', 'c']);
});

test('applyReorder: filtered drag moves only visible cards, non-visible stay in place', () => {
  const commands = [
    { id: 'a', tags: ['audio'] },
    { id: 'b', tags: ['other'] },
    { id: 'c', tags: ['audio'] },
    { id: 'd', tags: ['audio'] },
    { id: 'e', tags: ['other'] },
  ];
  const result = applyReorder(commands, ['a', 'd', 'c']);
  assert.deepEqual(result.map(c => c.id), ['a', 'b', 'd', 'c', 'e']);
});

test('applyReorder: single visible card is a no-op', () => {
  const commands = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const result = applyReorder(commands, ['b']);
  assert.deepEqual(result.map(c => c.id), ['a', 'b', 'c']);
});

test('applyReorder: does not mutate original array', () => {
  const commands = [{ id: 'a' }, { id: 'b' }];
  const original = [...commands];
  applyReorder(commands, ['b', 'a']);
  assert.deepEqual(commands, original);
});

let badgeFor;
before(async () => {
  ({ badgeFor } = await import('../src/renderer/utils.js'));
});

test('badgeFor: emits type- modifier class for each command type', () => {
  for (const type of ['toggle', 'launcher', 'foreground', 'cheatsheet']) {
    const html = badgeFor(type);
    assert.ok(html.includes(`type-${type}`), `expected type-${type} in: ${html}`);
    assert.ok(!html.includes(`badge-${type}`), `unexpected badge-${type} in: ${html}`);
  }
});
