const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const platform = require('../src/main/platform');

test('detectTerminalApp: finds kitty when it is the only binary in PATH', () => {
  const origPath = process.env.PATH;
  const origTerm = process.env.TERMINAL;
  delete process.env.TERMINAL;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-plat-'));
  fs.writeFileSync(path.join(tmpDir, 'kitty'), '', { mode: 0o755 });
  process.env.PATH = tmpDir;
  const result = platform.detectTerminalApp();
  process.env.PATH = origPath;
  if (origTerm !== undefined) process.env.TERMINAL = origTerm;
  fs.rmSync(tmpDir, { recursive: true });
  assert.equal(result, 'kitty');
});

test('detectTerminalApp: returns null when nothing found', () => {
  const origPath = process.env.PATH;
  const origTerm = process.env.TERMINAL;
  delete process.env.TERMINAL;
  process.env.PATH = '/tmp/nonexistent-cd-test-dir';
  const result = platform.detectTerminalApp();
  process.env.PATH = origPath;
  if (origTerm !== undefined) process.env.TERMINAL = origTerm;
  assert.equal(result, null);
});

test('getAutostart: returns false when file does not exist', () => {
  const p = path.join(os.tmpdir(), `cd-noauto-${Date.now()}.desktop`);
  assert.equal(platform.getAutostart(p), false);
});

test('getAutostart: returns true when file exists', () => {
  const p = path.join(os.tmpdir(), `cd-auto-${Date.now()}.desktop`);
  fs.writeFileSync(p, '[Desktop Entry]\n');
  const result = platform.getAutostart(p);
  fs.unlinkSync(p);
  assert.equal(result, true);
});

test('setAutostart(true): creates desktop file at given path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-autodir-'));
  const p = path.join(tmpDir, 'subdir', 'commanddeck.desktop');
  platform.setAutostart(true, p, '[Desktop Entry]\nName=CommandDeck\n');
  assert.ok(fs.existsSync(p));
  fs.rmSync(tmpDir, { recursive: true });
});

test('setAutostart(false): removes desktop file if it exists', () => {
  const p = path.join(os.tmpdir(), `cd-rm-auto-${Date.now()}.desktop`);
  fs.writeFileSync(p, '[Desktop Entry]\n');
  platform.setAutostart(false, p, '');
  assert.equal(fs.existsSync(p), false);
});

test('setAutostart(false): does nothing when file does not exist', () => {
  const p = path.join(os.tmpdir(), `cd-noexist-${Date.now()}.desktop`);
  assert.doesNotThrow(() => platform.setAutostart(false, p, ''));
});

test('killProcessTree: terminates a running process', async () => {
  const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 100));
  platform.killProcessTree(child.pid);
  await new Promise(r => setTimeout(r, 200));
  let alive = true;
  try { process.kill(child.pid, 0); } catch { alive = false; }
  assert.equal(alive, false);
});

test('spawnShell: runs a command and exits with code 0', async () => {
  const child = platform.spawnShell('echo hello', { stdio: 'pipe' });
  const code = await new Promise(r => child.on('exit', r));
  assert.equal(code, 0);
});
