const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/main/validate-config');

function makeCmd(overrides) {
  return { id: 'abc123', label: 'Test', type: 'toggle', onCmd: 'echo on', offCmd: 'echo off', ...overrides };
}

test('validateConfig: accepts plain alphanumeric id', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'abc123' })] });
  assert.equal(result.ok, true);
});

test('validateConfig: accepts hyphenated id like starter-linux-wifi', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'starter-linux-wifi' })] });
  assert.equal(result.ok, true);
});

test('validateConfig: rejects id starting with hyphen', () => {
  const result = validateConfig({ commands: [makeCmd({ id: '-bad' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects id with uppercase', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'BadId' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects id longer than 32 chars', () => {
  const result = validateConfig({ commands: [makeCmd({ id: 'a'.repeat(33) })] });
  assert.equal(result.ok, false);
});

test('validateConfig: rejects unknown type', () => {
  const result = validateConfig({ commands: [makeCmd({ type: 'unknown' })] });
  assert.equal(result.ok, false);
});

test('validateConfig: accepts all four valid types', () => {
  for (const type of ['toggle', 'launcher', 'foreground', 'cheatsheet']) {
    const cmd = type === 'launcher'
      ? makeCmd({ type, launchCmd: 'echo hi', onCmd: undefined, offCmd: undefined })
      : type === 'cheatsheet'
        ? makeCmd({ type, content: 'ls', onCmd: undefined, offCmd: undefined })
        : makeCmd({ type });
    const result = validateConfig({ commands: [cmd] });
    assert.equal(result.ok, true, `type=${type} should be valid`);
  }
});
