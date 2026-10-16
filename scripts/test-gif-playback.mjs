// Headless browser only: no pet processes, DSH profile changes, runtime installs or downloads.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '../dsh-pet/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<body style="background:#243247"><div id="stage" style="position:relative;width:640px;height:360px"></div><script src="/core.js"></script></body>');return;}
  const rel=req.url==='/core.js'?'dsh-pet/runtime/electron-helper/shared-core.js':decodeURIComponent(req.url.split('?')[0]).slice(1);
  const file=path.resolve(root,rel);
  res.setHeader('Access-Control-Allow-Origin','*');
  if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.webm')?'video/webm':file.endsWith('.png')?'image/png':'image/gif');fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PET_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const results=[];
 const roles=process.argv[2]==='all'?['chatgpt','duo']:['duo'];
 for(const role of roles)for(const name of fs.readdirSync(path.join(root,'dsh-pet/assets/pets',role,'gif')).filter(n=>n.endsWith('.gif'))){
  const url='/dsh-pet/assets/pets/'+role+'/gif/'+name;
  const result=await page.evaluate(async({url})=>{
   window.player?.dispose();window.player=new PetShared.GifPlayer(document.querySelector('#stage'));
   let ended=0;await window.player.play(url,false,()=>ended++);
   const a=window.player.canvas.toDataURL();await new Promise(r=>setTimeout(r,400));
   const b=window.player.canvas.toDataURL();const ready=window.player.ready;
   window.player.stop();const hidden=window.player.canvas.style.display==='none';
   return {changed:a!==b,ready,ended,hidden};
  },{url});
  assert.equal(result.changed,true,role+'/'+name+' froze at first frame');assert.equal(result.ready,true);assert.equal(result.ended,0);assert.equal(result.hidden,true);
  results.push({role,name,...result});
 }
 // Exercise the actual JONSBO compositor with the same decoded GIF canvas.
 await page.evaluate(async()=>{
   await window.player.play('/dsh-pet/assets/pets/chatgpt/gif/princess-013.gif',false,()=>{});
   window.S=PetShared;window.frames=[];
   window.sprites=[{gifPlayer:window.player,videoA:{readyState:0},videoB:{readyState:0},anim:'working',character:'chatgpt',workText:'哼，才没有担心你',applyDuet(){},bubble:null}];
   window.jonsboBridge={async frame(value){window.frames.push(value);return {source:'chatgpt'};}};
 });
 await page.addScriptTag({path:path.join(root,'dsh-pet/runtime/electron-helper/jonsbo-renderer.js')});
 await page.waitForTimeout(700);
 const screen=await page.evaluate(()=>({count:window.frames.length,distinct:new Set(window.frames.map(f=>f.png)).size,character:window.frames[0]?.character}));
 assert.ok(screen.count>=3);assert.ok(screen.distinct>=3,'USB compositor froze at GIF frame zero');assert.equal(screen.character,'chatgpt');
 const once=await page.evaluate(async()=>{
   let ended=0;await window.player.play('/dsh-pet/assets/pets/duo/gif/boxing.gif',true,()=>ended++);
   await new Promise(r=>setTimeout(r,9800));window.player.dispose();return ended;
 });assert.equal(once,1);assert.deepEqual(errors,[]);
 // A same-GIF work update must retain the current frame rather than jump to zero.
 const continuing=await page.evaluate(async()=>{
  window.player=new PetShared.GifPlayer(document.querySelector('#stage'));
  const url='/dsh-pet/assets/pets/chatgpt/gif/princess-013.gif';
  await window.player.play(url,false,()=>{});await new Promise(r=>setTimeout(r,650));
  const before=window.player.canvas.toDataURL();await window.player.play(url,false,()=>{});
  const same=before===window.player.canvas.toDataURL();window.player.stop();return same;
 });assert.equal(continuing,true);
 // Real DSH WebM + a cross-origin dialogue illustration must remain exportable.
 const mediaOrigin='http://localhost:'+server.address().port;
 const fish=fs.readdirSync(path.join(root,'dsh-pet/assets/pets/fish/webm')).find(n=>n.endsWith('.webm'));
 const picture=fs.readdirSync(path.join(root,'dsh-pet/assets/pets/chatgpt/memes')).find(n=>n.endsWith('.png'));
 await page.evaluate(async({mediaOrigin,fish,picture})=>{
  const v=document.createElement('video');v.crossOrigin='anonymous';v.muted=true;v.loop=true;v.className='is-front';v.style.opacity='1';document.body.append(v);
  v.src=mediaOrigin+'/dsh-pet/assets/pets/fish/webm/'+encodeURIComponent(fish);await v.play();
  const bubble=document.createElement('div');bubble.className='pet-bubble is-on';
  const img=PetShared.createMemeImage('preview',mediaOrigin);img.src=mediaOrigin+'/dsh-pet/assets/pets/chatgpt/memes/'+encodeURIComponent(picture);await img.decode();bubble.append(img);
  const line=document.createElement('div');line.textContent='这是一段必须完整收录的对话，包含多行中文和插图，最后这几个字也不能丢失。';bubble.append(line);
  window.sprites=[{videoA:v,videoB:{readyState:0},character:'fish',anim:'idle',bubble,applyDuet(){}}];window.frames=[];
  const original=CanvasRenderingContext2D.prototype.fillText;window.captionParts=[];
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.captionParts.push(text);return original.call(this,text,...args);};
 },{mediaOrigin,fish,picture});
 await page.waitForTimeout(1200);
 const dsh=await page.evaluate(()=>({frames:window.frames.length,error:window.__jonsboDebug.error,text:window.captionParts.join('')}));
 assert.ok(dsh.frames>=3,'DSH video/illustration stopped frame export: '+dsh.error);assert.equal(dsh.error,null);
 assert.ok(dsh.text.includes('最后这几个字也不能丢失。'),'bubble text was truncated');
 const png=await page.evaluate(()=>window.frames.at(-1).png);
 fs.writeFileSync(path.join(root,'.qa','dialogue-compositor.png'),Buffer.from(png,'base64'));
 // Reproduce the original no-CORS illustration failure, then prove recovery.
 await page.evaluate(async()=>{const img=window.sprites[0].bubble.querySelector('img');img.removeAttribute('crossorigin');img.src+='?uncors';await img.decode();window.frames=[];});
 await page.waitForTimeout(400);
 const blocked=await page.evaluate(()=>window.frames.length===0 && /taint|Tainted|SecurityError|export/i.test(window.__jonsboDebug.error));
 assert.equal(blocked,true,'fixture must reproduce the old illustration export failure');
 await page.evaluate(async()=>{const img=window.sprites[0].bubble.querySelector('img');img.crossOrigin='anonymous';img.src+='&cors';await img.decode();});
 await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>window.frames.length)>0,'corrected image must recover frame exports');
 console.log(JSON.stringify({headless:true,downloaded:false,petStarted:false,onceEnded:once,screen,dsh,blocked,continuing,verified:results},null,2));
} finally { await browser.close();await new Promise(r=>server.close(r)); }
