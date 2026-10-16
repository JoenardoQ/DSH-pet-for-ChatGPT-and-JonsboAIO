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
  assert.equal(s.current().source, 'dsh');
  assert.equal(s.current(['chatgpt']).source, 'dsh');
  now = 3100;
  assert.equal(s.current().source, 'chatgpt');
  s.frames.delete('chatgpt');
  assert.equal(s.current(), undefined);
});
test('reject invalid commands and accept explicit visibility switches', () => {
  assert.throws(() => validateEvent({ source: 'chatgpt', action: 'wake', state: 'bogus' }));
  assert.throws(() => validateEvent({ source: 'chatgpt', action: 'wake', screen: 'yes' }));
  assert.throws(() => validateEvent({ source: 'chatgpt', action: 'wake', message: 'x'.repeat(101) }));
  assert.doesNotThrow(() => validateEvent({ source: 'chatgpt', action: 'wake', desktop: false, screen: true }));
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
        body: JSON.stringify({ source: 'chatgpt', action: 'update', state: 'working' }),
      })
    ).status,
    400,
  );
  const wake = await (
    await fetch(base + '/event', {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'chatgpt', action: 'wake', state: 'thinking' }),
    })
  ).json();
  assert.equal(wake.control.state, 'thinking');
  assert.equal(wake.version, 4);
  const implicit = await fetch(base + '/event', {method:'POST',headers,body:JSON.stringify({action:'wake'})});
  assert.equal(implicit.status, 400, 'stale preview must not wake ChatGPT');
  const connection = async (value, authorized = true) => fetch(base + '/device/connection', {
    method: 'POST', headers: authorized ? headers : {}, body: JSON.stringify(value),
  });
  assert.equal((await connection({source:'chatgpt',enabled:false}, false)).status, 403);
  assert.equal((await connection({source:'bogus',enabled:true})).status, 400);
  let changed = await (await connection({source:'chatgpt',enabled:false})).json();
  assert.equal(changed.control.screen, false);
  assert.equal(changed.screens.dsh, true);
  changed = await (await connection({source:'dsh',enabled:false})).json();
  assert.equal(changed.screens.dsh, false);
  changed = await (await connection({source:'chatgpt',enabled:true})).json();
  assert.equal(changed.screens.chatgpt, true);
  assert.equal(changed.screens.dsh, false);
  const bad = await fetch(base + '/frame', {
    method: 'POST',
    headers,
    body: JSON.stringify({ source: 'dsh', png: 'no', animation: 'idle' }),
  });
  assert.equal(bad.status, 400);
  const post = (route, value) => fetch(base+route,{method:'POST',headers,body:JSON.stringify(value)});
  assert.equal((await post('/device/source',{source:'dsh'})).status,409);
  for(const source of ['dsh','chatgpt'])await post('/frame',{source,character:source==='dsh'?'fish':'chatgpt',png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',animation:'idle'});
  changed=await(await post('/device/source',{source:'dsh'})).json();assert.equal(changed.screenSource,'dsh');
  changed=await(await post('/device/source',{source:'chatgpt'})).json();assert.equal(changed.screenSource,'chatgpt');
  changed=await(await post('/duet',{mode:'cafe'})).json();assert.equal(changed.duet.action,'cafe');
  changed=await(await post('/duet',{mode:'off'})).json();assert.equal(changed.duet.active,false);
  await post('/duet',{mode:'auto'});
  const hide = await (
    await fetch(base + '/event', { method: 'POST', headers, body: JSON.stringify({ source: 'chatgpt', action: 'hide' }) })
  ).json();
  assert.equal(hide.control.visible, false);
  assert.equal(hide.activeSources.includes('dsh'), true);
});
test('MCP exposes original project tool contract', async () => {
  const r = await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(
    r.result.tools.map((t) => t.name),
    ['wake_pet', 'set_pet_state', 'hide_pet', 'shutdown_pet', 'pet_status', 'take_over_screen'],
  );
  assert.equal(
    (await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'bad' } })).result.isError,
    true,
  );
});
