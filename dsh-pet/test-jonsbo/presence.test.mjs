import test from 'node:test';
import assert from 'node:assert/strict';
import {Sources} from '../bridge/state.mjs';
import {Duets} from '../bridge/duets.mjs';
import {createBridge} from '../bridge/server.mjs';
const control={visible:true,desktop:true};
const info=(character,extra={})=>({character,desktop:true,instanceId:'main',build:'1.1.2',error:null,...extra});
test('two real pet identities remain eligible when PNG capture fails; two GPT agents never impersonate DSH',()=>{
 let now=0;const sources=new Sources(()=>now),duets=new Duets({now:()=>now});
 sources.touch('chatgpt',info('chatgpt'));assert.equal(duets.snapshot(sources,control).eligible,false);
 sources.touch('chatgpt',info('chatgpt',{instanceId:'second-agent'}));assert.equal(duets.snapshot(sources,control).eligible,false);
 sources.touch('dsh',info('fish',{error:'Canvas temporarily unavailable'}));
 let state=duets.snapshot(sources,control);assert.equal(state.active,true);assert.equal(state.participants.dsh.error,'Canvas temporarily unavailable');
 assert.equal(sources.frames.size,0);
 now=6001;sources.touch('chatgpt',info('chatgpt'));state=duets.snapshot(sources,control);assert.equal(state.active,false);assert.equal(state.participants.dsh,null);
});
test('presence records exact roles and display intent, independent of screen-source selection',()=>{
 const sources=new Sources(),duets=new Duets();sources.touch('chatgpt',info('chatgpt'));sources.touch('dsh',info('whale'));
 assert.match(duets.snapshot(sources,control).reason,/大肥鱼/);
 sources.touch('dsh',info('fish',{desktop:false}));assert.equal(duets.snapshot(sources,control).eligible,false);
 sources.touch('dsh',info('fish'));sources.preferred='dsh';assert.equal(duets.snapshot(sources,control).active,true);
 assert.equal(duets.snapshot(sources,{visible:true,desktop:false}).eligible,false);
 duets.set('off');assert.equal(duets.snapshot(sources,control).active,false);
});
test('presence endpoint validates identity and cannot wake an extra GPT pet',async(t)=>{
 const server=createBridge({launch:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const send=async(body,authorized=true)=>fetch(base+'/presence',{method:'POST',headers:authorized?{'X-Pet-Client':'1','Content-Type':'application/json'}:{},body:JSON.stringify(body)});
 assert.equal((await send({source:'dsh',...info('fish')},false)).status,403);
 assert.equal((await send({source:'unknown',...info('fish')})).status,400);
 const state=await(await send({source:'dsh',...info('fish')})).json();
 assert.equal(state.build,'1.1.2');assert.equal(state.control.visible,false);assert.equal(state.standalone,null);
 assert.deepEqual(state.connectedSources,['dsh']);assert.deepEqual(state.activeSources,[]);assert.equal(state.characters.dsh,'fish');
});

test('explicit GPT desktop close preserves the DSH source and shared screen service',async(t)=>{
 const server=createBridge({launch:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,body)=>fetch(base+route,{method:'POST',headers:{'X-Pet-Client':'1','Content-Type':'application/json'},body:JSON.stringify(body)});
 await post('/presence',{source:'dsh',...info('fish')});
 await post('/event',{source:'chatgpt',action:'wake'});
 await post('/presence',{source:'chatgpt',...info('chatgpt')});
 assert.equal((await post('/pet/close',{unexpected:true})).status,400);
 const state=await(await post('/pet/close',{})).json();
 assert.equal(state.control.visible,false);assert.equal(state.shuttingDown,false);
 assert.deepEqual(state.connectedSources,['dsh']);assert.equal(state.duet.active,false);
 assert.equal((await fetch(base+'/state')).status,200);
 assert.equal((await(await post('/event',{source:'chatgpt',action:'wake'})).json()).control.visible,true);
});
