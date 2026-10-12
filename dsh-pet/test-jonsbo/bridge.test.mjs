import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Sources, validateEvent } from '../bridge/state.mjs';
import { createBridge } from '../bridge/server.mjs';
import { dispatch } from '../bridge/mcp.mjs';
test('DSH frame leases expire; hiding/screen-off ChatGPT leaves DSH available', () => {
  let now = 0;
  const s = new Sources(() => now);
  s.put('dsh', { animation: 'idle' });
  now = 500;
  s.put('chatgpt', { animation: 'work' });
  assert.equal(s.current().source, 'chatgpt');
  assert.equal(s.current(['chatgpt']).source, 'dsh');
  now = 3100;
  assert.equal(s.current().source, 'chatgpt');
  s.frames.delete('chatgpt');
  assert.equal(s.current(), undefined);
});
test('reject invalid commands and accept explicit visibility switches', () => {
  assert.throws(() => validateEvent({ action: 'wake', state: 'bogus' }));
  assert.throws(() => validateEvent({ action: 'wake', screen: 'yes' }));
  assert.throws(() => validateEvent({ action: 'wake', message: 'x'.repeat(101) }));
  assert.doesNotThrow(() => validateEvent({ action: 'wake', desktop: false, screen: true }));
});
test('bridge request protections and control lifecycle', async (t) => {
  const server = createBridge({ launch: false });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const headers = { 'Content-Type': 'application/json', 'X-Pet-Client': '1' };
  assert.equal((await fetch(base + '/event', { method: 'POST', body: '{}' })).status, 403);
  assert.equal(
    (
      await fetch(base + '/event', {
        method: 'POST',
        headers: { ...headers, Origin: 'https://evil.example' },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + '/event', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'update', state: 'working' }),
      })
    ).status,
    400,
  );
  const wake = await (
    await fetch(base + '/event', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'wake', state: 'thinking' }),
    })
  ).json();
  assert.equal(wake.control.state, 'thinking');
  const bad = await fetch(base + '/frame', {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: 'dsh', png: 'no', animation: 'idle' }),
  });
  assert.equal(bad.status, 400);
  const hide = await (
    await fetch(base + '/event', { method: 'POST', headers, body: JSON.stringify({ action: 'hide' }) })
  ).json();
  assert.equal(hide.visible, false);
});
test('MCP exposes original project tool contract', async () => {
  const r = await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(
    r.result.tools.map((t) => t.name),
    ['wake_pet', 'set_pet_state', 'hide_pet', 'pet_status', 'take_over_screen'],
  );
  assert.equal(
    (await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'bad' } })).result.isError,
    true,
  );
});
