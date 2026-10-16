import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const planned=JSON.parse(fs.readFileSync(path.join(root,'art-source/chatgpt/action-production.json'),'utf8'));
const runtime=[],reports=[];
for(const action of planned){
 const file=path.join(root,'art-source/chatgpt/keyframes',action.id+'.json');
 if(!fs.existsSync(file))continue;
 const report=JSON.parse(fs.readFileSync(file,'utf8')),gif=fs.readFileSync(path.join(root,report.file));
 if(report.frames!==216||report.uniqueFrames<200||report.durationMs!==9000||crypto.createHash('sha256').update(gif).digest('hex')!==report.sha256)throw Error('Unverified action '+action.id);
 reports.push(report);runtime.push({id:action.id,sourceAnimation:action.sourceAnimation,label:action.label,category:action.category});
}
if(runtime.length!==107)throw Error('Expected 107 completed actions, found '+runtime.length);
fs.writeFileSync(path.join(root,'dsh-pet/assets/pets/chatgpt/actions.json'),JSON.stringify(runtime,null,2)+'\n');
fs.writeFileSync(path.join(root,'dsh-pet/assets/pets/chatgpt/animation-generation.json'),JSON.stringify(reports,null,2)+'\n');
fs.writeFileSync(path.join(root,'art-source/chatgpt/action-production.json'),JSON.stringify(planned.map(a=>({...a,status:'exported'})),null,2)+'\n');
const duets=JSON.parse(fs.readFileSync(path.join(root,'dsh-pet/assets/pets/duo/actions.json'),'utf8'));
const duoReports=duets.map(a=>JSON.parse(fs.readFileSync(path.join(root,'art-source/duo/keyframes',a.id+'.json'),'utf8')));
if(duoReports.some(a=>a.frames!==216||a.durationMs!==9000))throw Error('Incomplete duet exports');
fs.writeFileSync(path.join(root,'dsh-pet/assets/pets/duo/animation-generation.json'),JSON.stringify(duoReports,null,2)+'\n');
console.log(JSON.stringify({princess:runtime.length,duets:duoReports.length,durationMs:9000,fps:24}));
