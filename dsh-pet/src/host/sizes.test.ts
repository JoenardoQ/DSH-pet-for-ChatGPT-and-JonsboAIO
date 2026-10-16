import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PetSizeStore} from './sizes.ts';
import {nextSizePercent} from '../shared/size.ts';
test('pet sizes persist independently and reset to configured size without changing config',()=>{
  const file=join(mkdtempSync(join(tmpdir(),'pet-size-')),'sizes.json'),store=new PetSizeStore(file);
  const cfg={main:{pets:[{id:'main',size:380},{id:'second',size:462}]}};
  store.set('main','size-up');
  let pets=store.decorate(cfg).main.pets as Array<{size:number;sizePercent:number}>;
  assert.equal(pets[0].size,418);assert.equal(pets[1].size,462);assert.equal(cfg.main.pets[0].size,380);
  const restored=new PetSizeStore(file);pets=restored.decorate(cfg).main.pets as typeof pets;
  assert.equal(pets[0].sizePercent,110);restored.set('main','size-reset');
  assert.equal((restored.decorate(cfg).main.pets as typeof pets)[0].size,380);
  assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{main:100});
});
test('size limits are bounded and unknown actions fail',()=>{
  assert.equal(nextSizePercent(200,'size-up'),200);assert.equal(nextSizePercent(50,'size-down'),50);
  assert.equal(nextSizePercent(170,'size-reset'),100);
  assert.throws(()=>nextSizePercent(100,'execute' as 'size-up'));
});
