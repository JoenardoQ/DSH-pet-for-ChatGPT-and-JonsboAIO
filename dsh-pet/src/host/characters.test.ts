import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CharacterStore } from './characters';
test('legacy default double display becomes one desktop pet, explicit custom both is preserved', () => {
  const store = new CharacterStore(join(mkdtempSync(join(tmpdir(), 'persona-')), 'characters.json'));
  const cfg = {
    main: {
      pets: [
        { id: 'main', name: '蓝毛小女仆', display: 'both' },
        { id: 'custom', name: '自己的桌宠', display: 'both' },
      ],
    },
  };
  const out = store.decorate(cfg).main.pets as Array<Record<string, unknown>>;
  assert.equal(out[0].display, 'desktop');
  assert.equal(out[0].name, '大肥鱼');
  assert.equal(out[1].display, 'both');
  assert.equal(cfg.main.pets[0].display, 'both');
  store.set('main', 'chatgpt');
  const pet = (store.decorate(cfg).main.pets as Array<Record<string, unknown>>)[0];
  assert.equal(pet.name, 'ChatGPT 娘');
  assert.equal(pet.character, 'chatgpt');
});
test('independent pet preferences survive restart and invalid roles cannot poison the store', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'persona-')), 'characters.json'),
    store = new CharacterStore(file);
  store.set('a', 'chatgpt');
  store.set('b', 'whale');
  assert.throws(() => store.set('a', '../../fish'));
  const next = new CharacterStore(file);
  assert.equal(next.get('a'), 'chatgpt');
  assert.equal(next.get('b'), 'whale');
  assert.equal(next.get('__proto__'), 'fish');
});
