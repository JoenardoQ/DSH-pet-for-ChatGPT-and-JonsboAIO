import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../runtime/electron-helper/shared-core.js',import.meta.url),'utf8'),ctx);const S=ctx.PetShared;
test('all three characters retain menu actions, invalid saved IDs recover, and state clips exist',()=>{
 assert.equal(S.readCharacter({getItem:()=> 'removed-pet'},'main'),'fish');
 const menu=S.characterMenu('chatgpt');assert.equal(menu.label,'切换桌宠');assert.equal(menu.children.length,3);assert.equal(menu.children.filter(c=>c.label.startsWith('✓')).length,1);
 for(const id of ['whale','fish','chatgpt']){
  assert.equal(S.characterAction('skin-'+id),id);
  for(const name of ['待机呼吸休闲','工作状态-思考冒泡','写代码','工作状态-雀跃庆祝','工作状态-垂头叹气冒汗','原地小憩沉眠','点击回应-元气挥手']){
   const media=S.characterMedia(id,name);const parts=new URL(media.path,'http://127.0.0.1').pathname.split('/');
   const role=parts[2].startsWith('@')?parts[2].slice(1):'fish';
   const folder=media.kind==='gif'?'gif':'webm';
   assert.ok(fs.existsSync(new URL('../assets/pets/'+role+'/'+folder+'/'+decodeURIComponent(parts[3]),import.meta.url)),media.path);
  }
 }
 assert.equal(S.characterAction('skin-../../bad'),undefined);
 assert.equal(S.characterAnimation('fish','自定义动作'),'自定义动作');
});
