import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=fileURLToPath(new URL('../',import.meta.url));
const input=process.argv[2] || 'zip';
const profile=JSON.parse(fs.readFileSync(path.join(source,'scripts/windows-launcher.json')));
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'pet-cold-install-'));
const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
let root=source;
if(input==='zip'){
 const zip=path.join(source,'dist',profile.artifact);
 const code="Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory('"+zip.replaceAll("'","''")+"','"+workspace.replaceAll("'","''")+"')";
 const r=spawnSync(ps,['-NoProfile','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);root=path.join(workspace,profile.kind==='whale'?'whale-musume':'dsh-pet-jonsbo');
}
const data=path.join(workspace,'isolated-data');fs.mkdirSync(data);
fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({usb:false}));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const env={...process.env,PATH:[path.join(process.env.SystemRoot,'System32'),path.dirname(ps)].join(';'),DESKTOP_PET_HEADLESS:'1',WHALE_AUTOSTART:'0',PET_AUTOSTART:'0',DSH_HOME:path.join(workspace,'isolated-dsh')};
for(const key of ['PET_RUNTIME_STATE','PET_NODE','PET_USB_WORKER','DSH_PET_ELECTRON_PATH','WHALE_NODE','WHALE_ELECTRON','WHALE_PYTHON','PET_DATA_DIR','WHALE_DATA_DIR'])delete env[key];
const invoke=mode=>{
 const log=path.join(workspace,mode+'.log'),err=path.join(workspace,mode+'.err');
 const outFd=fs.openSync(log,'w'),errFd=fs.openSync(err,'w');
 try{
  const r=spawnSync(ps,['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/windows-launcher.ps1'),'-Mode',mode,'-Headless','-DataDir',data,'-Port',String(port)],{cwd:root,windowsHide:true,timeout:1200000,env,stdio:['ignore',outFd,errFd]});
  assert.equal(r.status,0,JSON.stringify({mode,error:r.error?.message,stderr:fs.readFileSync(err,'utf8'),workspace}));
 }finally{fs.closeSync(outFd);fs.closeSync(errFd);}
};
console.log(JSON.stringify({project:profile.name,phase:'cold prepare',root,data,port,noNodePythonPath:true}));
invoke('prepare');
console.log(JSON.stringify({project:profile.name,phase:'wake'}));
try{
 invoke('wake');
 const state=await fetch('http://127.0.0.1:'+port+'/state').then(r=>r.json());
 assert.equal(state.service,profile.service);
 assert.equal(profile.kind==='whale'?state.output.desktop==='visible':state.activeSources.includes('chatgpt'),true);
 const result={project:profile.name,mode:input,root,data,port,coldDownloads:true,noNodePythonPath:true,desktopReady:true,usbDisabledForTest:true,service:state.service,output:state.output};
 fs.writeFileSync(path.join(workspace,'result.json'),JSON.stringify(result,null,2));
 fs.mkdirSync(path.join(source,'.qa'),{recursive:true});
 fs.copyFileSync(path.join(workspace,'result.json'),path.join(source,'.qa',input+'-cold-smoke-result.json'));
 console.log(JSON.stringify(result));
}finally{
 const state=await fetch('http://127.0.0.1:'+port+'/state').then(r=>r.json()).catch(()=>null);
 if(state?.service===profile.service)await fetch('http://127.0.0.1:'+port+'/shutdown',{method:'POST',headers:{[profile.header]:'1'}});
}
