import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root,nodeCommand,electronPath,dataDir,port } from '../bridge/runtime.mjs';
import { postEvent,status } from '../bridge/client.mjs';
const qa=path.resolve(root,'../qa');const home=path.join(qa,'dsh-mirror');
mkdirSync(path.join(home,'dsh-pet'),{recursive:true});
writeFileSync(path.join(home,'dsh-pet/main-config.jsonc'),JSON.stringify({pets:[{id:'main',name:'大肥鱼 DSH',size:260,display:'desktop',balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:true,position:{corner:'bottom-left',marginX:24,marginY:24}}],notificationsEnabled:false}));
await postEvent({action:'hide',source:'chatgpt'});
const child=spawn(nodeCommand(),[path.join(root,'lib/standalone.js'),'--port','19392'],{cwd:root,windowsHide:true,env:{...process.env,DSH_HOME:home,DSH_PET_ELECTRON_PATH:electronPath,DSH_PET_JONSBO_SOURCE:'dsh',PET_DATA_DIR:dataDir,PET_PORT:String(port),ELECTRON_RUN_AS_NODE:'1'},stdio:'ignore'});
let launchError;child.on('error',e=>{launchError=e;});
try{
  let observed;
  for(let i=0;i<60;i++){
    await new Promise(r=>setTimeout(r,250));if(launchError)throw launchError;
    observed=await status();
    if(observed.source==='dsh'&&observed.output.usb==='streaming')break;
  }
  assert.equal(observed.source,'dsh');assert.equal(observed.output.usb,'streaming');
  writeFileSync(path.join(qa,'dsh-mirror-report.json'),JSON.stringify({source:observed.source,animation:observed.animation,usb:observed.output,scope:'upstream host/helper pipeline using DSH source; no live user profile modified'},null,2));
  console.log(JSON.stringify({source:observed.source,animation:observed.animation,usb:observed.output.usb}));
}finally{
  child.kill();await new Promise(r=>setTimeout(r,2500));
  await postEvent({action:'wake',source:'chatgpt',state:'idle',message:''});
}
