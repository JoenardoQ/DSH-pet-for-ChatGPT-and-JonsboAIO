import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const clientURL = new URL('../bridge/client.mjs', import.meta.url).href;
function client(port, data, code = 'console.log(JSON.stringify(await c.ensureBridge()))') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `const c=await import(${JSON.stringify(clientURL)});${code}`], {
      env: {...process.env,PET_PORT:String(port),PET_DATA_DIR:data}, windowsHide:true, stdio:['ignore','pipe','pipe'],
    });
    let out='', err='';
    child.stdout.on('data',b=>out+=b); child.stderr.on('data',b=>err+=b);
    child.on('error',reject);
    child.on('exit',code=>resolve({code,out,err}));
  });
}
async function fixture(t, state) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'pet-migration-test-'));
  mkdirSync(path.join(dir,'data'));writeFileSync(path.join(dir,'data/config.json'),'{"usb":false}');
  let shutdowns=0;
  const old=http.createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/shutdown'){shutdowns++;res.end('{"stopping":true}');old.close();}
    else res.end(JSON.stringify(state));
  });
  old.listen(0,'127.0.0.1');await once(old,'listening');
  const port=old.address().port;
  t.after(async()=>{
    old.close();old.closeAllConnections();
    try {
      const s=await(await fetch(`http://127.0.0.1:${port}/state`)).json();
      if(s.service==='dsh-pet-jonsbo' && s.version===2)
        await fetch(`http://127.0.0.1:${port}/shutdown`,{method:'POST',headers:{'X-Pet-Client':'1'}});
    } catch {}
    // The fixture owns this exact temporary directory only.
    if(path.dirname(dir)===os.tmpdir()) rmSync(dir,{recursive:true,force:true});
  });
  return {port,data:path.join(dir,'data'),shutdowns:()=>shutdowns};
}
test('three simultaneous installations retire an old bridge once and share one new process', async t=>{
  const f=await fixture(t,{service:'dsh-pet-jonsbo',version:1});
  const results=await Promise.all(Array.from({length:3},()=>client(f.port,f.data)));
  for(const r of results) assert.equal(r.code,0,r.err);
  const states=results.map(r=>JSON.parse(r.out));
  assert.equal(f.shutdowns(),1);
  assert.equal(new Set(states.map(s=>s.pid)).size,1);
  assert.ok(states.every(s=>s.version===2 && s.control.visible===false && s.standalone===null));
  const connected=await(await fetch(`http://127.0.0.1:${f.port}/device/connection`,{
    method:'POST',headers:{'X-Pet-Client':'1','Content-Type':'application/json'},body:JSON.stringify({source:'dsh',enabled:false})
  })).json();
  assert.equal(connected.control.visible,false,'DSH screen control cannot start ChatGPT');
  assert.equal(connected.standalone,null);
});
test('another service and a newer protocol are never shut down', async t=>{
  for(const state of [{service:'unrelated',version:1},{service:'dsh-pet-jonsbo',version:99}]){
    const f=await fixture(t,state);
    const result=await client(f.port,f.data);
    assert.notEqual(result.code,0);
    assert.equal(f.shutdowns(),0);
  }
});
