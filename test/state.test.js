const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadState, saveState } = require('../src/state');

function tmpPath() {
  return path.join(os.tmpdir(), `state-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

test('loadState returns empty toggles when file does not exist', () => {
  const result = loadState('/nonexistent/path/state.json');
  assert.deepEqual(result, { toggles: {} });
});

test('loadState returns empty toggles when file contains corrupt JSON', () => {
  const p = tmpPath();
  fs.writeFileSync(p, 'not valid json {{');
  try {
    const result = loadState(p);
    assert.deepEqual(result, { toggles: {} });
  } finally {
    fs.unlinkSync(p);
  }
});

test('loadState returns empty toggles when file contains valid JSON with wrong schema', () => {
  const p = tmpPath();
  fs.writeFileSync(p, JSON.stringify({ other: 'data' }));
  try {
    const result = loadState(p);
    assert.deepEqual(result, { toggles: {} });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState writes all provided ids as true booleans', () => {
  const p = tmpPath();
  try {
    saveState(p, ['abc123', 'def456']);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: { abc123: true, def456: true } });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState with empty iterable writes empty toggles object', () => {
  const p = tmpPath();
  try {
    saveState(p, []);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: {} });
  } finally {
    fs.unlinkSync(p);
  }
});

test('loadState roundtrips saveState output correctly', () => {
  const p = tmpPath();
  try {
    saveState(p, ['x1', 'x2', 'x3']);
    const result = loadState(p);
    assert.deepEqual(result.toggles, { x1: true, x2: true, x3: true });
  } finally {
    fs.unlinkSync(p);
  }
});

test('saveState accepts a Set iterable', () => {
  const p = tmpPath();
  try {
    const ids = new Set(['a', 'b', 'c']);
    saveState(p, ids);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.deepEqual(data, { toggles: { a: true, b: true, c: true } });
  } finally {
    fs.unlinkSync(p);
  }
});
