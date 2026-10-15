import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HostLeases, pluginEnabled } from '../bridge/plugin-lifetime.mjs';
test('plugin toggle controls lifetime across chat disconnects', () => {
  let flag = true, now = 0;
  const hosts = new HostLeases(() => flag, () => now);
  hosts.update('first'); hosts.update('second');
  hosts.update('first', true); hosts.update('second', true);
  now = 60000;
  assert.equal(hosts.active(), true, 'closing conversations must not stop an enabled plugin');
  flag = false;
  assert.equal(hosts.active(), false, 'turn off must stop all managed leases');
  assert.equal(hosts.update('late-heartbeat'), false);
  flag = true; hosts.update('re-enabled');
  assert.equal(hosts.active(), true);
});
test('unmanaged hosts expire independently and release explicitly', () => {
  let now = 0;
  const hosts = new HostLeases(() => undefined, () => now);
  hosts.update('first'); now = 9000; hosts.update('second'); now = 11000;
  assert.equal(hosts.active(), true);
  hosts.update('second', true); assert.equal(hosts.active(), false);
});
test('read only the exact plugin switch, including CRLF and following sections', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pet-lifetime-test-'));
  const file = path.join(dir, 'config.toml');
  try {
    writeFileSync(file, '[plugins."other@other"]\r\nenabled = false\r\n[plugins."pet-trio-jonsbo@pet-trio-jonsbo"]\r\nenabled = true # on\r\n[other]\r\nenabled = false\r\n');
    assert.equal(pluginEnabled(file), true);
    writeFileSync(file, '[plugins."pet-trio-jonsbo@pet-trio-jonsbo"]\nenabled = false\n');
    assert.equal(pluginEnabled(file), false);
    writeFileSync(file, '[plugins."other@other"]\nenabled = true\n');
    assert.equal(pluginEnabled(file), undefined);
  } finally { rmSync(dir, { recursive: true }); }
});

test('disabled or ended startup still marks the bridge for lifecycle cleanup', () => {
  const disabled = new HostLeases(() => false);
  assert.equal(disabled.update('late-start'), false);
  assert.equal(disabled.hadHost, true);
  assert.equal(disabled.active(), false);
  const ended = new HostLeases(() => true);
  ended.update('ended-before-attach', true);
  assert.equal(ended.hadHost, true);
  assert.equal(ended.active(), false);
});
