import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root,dataDir} from './runtime.mjs';
let pending;
function adopt(file){
  const s=JSON.parse(fs.readFileSync(file,'utf8'));
  if(s.kind!=='pet' || !fs.existsSync(s.electron) || !fs.existsSync(s.worker))throw Error('运行组件尚未就绪，请在启动窗口点击重试。');
  process.env.PET_NODE=s.electron;process.env.DSH_PET_ELECTRON_PATH=s.electron;process.env.PET_USB_WORKER=s.worker;
  if(s.dshHome)process.env.DSH_HOME=s.dshHome;process.env.PET_RUNTIME_STATE=file;
  return s.electron;
}
export async function prepareWindows(){
  if(process.platform!=='win32')return;
  const launcher=path.resolve(root,'../scripts/windows-launcher.ps1');
  if(!fs.existsSync(launcher))return;
  if(process.env.PET_RUNTIME_STATE){try{return adopt(process.env.PET_RUNTIME_STATE);}catch{}}
  pending ||= (async()=>{
    await new Promise((resolve,reject)=>{
      const args=['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',launcher,'-Mode','prepare','-DataDir',dataDir];
      if(process.env.DESKTOP_PET_HEADLESS==='1')args.push('-Headless');
      const p=spawn(path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
      let tail='';p.stderr.on('data',b=>tail=(tail+b).slice(-2000));
      const timer=setTimeout(()=>{p.kill();reject(Error('组件准备超时，请重新打开启动窗口重试。'));},1200000);
      p.once('error',e=>{clearTimeout(timer);reject(e);});p.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(tail || '组件准备已取消。'));});
    });
    return adopt(path.join(dataDir,'launcher-runtime.json'));
  })().finally(()=>{pending=undefined;});
  return pending;
}
