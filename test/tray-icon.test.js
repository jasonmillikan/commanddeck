const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTrayIconSvg } = require('../src/tray-icon');

test('idle: no filled squares, four idle outlines', () => {
  const svg = buildTrayIconSvg(0, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 0);
  assert.equal((svg.match(/stroke="#3a4060"/g) || []).length, 4);
});

test('active 1: one filled square, three green outlines', () => {
  const svg = buildTrayIconSvg(1, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 1);
  assert.equal((svg.match(/stroke="#4ade80"/g) || []).length, 3);
  assert.equal((svg.match(/stroke="#3a4060"/g) || []).length, 0);
});

test('active 2: two filled squares, two green outlines', () => {
  const svg = buildTrayIconSvg(2, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 2);
  assert.equal((svg.match(/stroke="#4ade80"/g) || []).length, 2);
  assert.equal((svg.match(/stroke="#3a4060"/g) || []).length, 0);
});

test('active 3: three filled squares, one green outline', () => {
  const svg = buildTrayIconSvg(3, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 3);
  assert.equal((svg.match(/stroke="#4ade80"/g) || []).length, 1);
  assert.equal((svg.match(/stroke="#3a4060"/g) || []).length, 0);
});

test('full: four filled squares, no idle', () => {
  const svg = buildTrayIconSvg(4, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 4);
  assert.equal((svg.match(/stroke="#3a4060"/g) || []).length, 0);
});

test('count > 4 is capped at full', () => {
  const svg = buildTrayIconSvg(99, null, 'linux');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 4);
});

test('alert-red: red badge present, no amber badge', () => {
  const svg = buildTrayIconSvg(2, 'red', 'linux');
  assert.ok(svg.includes('fill="#f87171"'), 'missing red badge');
  assert.ok(!svg.includes('fill="#fbbf24"'), 'unexpected amber badge');
});

test('alert-amber: amber badge present, no red badge', () => {
  const svg = buildTrayIconSvg(2, 'amber', 'linux');
  assert.ok(svg.includes('fill="#fbbf24"'), 'missing amber badge');
  assert.ok(!svg.includes('fill="#f87171"'), 'unexpected red badge');
});

test('no alert: no badge circles', () => {
  const svg = buildTrayIconSvg(0, null, 'linux');
  assert.ok(!svg.includes('fill="#f87171"'), 'unexpected red badge');
  assert.ok(!svg.includes('fill="#fbbf24"'), 'unexpected amber badge');
});

test('macOS: filled squares use black, not green', () => {
  const svg = buildTrayIconSvg(2, null, 'darwin');
  assert.equal((svg.match(/fill="#000000"/g) || []).length, 2);
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 0);
});

test('macOS with alert: black squares + coloured badge', () => {
  const svg = buildTrayIconSvg(1, 'red', 'darwin');
  assert.equal((svg.match(/fill="#000000"/g) || []).length, 1, 'expected exactly 1 black square');
  assert.ok(svg.includes('fill="#f87171"'), 'missing red badge');
});

test('windows: uses green fill like linux', () => {
  const svg = buildTrayIconSvg(2, null, 'win32');
  assert.equal((svg.match(/fill="#4ade80"/g) || []).length, 2);
});

test('size parameter controls SVG width/height', () => {
  const svg = buildTrayIconSvg(0, null, 'linux', 16);
  assert.ok(svg.startsWith('<svg width="16" height="16"'), 'wrong dimensions');
});

test('viewBox is always 0 0 22 22 regardless of size', () => {
  const svg16 = buildTrayIconSvg(0, null, 'linux', 16);
  const svg32 = buildTrayIconSvg(0, null, 'linux', 32);
  assert.ok(svg16.includes('viewBox="0 0 22 22"'), 'wrong viewBox at size 16');
  assert.ok(svg32.includes('viewBox="0 0 22 22"'), 'wrong viewBox at size 32');
});
