import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('stalled HTTP body is aborted within the download deadline without touching a host',{skip:process.platform!=='win32',timeout:12000},async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pet-stall-test-')),sockets=new Set();
 const server=http.createServer((_req,res)=>{res.writeHead(200,{'Content-Length':'12345'});res.flushHeaders();});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const quote=s=>"'"+s.replaceAll("'","''")+"'";
 const code="$ErrorActionPreference='Stop';. "+quote(path.join(root,'scripts/install-plugins.ps1'))+" -Library;$expired=$false;try{Download-Once 'http://127.0.0.1:"+server.address().port+"/stall' "+quote(path.join(temp,'fixture.part'))+" 1 3}catch{if($_.Exception.Message -notmatch '等待上限'){throw};$expired=$true};if(!$expired){throw 'Missing download timeout'};Write-Output 'TIMEOUT_CONFIRMED'";
 const started=Date.now();let child;
 try{
  const result=await new Promise((resolve,reject)=>{child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('exit',code=>resolve({code,stdout,stderr}));});
  assert.equal(result.code,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/TIMEOUT_CONFIRMED/);assert.ok(Date.now()-started<7000);
 }finally{
  child?.kill();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));const resolved=fs.realpathSync(temp);assert.equal(path.dirname(resolved),fs.realpathSync(os.tmpdir()));fs.rmSync(resolved,{recursive:true,force:true});
 }
});
