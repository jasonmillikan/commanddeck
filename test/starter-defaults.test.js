const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateConfig } = require('../src/main/validate-config');

for (const platform of ['linux', 'mac', 'windows']) {
  test(`defaults/commands-${platform}.json: is valid JSON`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    assert.ok(fs.existsSync(p), `file does not exist: ${p}`);
    const raw = fs.readFileSync(p, 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'must be valid JSON');
  });

  test(`defaults/commands-${platform}.json: passes validateConfig`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const result = validateConfig(data);
    assert.equal(result.ok, true, result.error);
  });

  test(`defaults/commands-${platform}.json: contains exactly 5 commands`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(data.commands.length, 5);
  });

  test(`defaults/commands-${platform}.json: has one of each type`, () => {
    const p = path.join(__dirname, '..', 'src', 'defaults', `commands-${platform}.json`);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const types = data.commands.map(c => c.type);
    assert.ok(types.includes('toggle'), 'needs a toggle');
    assert.ok(types.includes('launcher'), 'needs a launcher');
    assert.ok(types.includes('foreground'), 'needs a foreground');
    assert.ok(types.includes('cheatsheet'), 'needs a cheatsheet');
  });
}
