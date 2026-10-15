import test from 'node:test';
import assert from 'node:assert/strict';
import { Duets, ACTIONS } from '../bridge/duets.mjs';
import { Sources, Controls } from '../bridge/state.mjs';

test('duo requires both live hosts, the correct two human characters and desktop visibility', () => {
  let now = 0;
  const sources = new Sources(() => now), controls = new Controls(() => now), duets = new Duets({ now: () => now });
  const state = () => duets.snapshot(sources, controls.snapshot());
  controls.apply({source:'chatgpt',action:'wake',state:'working'});
  sources.put('chatgpt',{character:'chatgpt'});
  assert.equal(state().active,false);
  // Two GPT agent sessions are not a second DSH host.
  controls.apply({source:'chatgpt',action:'wake',sessionId:'a'.repeat(32)});
  assert.equal(state().active,false);
  sources.put('dsh',{character:'whale'});
  assert.equal(state().active,false);
  sources.put('dsh',{character:'fish'});
  assert.equal(state().action,'boxing');
  assert.equal(state().owner,'chatgpt');
  now += 3001;
  assert.equal(state().active,false);
  sources.put('dsh',{character:'fish'}); sources.put('chatgpt',{character:'chatgpt'});
  assert.equal(state().active,true);
  controls.apply({source:'chatgpt',action:'hide'});
  controls.release('a'.repeat(32));
  assert.equal(state().active,false);
});

test('all eight scenes rotate, manual selection/off persists and reconnect restarts safely', () => {
  let now=0; const persisted=[];
  const sources=new Sources(()=>now), duets=new Duets({now:()=>now,persist:v=>persisted.push(v)});
  const state=()=>{sources.put('dsh',{character:'fish'});sources.put('chatgpt',{character:'chatgpt'});return duets.snapshot(sources,{visible:true,desktop:true});};
  assert.equal(state().action,ACTIONS[0]);
  for(let i=1;i<8;i++){now=i*16000;assert.equal(state().action,ACTIONS[i]);}
  duets.set('cafe'); now+=16000; assert.equal(state().action,'cafe');
  duets.set('off'); assert.equal(state().active,false);
  duets.set('auto'); assert.equal(state().action,'boxing');
  assert.deepEqual(persisted,['cafe','off','auto']);
  assert.throws(()=>duets.set('../bad'));
});

test('new host cannot steal current projection; explicit handoff and expiry work',()=>{
  let now=0;const s=new Sources(()=>now);
  s.put('dsh',{character:'fish'});s.put('chatgpt',{character:'chatgpt'});
  assert.equal(s.current().source,'dsh');
  s.preferred='chatgpt';assert.equal(s.current().source,'chatgpt');
  now=3001;s.put('dsh',{character:'fish'});assert.equal(s.current().source,'dsh');
});
