import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../', import.meta.url)),
  ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'runtime/electron-helper/shared-core.js'), 'utf8'), ctx);
const S = ctx.PetShared;
test('all persona action labels, work copy and 54 illustrations belong to their selected character', () => {
  for (const id of ['chatgpt', 'whale']) {
    const menu = S.characterActionMenu(id, {});
    assert.equal(menu[0].children.length, 8);
    assert.equal(S.characterWorkTexts(id).length, 6);
    assert.match(S.characterPrompt(id), new RegExp(id === 'chatgpt' ? '银白长发' : '海洋'));
    for (const item of S.DIALOGUE_IMAGES) {
      const file = path.join(root, 'assets/pets', id, 'memes', item.name + '.png');
      assert.ok(fs.statSync(file).size > 1000, file);
      assert.equal(S.characterMemeName(id, item.original), item.name);
    }
  }
  assert.equal(S.characterStorageKey('chatgpt', 'main'), 'chatgpt:main');
  assert.notEqual(S.characterStorageKey('chatgpt', 'main'), S.characterStorageKey('fish', 'main'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config.jonsbo.example.json')));
  assert.equal(config.rotation, 90);
  const defaults = fs.readFileSync(path.join(root, 'assets/config.jsonc'), 'utf8');
  assert.match(defaults, /'?'?"display": "desktop"/);
});
test(
  'backend-only character switching synchronizes copy, images and isolated history without opening a pet',
  { timeout: 25000 },
  async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-persona-api-')),
      dir = path.join(home, 'dsh-pet');
    fs.mkdirSync(dir);
    const pet = {
      id: 'main',
      name: '大肥鱼',
      size: 380,
      balanceEnabled: false,
      whisperEnabled: false,
      workStatusEnabled: false,
      fixedEnabled: true,
      display: 'none',
      position: { corner: 'bottom-right', marginX: 20, marginY: 20 },
    };
    fs.writeFileSync(path.join(dir, 'main-config.jsonc'), JSON.stringify({ pets: [pet] }));
    fs.writeFileSync(
      path.join(dir, 'memory.json'),
      JSON.stringify({
        main: { main: { messages: [{ role: 'user', content: 'fish memory', ts: 1 }] } },
        'chatgpt:main': { main: { messages: [{ role: 'user', content: 'GPT memory', ts: 2 }] } },
        'whale:main': { main: { messages: [{ role: 'user', content: 'whale memory', ts: 3 }] } },
      }),
    );
    const sock = net.createServer();
    await new Promise((r) => sock.listen(0, '127.0.0.1', r));
    const port = sock.address().port;
    await new Promise((r) => sock.close(r));
    let logs = '';
    const env = {
      ...process.env,
      DSH_HOME: home,
      DSH_PET_USE_WINDOWS_BOOTSTRAP: '0',
      PET_AUTOSTART: '0',
      DSH_PET_JONSBO_ENABLED: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(process.execPath, [path.join(root, 'lib/standalone.js'), '--port', String(port)], {
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b) => {
      logs = (logs + b).slice(-10000);
    });
    child.stderr.on('data', (b) => {
      logs = (logs + b).slice(-10000);
    });
    const base = 'http://127.0.0.1:' + port + '/dsh-pet-7340';
    const post = (route, data) =>
      fetch(base + route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(base + '/config')).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) break;
        await pause(70);
      }
      assert.ok(ready, logs);
      assert.equal((await post('/character', { petId: 'missing', character: 'chatgpt' })).status, 400);
      assert.equal((await post('/character', { petId: 'main', character: 'invalid' })).status, 400);
      for (const [id, label, memory] of [
        ['chatgpt', 'ChatGPT 娘', 'GPT memory'],
        ['whale', '鲸鱼娘', 'whale memory'],
        ['fish', '大肥鱼', 'fish memory'],
      ]) {
        assert.equal((await post('/character', { petId: 'main', character: id })).status, 200);
        const cfg = await (await fetch(base + '/config')).json();
        assert.equal(cfg.main.pets[0].character, id);
        assert.equal(cfg.main.pets[0].name, label);
        assert.equal(cfg.main.pets[0].display, 'none');
        const history = await (await fetch(base + '/chat?pet=main')).json();
        assert.equal(history.messages[0].content, memory);
        const state = await (await fetch(base + '/state')).json();
        assert.equal(state.pets.main.character.data.id, id);
        if (id !== 'fish')
          for (const image of S.DIALOGUE_IMAGES) {
            const r = await fetch(
              base + '/pic/memes/' + encodeURIComponent('@' + id) + '/' + encodeURIComponent(image.name) + '.png',
            );
            assert.equal(r.status, 200, image.name);
            await r.arrayBuffer();
          }
      }
      for (const id of ['chatgpt','whale','fish']) {
        const media = S.characterMedia(id,'待机呼吸休闲');
        const response = await fetch(base + media.path);
        assert.equal(response.status,200,media.path);
        assert.equal(response.headers.get('content-type'),id==='chatgpt'?'image/gif':'video/webm');
        await response.arrayBuffer();
      }
      assert.equal((await fetch(base+'/thumb/@fish/working.gif')).status,404);
      assert.equal((await fetch(base+'/thumb/@chatgpt/boxing.gif')).status,404);
      assert.equal((await fetch(base+'/thumb/@duo/boxing.gif')).status,200);
      await post('/character', { petId: 'main', character: 'chatgpt' });
      const text = '用户任务提到大肥鱼，原文不能改';
      const image = S.DIALOGUE_IMAGES[0].name;
      const sent = await (await post('/broadcast?pet=main', { text, image })).json();
      assert.equal(sent.ok, true);
      const state = await (await fetch(base + '/state')).json();
      assert.equal(state.pets.main.say.data.text, text);
      assert.equal(state.pets.main.say.data.image, image);
      assert.equal(
        (await fetch(base + '/pic/memes/%40chatgpt/' + encodeURIComponent('吃白饭的大肥鱼') + '.png')).status,
        404,
      );
      assert.doesNotMatch(logs, /desktop helper started/);
    } finally {
      await fetch('http://127.0.0.1:' + port + '/shutdown', { method: 'POST' }).catch(() => {});
      if (child.exitCode === null) {
        await Promise.race([new Promise((r) => child.once('exit', r)), pause(2000)]);
        if (child.exitCode === null) child.kill();
      }
    }
  },
);
