const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const procMgr = require('../src/process-manager');

before(() => {
  procMgr.init({
    getMainWindow: () => ({ webContents: { send: () => {} } }),
    updateTrayIcon: () => {},
  });
});

test('logLine: appends timestamped line to file', () => {
  const tmp = path.join(os.tmpdir(), 'cd-log-' + Date.now() + '.log');
  procMgr.logLine(tmp, 'hello world');
  const content = fs.readFileSync(tmp, 'utf8');
  assert.match(content, /\[.*\] hello world\n/);
  fs.unlinkSync(tmp);
});

test('saveCurrentState / getLiveProcesses: round-trips toggle state', () => {
  const tmp = path.join(os.tmpdir(), 'cd-state-' + Date.now() + '.json');
  procMgr.recordToggleActive('abc', { startedAt: new Date().toISOString(), logFile: '/tmp/a.log' });
  procMgr.saveCurrentState(tmp);
  const written = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.ok(written.toggles['abc']);
  procMgr.clearToggleActive('abc');
  fs.unlinkSync(tmp);
});
