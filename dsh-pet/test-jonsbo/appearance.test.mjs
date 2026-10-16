import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {Appearance,BACKGROUNDS} from '../bridge/appearance.mjs';
test('only the four packaged backgrounds and default can be selected and persist across restarts',()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),'pet-appearance-')),'appearance.json'),store=new Appearance(file);
 assert.equal(store.snapshot().background,'none');assert.equal(BACKGROUNDS.length,5);
 for(const bg of BACKGROUNDS){store.set({background:bg.id});assert.equal(new Appearance(file).snapshot().background,bg.id);}
 const before=readFileSync(file,'utf8');
 for(const bad of [{background:'../../secret'},{background:'https://remote/image.png'},{background:'none',extra:1},null])assert.throws(()=>store.set(bad));
 assert.equal(readFileSync(file,'utf8'),before);
});
