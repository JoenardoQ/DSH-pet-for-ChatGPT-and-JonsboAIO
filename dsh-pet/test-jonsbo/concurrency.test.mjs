import test from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';import {Controls} from '../bridge/state.mjs';import {createBridge} from '../bridge/server.mjs';
const a='a'.repeat(32),b='b'.repeat(32);
test('two agents own state and visibility independently; idle never masks work',()=>{
 let now=1;const s=new Controls(()=>now);
 s.apply({source:'chatgpt',sessionId:a,action:'wake',state:'working'});now++;
 s.apply({source:'chatgpt',sessionId:b,action:'wake',state:'idle'});
 assert.equal(s.snapshot().state,'working');assert.equal(s.snapshot().connections.length,2);
 s.apply({source:'chatgpt',sessionId:b,action:'hide'});assert.equal(s.snapshot().visible,true);
 now+=9000;s.heartbeat(a);now+=9000;assert.equal(s.snapshot().visible,true);
 now+=1001;assert.equal(s.snapshot().visible,false);
 assert.throws(()=>s.apply({source:'chatgpt',sessionId:b,action:'update',state:'idle'}));
});
test('one host disconnect or hide preserves the other and DSH frames',async t=>{
 const server=createBridge({launch:false});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{server.closeAllConnections();server.close();});
 const base='http://127.0.0.1:'+server.address().port;const headers={'Content-Type':'application/json','X-Pet-Client':'1'};
 const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,await r.clone().text());return r.json();};
 for(const id of [a,b]){await post('/host',{id});await post('/event',{source:'chatgpt',sessionId:id,action:'wake',state:id===a?'working':'idle'});}
 let s=await post('/event',{source:'chatgpt',sessionId:b,action:'hide'});assert.equal(s.control.state,'working');assert.equal(s.visible,true);
 await post('/host',{id:b,release:true});s=await fetch(base+'/state').then(r=>r.json());assert.equal(s.connections.length,1);
 await post('/frame',{source:'dsh',png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',animation:'test'});
 await post('/event',{source:'chatgpt',sessionId:a,action:'hide'});s=await fetch(base+'/state').then(r=>r.json());assert.equal(s.control.visible,false);assert.equal(s.activeSources.includes('dsh'),true);
});
