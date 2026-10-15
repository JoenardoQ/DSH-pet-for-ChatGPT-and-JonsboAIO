import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));const profile=JSON.parse(fs.readFileSync(path.join(root,'scripts/windows-launcher.json')));
const ps=process.platform==='win32'?path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'):'powershell.exe';
const limitedPath=process.platform==='win32'?[path.join(process.env.SystemRoot,'System32'),path.dirname(ps)].join(';'):'';
const invoke=(mode,data,extra={})=>spawnSync(ps,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/windows-launcher.ps1'),'-Mode',mode,'-Headless','-DataDir',data],{cwd:root,windowsHide:true,encoding:'utf8',timeout:mode==='prepare'?660000:25000,env:{...process.env,PATH:limitedPath,DESKTOP_PET_HEADLESS:'1',WHALE_AUTOSTART:'0',PET_AUTOSTART:'0',...extra.env},input:extra.input});
test('runtime download manifest pins immutable HTTPS resources and hashes',()=>{
 if(profile.kind==='pet')for(const item of [...profile.electronParts,profile.dependencies]){assert.match(item.sha256,/^[a-f0-9]{64}$/);assert.match(item.url,/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[a-f0-9]{40}\//);}
 else{const lock=JSON.parse(fs.readFileSync(path.join(root,'scripts/runtime-lock.json')));for(const item of Object.values(lock)){assert.match(item.url,/^https:\/\//);assert.match(item.sha256,/^[a-f0-9]{64}$/);}}
});
test('cold launcher status works without Node or Python and never starts setup',{skip:process.platform!=='win32'},()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'pet-cold-check-'));const r=invoke('check',data);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).runtimeReady,false);assert.equal(fs.existsSync(path.join(data,'runtime')),false);
});
const installed=path.join(process.env.LOCALAPPDATA || os.tmpdir(),'WhaleMusume/runtime/windows-x64-v1');
const whaleRuntime=process.platform==='win32' && fs.existsSync(path.join(installed,'electron/.ready')) && fs.existsSync(path.join(installed,'python/.ready'));
const petLocal=profile.kind==='pet' && profile.electronParts.every(item=>fs.existsSync(path.join(root,profile.package,item.local)));
const cold=process.env.DESKTOP_PET_RUN_COLD_TEST==='1';
test('prepare and MCP handshake work with no Node or Python on PATH',{skip:process.platform!=='win32'||!(cold || (profile.kind==='whale'?whaleRuntime:petLocal)),timeout:690000},()=>{
 const data=path.join(root,'.qa/launcher-smoke');fs.mkdirSync(data,{recursive:true});
 if(profile.kind==='whale' && whaleRuntime && !cold){
  const target=path.join(data,'runtime/windows-x64-v1');fs.mkdirSync(target,{recursive:true});
  for(const name of ['electron','python'])if(!fs.existsSync(path.join(target,name)))fs.symlinkSync(path.join(installed,name),path.join(target,name),'junction');
 }
 const prepared=invoke('prepare',data);assert.equal(prepared.status,0,prepared.stderr);
 const config=JSON.parse(fs.readFileSync(path.join(data,'launcher-runtime.json')));assert.equal(fs.existsSync(config.electron),true);if(profile.kind==='pet')assert.equal(fs.existsSync(config.python),true,JSON.stringify(config));
 if(profile.kind==='pet'){
  const workerConfig=path.join(data,'test-worker-config.json');fs.writeFileSync(workerConfig,JSON.stringify({usb:false}));
  const worker=spawnSync(config.python,['-u',path.join(root,profile.package,'desktop/frame_worker.py'),'--config',workerConfig],{input:'',encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,PATH:limitedPath}});
  assert.equal(worker.status,0,worker.stderr);assert.equal(JSON.parse(worker.stdout.trim().split(/\r?\n/)[0]).worker,'ready');
 }
 const requests=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18'}},{jsonrpc:'2.0',id:2,method:'tools/list'}];
 const result=invoke('mcp',data,{input:requests.map(r=>JSON.stringify(r)).join('\n')+'\n'});assert.equal(result.status,0,result.stderr);
 const replies=result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));assert.deepEqual(replies.map(r=>r.id),[1,2]);assert.equal(replies[1].result.tools.length,profile.kind==='whale'?5:6);
});
