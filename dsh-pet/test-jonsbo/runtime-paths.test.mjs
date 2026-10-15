import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createRequire} from 'node:module';
const {resolveDataDir}=createRequire(import.meta.url)('../bridge/user-paths.cjs');
test('missing old drive falls back to user storage; valid explicit paths remain unchanged',()=>{
 const attempted=[],warnings=[],appData=path.resolve('fake-user');
 const options={appData,temp:path.resolve('fake-temp'),warn:m=>warnings.push(m),mkdir:dir=>{attempted.push(dir);if(dir.startsWith('E:'))throw Object.assign(Error('Missing drive'),{code:'ENOENT'});}};
 assert.equal(resolveDataDir('E:\obsolete\pet',options),path.join(appData,'DshPetJonsbo','jonsbo'));assert.equal(attempted.length,2);assert.equal(warnings.length,1);
 const explicit=path.resolve('my-pet-data');assert.equal(resolveDataDir(explicit,options),explicit);
});
test('unwritable user storage falls back to temporary storage without a main-process exception',()=>{
 const appData=path.resolve('unwritable'),temp=path.resolve('writable-temp');
 const result=resolveDataDir(undefined,{appData,temp,warn:()=>{},mkdir:dir=>{if(dir.startsWith(appData))throw Object.assign(Error('Denied'),{code:'EACCES'});}});
 assert.equal(result,path.join(temp,'DshPetJonsbo','jonsbo'));
});
