import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../dsh-pet/node_modules/playwright/index.mjs';
import {createBridge} from '../dsh-pet/bridge/server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const bridge=createBridge({launch:false});await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+bridge.address().port;
const headers={'Content-Type':'application/json','X-Pet-Client':'1'};
const post=async(route,data)=>{const r=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(data)});assert.ok(r.ok);return r.json();};
const fallback='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XkAAAAASUVORK5CYII=';
const png=fs.existsSync(path.join(root,'.qa/dialogue-compositor.png'))?fs.readFileSync(path.join(root,'.qa/dialogue-compositor.png')).toString('base64'):fallback;
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let beat;
try{
 await post('/event',{source:'chatgpt',action:'wake'});
 const sendFrames=async()=>{for(const source of ['dsh','chatgpt'])await post('/frame',{source,png,animation:'idle',character:source==='dsh'?'fish':'chatgpt'});};
 await sendFrames();beat=setInterval(()=>void sendFrames(),1000);
 const page=await browser.newPage({viewport:{width:1120,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/?source=chatgpt');await page.waitForFunction(()=>document.querySelector('#dsh-name').textContent==='大肥鱼');
 // A URL opening context must not pin subsequent commands to that old source.
 await page.click('[data-source="chatgpt"]');await page.waitForFunction(()=>document.querySelector('[data-source="chatgpt"]').getAttribute('aria-pressed')==='true');
 await page.click('#disconnect');await page.waitForFunction(()=>document.querySelector('[data-source="dsh"]').getAttribute('aria-pressed')==='true');
 let s=await(await fetch(base+'/state')).json();assert.equal(s.screens.chatgpt,false);assert.equal(s.screenSource,'dsh');
 await page.click('#disconnect');await page.waitForTimeout(200);s=await(await fetch(base+'/state')).json();assert.equal(s.screens.dsh,false);
 await page.click('#connect');await page.selectOption('#duet','cafe');await page.waitForTimeout(200);
 s=await(await fetch(base+'/state')).json();assert.equal(s.duet.active,true);assert.equal(s.duet.action,'cafe');assert.equal(s.screens.chatgpt,true);
 await page.selectOption('#duet','off');await page.waitForTimeout(200);s=await(await fetch(base+'/state')).json();assert.equal(s.duet.active,false);
 assert.equal(await page.locator('[data-state]').count(),0);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(root,'.qa','screen-room-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:850});await page.screenshot({path:path.join(root,'.qa','screen-room-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 // Bubble margin uses its loaded height while keeping the character anchored.
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'dsh-pet/runtime/electron-helper/sprite.js'),'utf8')+'\nwindow.TestSprite=PetSprite;'});
 await page.addScriptTag({path:path.join(root,'dsh-pet/runtime/electron-helper/shared-core.js')});
 const resumed=await page.evaluate(()=>{
  window.S=PetShared;window.__jonsboDebug={source:'chatgpt'};
  const pet=Object.create(TestSprite.prototype);pet.pet={id:'duet-regression'};pet.duetAction='cafe';pet.workState='working';pet.anim='__duet-cafe';pet.gen=0;
  pet.animations={idle:['idle'],events:{workStatus:['thinking','current-work']}};
  pet.stopMove=()=>{};pet.stopThrow=()=>{};pet.switchTo=name=>pet.anim=name;pet.playIdle=()=>pet.anim='idle';
  pet.applyDuet({active:false});const working=pet.anim;
  pet.duetAction='cafe';pet.workState=null;pet.applyDuet({active:false});return {working,idle:pet.anim};
 });assert.deepEqual(resumed,{working:'current-work',idle:'idle'});
 const bubble=await page.evaluate(()=>{
  window.WINDOW_MARGIN_RATIO=.5;
  const pet=Object.create(TestSprite.prototype);pet.size=380;pet.margin={t:190};pet.pos={x:100,y:200};pet.el=document.createElement('div');pet.bubble=document.createElement('div');pet.bubble.className='is-on';pet.bubble.style.height='310px';document.body.append(pet.bubble);let sent;
  pet.sendBounds=(x,y)=>sent={x,y};pet.fitBubble();return {top:pet.margin.t,sent};
 });assert.ok(bubble.top>=310);assert.deepEqual(bubble.sent,{x:100,y:200});
 console.log(JSON.stringify({sourceSwitch:true,disconnectTargetsCurrent:true,duet:true,responsive:true,resumed,bubble},null,2));
}finally{clearInterval(beat);await browser.close();await new Promise(r=>bridge.close(r));}
