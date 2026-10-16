import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCodexQuota,CodexPetHost} from './codex-host.ts';
import {toBalanceState,balanceBubbleView,balancePercent} from '../shared/balance.ts';
import {createStandaloneContext} from './context.ts';
test('weekly-only quota remains weekly-only and displays actual remaining percentage',()=>{
 const result=parseCodexQuota({rateLimitsByLimitId:{codex:{planType:'prolite',primary:{usedPercent:19,windowDurationMins:10080,resetsAt:1900000000},secondary:null}}});
 assert.ok(result.ok);assert.equal(result.shape,'quota');if(result.shape!=='quota')return;
 assert.equal(result.data.windows.length,1);assert.equal(result.data.windows[0].label,'Codex · 周');assert.equal('monthly' in result.data,false);
 const view=toBalanceState(result);assert.ok(view?.ok);assert.equal(balancePercent(view),19);
 assert.ok(balanceBubbleView(view).some(row=>row.text.includes('剩余 81%')));
 assert.ok(!balanceBubbleView(view).some(row=>row.text.includes('5小时')||row.text.includes('月额度')));
});
test('multiple independent model limits, zero usage, unavailable data and invalid percentages',()=>{
 const result=parseCodexQuota({rateLimitsByLimitId:{a:{primary:{usedPercent:0,windowDurationMins:300}},b:{primary:{usedPercent:70,windowDurationMins:10080}}}});
 const view=toBalanceState(result);assert.ok(view?.ok);assert.equal(balancePercent(view),70);
 const rows=balanceBubbleView(view);assert.ok(rows.some(r=>r.text.includes('剩余 100%')));assert.ok(rows.some(r=>r.text==='重置时间未知'));
 assert.equal(parseCodexQuota({rateLimits:{primary:null,secondary:null}}).ok,false);
 assert.throws(()=>parseCodexQuota({rateLimits:{primary:{usedPercent:NaN,windowDurationMins:300}}}));
 assert.equal(toBalanceState({ok:true,shape:'quota',data:{windows:[{label:'bad',usedPercent:-1,windowMinutes:300}]}}),null);
});
test('an explicit host adapter enables standalone chat without exposing credentials and is disposed',async()=>{
 let disposed=false;const host=new CodexPetHost();host.balance=async()=>parseCodexQuota({rateLimits:{primary:{usedPercent:1,windowDurationMins:300}}});
 host.stream=async function*(){yield {type:'text',text:'桌宠回复'};};host.dispose=()=>{disposed=true;};
 const logger={info(){},warn(){},error(){},debug(){}};const context=createStandaloneContext({port:1,logger,host});
 const agent=context.ctx.agentDefaultModel as {currentSelection():{provider:string;model:string}};
 assert.deepEqual(agent.currentSelection(),{provider:'codex-chatgpt',model:'host-default'});
 const credential=context.ctx.credentials as {resolve(value:unknown):Promise<unknown>};assert.equal(await credential.resolve('OPENAI_API_KEY'),undefined);
 const llm=context.ctx.llm as {stream(value:unknown):AsyncIterable<{text:string}>};let text='';for await(const chunk of llm.stream({}))text+=chunk.text;assert.equal(text,'桌宠回复');
 await context.dispose();assert.equal(disposed,true);
});

test('simultaneous quota requests share one host call',async()=>{
 const host=new CodexPetHost();let opens=0,finish!:()=>void;
 const gate=new Promise<void>(r=>{finish=r;});
 (host as unknown as {open:()=>unknown}).open=()=>{opens++;return {initialize:()=>gate,request:async()=>({rateLimits:{primary:{usedPercent:20,windowDurationMins:10080}}}),close(){}};};
 const a=host.balance(true),b=host.balance(true);finish();
 assert.deepEqual(await a,await b);assert.equal(opens,1);await host.balance();assert.equal(opens,1);host.dispose();
});

test('transport exit rejects generation promptly and releases the next queued reply',async()=>{
 const host=new CodexPetHost();let opens=0;
 (host as unknown as {open:()=>unknown}).open=()=>{
  const number=++opens,listeners=new Set<(method:string,p:Record<string,unknown>)=>void>();
  return {listeners,initialize:async()=>{},close(){},request:async(method:string)=>{
   if(method==='config/read')return {config:{}};
   if(method==='thread/start')return {thread:{id:'pet'}};
   if(method==='turn/start')queueMicrotask(()=>{for(const listener of [...listeners]){
    if(number===1)listener('transport/error',{message:'host exited'});
    else{listener('item/completed',{threadId:'pet',item:{type:'agentMessage',text:'下一条正常'}});listener('turn/completed',{threadId:'pet',turn:{status:'completed'}});}
   }});
   return {};
  }};
 };
 const failed=(async()=>{for await(const chunk of host.stream({}))void chunk;})();
 const next=(async()=>{let text='';for await(const chunk of host.stream({}))text+=chunk.text;return text;})();
 await assert.rejects(failed,/host exited/);assert.equal(await next,'下一条正常');assert.equal(opens,2);host.dispose();
});
