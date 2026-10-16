import crypto from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../runtime/electron-helper/shared-core.js',import.meta.url),'utf8'),ctx);const S=ctx.PetShared;
test('new GIF actions, original blue maid clips and role-owned illustrations remain distinct',()=>{
 for(const role of ['chatgpt','duo']){
  const dir=new URL('../assets/pets/'+role+'/',import.meta.url);
  const meta=JSON.parse(fs.readFileSync(new URL('animation-generation.json',dir)));
  assert.equal(meta.length,role==='chatgpt'?107:8);
  for(const asset of meta){assert.equal(asset.frames,216);assert.equal(asset.durationMs,9000);assert.equal(asset.frames,asset.uniqueFrames);assert.ok(asset.bytes>10000);assert.match(asset.file,/\.gif$/);}
 }
 assert.equal(fs.readdirSync(new URL('../assets/pets/fish/webm/',import.meta.url)).filter(p=>p.endsWith('.webm')).length,106);
 assert.equal(fs.existsSync(new URL('../assets/webm/',import.meta.url)),false);
 assert.equal(fs.existsSync(new URL('../assets/pets/chatgpt/webm/',import.meta.url)),false);
 assert.match(S.characterPrompt('fish'),/圆脸、圆润Q版蓝发女仆/);
 assert.match(S.characterPrompt('fish'),/不是真鱼/);
 const rows=JSON.parse(fs.readFileSync(new URL('../assets/pets/chatgpt/copy-lengths.json',import.meta.url)));
 assert.equal(rows.length,12);
 const actual=S.characterWorkTexts('chatgpt').flat();
 rows.forEach((r,i)=>{assert.equal([...r.before].length,[...r.after].length);assert.equal(actual[i],r.after);});
 for(const id of ['fish','whale','chatgpt'])assert.deepEqual(JSON.parse(JSON.stringify(S.CHARACTER_PERSONAS[id])),JSON.parse(fs.readFileSync(new URL('../assets/pets/personas.json',import.meta.url)))[id]);
});

test('all upstream media remain byte-for-byte available without requiring local archives',()=>{
 const inventory=JSON.parse(fs.readFileSync(new URL('../../art-source/upstream-resource-inventory.json',import.meta.url)));
 assert.ok(inventory.length>=394);
 for(const entry of inventory){
  const bytes=fs.readFileSync(new URL('../../'+entry.retained,import.meta.url));
  assert.equal(bytes.length,entry.bytes,entry.original);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.original);
 }
});
