// Prepare runtime only; never rewrite portable manifests with developer paths.
import path from 'node:path';import {spawn} from 'node:child_process';import {root,dataDir} from '../bridge/runtime.mjs';
const args=['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.resolve(root,'../scripts/windows-launcher.ps1'),'-Mode','prepare','-DataDir',dataDir];
if(process.env.DESKTOP_PET_HEADLESS==='1')args.push('-Headless');
const p=spawn('powershell.exe',args,{stdio:'inherit',windowsHide:true});p.on('error',e=>{console.error(e.message);process.exitCode=1;});p.on('exit',code=>{process.exitCode=code??1;});
