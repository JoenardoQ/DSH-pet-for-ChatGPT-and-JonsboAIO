import fs from 'node:fs/promises';
import {chromium} from '../../../../dsh-pet/node_modules/playwright/index.mjs';
const dir=new URL('./',import.meta.url),meta=JSON.parse(await fs.readFile(new URL('parts.json',dir),'utf8'));
const parts={};for(const [name,value] of Object.entries(meta))parts[name]={...value,url:'data:image/png;base64,'+(await fs.readFile(new URL('parts/'+name+'.png',dir))).toString('base64')};
await fs.mkdir(new URL('frames',dir),{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage();await page.setContent('<canvas width="1280" height="960"></canvas>');
 await page.exposeFunction('saveFrame',async(index,png)=>fs.writeFile(new URL('frames/'+String(index).padStart(3,'0')+'.png',dir),Buffer.from(png.split(',')[1],'base64')));
 const stats=await page.evaluate(async parts=>{
  const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),sprites={};
  for(const [name,part] of Object.entries(parts)){const image=new Image();image.src=part.url;await image.decode();sprites[name]={...part,image};}
  const rad=d=>d*Math.PI/180,clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
  function piece(name,x,y,scale,pivot,angle=0){const s=sprites[name];ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.drawImage(s.image,-(pivot[0]-s.box[0]),-(pivot[1]-s.box[1]));ctx.restore();}
  function endpoint(x,y,angle,length){return [x-Math.sin(angle)*length,y+Math.cos(angle)*length];}
  const bounds=[];
  for(let n=0;n<216;n++){
   const t=n/24,raise=ease((t-1.4)/1.8)*(1-ease((t-6.5)/1.7));
   const wave=t>=3.2&&t<6.5?Math.sin((t-3.2)*Math.PI*4/3.3)*Math.sin((t-3.2)*Math.PI/3.3):0;
   const breath=Math.sin(t*Math.PI*2/4.5),lag=Math.sin(t*Math.PI*2/4.5-.6);
   ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,640,480);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   piece('tail',349,300,.37,[986,510],rad(1.6*lag));
   piece('hair',320,109,.42,[1045,44],rad(.7*lag));
   piece('wingL',304,206,.53,[327,594],rad(-1.2*breath-1.5*raise));
   piece('wingR',337,206,.53,[570,594],rad(1.2*breath+1.5*raise));
   const shoulder=[303,195],a=rad(8+58*raise),b=a+rad(5+113*raise+7*wave);
   const elbow=endpoint(...shoulder,a,51.5),wrist=endpoint(...elbow,b,51.3);
   piece('upper',...shoulder,.18,[223,936],a);
   piece('body',320,170,.57,[224,8]);
   piece('head',320,170,.24,[645,413],rad(-1.4*raise+.45*breath));
   piece('fore',...elbow,.18,[622,930],b);
   piece('hand',...wrist,.11,[1060,1202],b+Math.PI+rad(7*wave));
   bounds.push({frame:n,time:t,shoulderDeg:a*180/Math.PI,forearmDeg:b*180/Math.PI,elbow,wrist});
   await window.saveFrame(n,canvas.toDataURL('image/png'));
  }
  return bounds;
 },parts);
 await fs.writeFile(new URL('motion.json',dir),JSON.stringify({status:'proof-not-approved',method:'Continuous joint transforms of one fixed parts atlas; no optical-flow interpolation or pose crossfade',durationMs:9000,fps:24,frames:216,action:'One greeting: raise 1.4–3.2s, two waves 3.2–6.5s, lower 6.5–8.2s',stats},null,2));
 console.log('Rendered 216 continuous-joint frames; proof only.');
}finally{await browser.close();}
