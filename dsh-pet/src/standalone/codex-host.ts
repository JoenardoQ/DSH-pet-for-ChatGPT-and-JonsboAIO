import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createInterface, type Interface} from 'node:readline';
import type {BalanceResult} from '../host/balance/types';
export const CODEX_PROVIDER='codex-chatgpt';
type Obj=Record<string,unknown>;
const obj=(value:unknown):Obj=>value && typeof value==='object'?value as Obj:{};
export interface PetHost {
  provider:string;
  balance(force?:boolean):Promise<BalanceResult>;
  stream(options:unknown):AsyncIterable<{type:'text';text:string}>;
  dispose():void;
}
export function parseCodexQuota(raw:unknown):BalanceResult {
  const data=obj(raw),all=obj(data.rateLimitsByLimitId);
  const buckets=Object.keys(all).length?Object.entries(all):[['codex',data.rateLimits] as [string,unknown]];
  const windows:Array<{label:string;usedPercent:number;windowMinutes:number;resetsAt?:string}>=[];
  let plan:string|undefined;
  for(const [id,value] of buckets){
    const bucket=obj(value);if(typeof bucket.planType==='string')plan=bucket.planType;
    for(const value of [bucket.primary,bucket.secondary]){
      if(value==null)continue;const w=obj(value),used=w.usedPercent,minutes=w.windowDurationMins;
      if(typeof used!=='number'||!Number.isFinite(used)||used<0||used>100||typeof minutes!=='number'||!Number.isFinite(minutes)||minutes<=0)throw Error('宿主返回了无效套餐窗口');
      const duration=minutes===10080?'周':minutes===43200?'月':minutes%1440===0?minutes/1440+'天':minutes%60===0?minutes/60+'小时':minutes+'分钟';
      const label=(typeof bucket.limitName==='string'&&bucket.limitName?bucket.limitName:id==='codex'?'Codex':id)+' · '+duration;
      const resetsAt=typeof w.resetsAt==='number'&&Number.isFinite(w.resetsAt)&&w.resetsAt>0?new Date(w.resetsAt*1000).toISOString():undefined;
      windows.push({label,usedPercent:used,windowMinutes:minutes,...(resetsAt?{resetsAt}:{})});
    }
  }
  if(!windows.length)return {ok:false,provider:CODEX_PROVIDER,reason:'unsupported',message:'当前账号未返回可用的套餐额度窗口；未知不表示剩余为零。'};
  return {ok:true,provider:CODEX_PROVIDER,shape:'quota',data:{windows,plan,updatedAt:new Date().toISOString()}};
}
type Pending={resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};
class Rpc {
  child:ChildProcessWithoutNullStreams;
  lines:Interface;
  nextId=0;
  pending=new Map<number,Pending>();
  listeners=new Set<(method:string,params:Obj)=>void>();
  closed=false;
  constructor(){
    const home=process.env.CODEX_HOME||join(homedir(),'.codex');
    const bundled=join(home,'plugins','.plugin-appserver',process.platform==='win32'?'codex.exe':'codex');
    const command=process.env.PET_CODEX_COMMAND||(existsSync(bundled)?bundled:'codex');
    const flags=['shell_tool','plugins','apps','code_mode','code_mode_host','multi_agent','browser_use','in_app_browser','skill_search','tool_suggest','sleep_tool'];
    const env={...process.env};delete env.OPENAI_API_KEY;delete env.OPENAI_BASE_URL;
    this.child=spawn(command,['app-server','--stdio',...flags.flatMap(f=>['-c','features.'+f+'=false']),'-c','web_search="disabled"','-c','forced_login_method="chatgpt"'],{windowsHide:true,env,stdio:['pipe','pipe','pipe']});
    this.lines=createInterface({input:this.child.stdout});this.child.stderr.resume();
    this.lines.on('line',line=>{
      let message:Obj;try{message=JSON.parse(line) as Obj;}catch{return;}
      if(typeof message.id==='number'&&this.pending.has(message.id)){
        const pending=this.pending.get(message.id)!;this.pending.delete(message.id);clearTimeout(pending.timer);
        if(message.error)pending.reject(Error('Codex: '+String(obj(message.error).message||'请求失败').slice(0,300)));else pending.resolve(message.result);
      }else if(typeof message.method==='string'){
        if(message.id!==undefined)this.child.stdin.write(JSON.stringify({id:message.id,error:{code:-32601,message:'Desktop pet does not provide tools or permissions'}})+'\n');
        for(const listener of this.listeners)listener(message.method,obj(message.params));
      }
    });
    this.child.on('error',()=>this.fail(Error('无法启动 Codex；请先安装并登录 Codex，或设置 PET_CODEX_COMMAND。')));
    this.child.on('exit',()=>this.fail(Error('Codex 宿主连接已关闭')));
    this.child.stdin.on('error',()=>this.fail(Error('Codex 宿主连接已中断')));
  }
  fail(error:Error):void {if(this.closed)return;this.closed=true;for(const listener of [...this.listeners])listener('transport/error',{message:error.message});for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  request<T=unknown>(method:string,params:unknown={},timeout=15000):Promise<T>{
    if(this.closed||this.child.exitCode!==null)return Promise.reject(Error('Codex 宿主未连接'));
    return new Promise((resolve,reject)=>{
      const id=++this.nextId,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex 请求超时：'+method));},timeout);
      this.pending.set(id,{resolve:value=>resolve(value as T),reject,timer});
      this.child.stdin.write(JSON.stringify({id,method,params})+'\n');
    });
  }
  async initialize():Promise<void>{
    await this.request('initialize',{clientInfo:{name:'pet_trio_jonsbo',title:'桌宠宿主连接',version:'1.1.1'},capabilities:{experimentalApi:true}});
    this.child.stdin.write('{"method":"initialized"}\n');
    const account=await this.request<{account?:{type?:string}}>('account/read',{refreshToken:false});
    if(!['chatgpt','chatgptAuthTokens'].includes(account.account?.type||''))throw Error('请先在 Codex 中登录 ChatGPT 账号；桌宠不会自动切换到按量付费 API Key。');
  }
  close():void {this.fail(Error('请求已结束'));this.lines.close();this.child.stdin.end();this.child.kill();}
}
export class CodexPetHost implements PetHost {
  provider=CODEX_PROVIDER;
  private live=new Set<Rpc>();
  private quota?:{at:number;value:BalanceResult};
  private quotaPending?:Promise<BalanceResult>;
  private tail:Promise<void>=Promise.resolve();
  private disposed=false;
  async balance(force=false):Promise<BalanceResult>{
    if(!force&&this.quota&&Date.now()-this.quota.at<300000)return this.quota.value;
    if(this.quotaPending)return this.quotaPending;
    this.quotaPending=this.readBalance().finally(()=>{this.quotaPending=undefined;});return this.quotaPending;
  }
  private async readBalance():Promise<BalanceResult>{
    let rpc:Rpc|undefined;
    try{rpc=this.open();await rpc.initialize();const value=parseCodexQuota(await rpc.request('account/rateLimits/read'));this.quota={at:Date.now(),value};return value;}
    catch(error){return {ok:false,provider:this.provider,reason:'fetch-error',message:error instanceof Error?error.message:String(error)};}
    finally{if(rpc)this.close(rpc);}
  }
  private open():Rpc {if(this.disposed)throw Error('桌宠宿主连接已关闭');const rpc=new Rpc();this.live.add(rpc);return rpc;}
  private close(rpc:Rpc):void {this.live.delete(rpc);rpc.close();}
  async *stream(raw:unknown):AsyncIterable<{type:'text';text:string}>{
    const options=obj(raw),signal=options.signal as AbortSignal|undefined;
    let release!:()=>void;const previous=this.tail;this.tail=new Promise<void>(r=>{release=r;});
    let rpc:Rpc|undefined;
    try{
      await previous;signal?.throwIfAborted();rpc=this.open();await rpc.initialize();signal?.throwIfAborted();
      const config=await rpc.request<{config:Obj}>('config/read',{includeLayers:false});
      const overrides:Obj={};
      for(const key of Object.keys(obj(config.config.mcp_servers)))overrides['mcp_servers.'+key+'.enabled']=false;
      const system=typeof options.system==='string'?options.system:'';
      const thread=await rpc.request<{thread:{id:string}}>('thread/start',{ephemeral:true,environments:[],dynamicTools:[],modelProvider:'openai',sandbox:'read-only',approvalPolicy:'never',config:overrides,baseInstructions:system,developerInstructions:'你只负责桌宠闲聊，回复简短自然。仅使用传入的桌宠对话记录；不访问文件、工具、网页或其他会话，不执行任务。'});
      const threadId=thread.thread.id;
      const messages=(Array.isArray(options.messages)?options.messages:[]).map(value=>{const m=obj(value);const text=(Array.isArray(m.content)?m.content:[]).map(c=>String(obj(c).text||'')).join('');return (m.role==='assistant'?'桌宠：':'用户：')+text;}).join('\n');
      const text=await new Promise<string>((resolve,reject)=>{
        let settled=false;
        const done=(error?:Error,value=''):void=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);rpc?.listeners.delete(listener);error?reject(error):resolve(value);};
        const abort=():void=>{done(Error('生成已取消'));if(rpc)this.close(rpc);};
        const timer=setTimeout(()=>abort(),85000);
        const texts:string[]=[];
        const listener=(method:string,p:Obj):void=>{
          if(method==='transport/error'){done(Error(String(p.message)));return;}
          if(p.threadId!==threadId)return;
          if(method==='item/completed'){
            const item=obj(p.item);if(item.type==='agentMessage'&&typeof item.text==='string')texts.push(item.text);
            else if(['commandExecution','fileChange','mcpToolCall','webSearch'].includes(String(item.type)))done(Error('桌宠模型请求了不支持的工具操作'));
          }
          if(method==='turn/completed'){
            const turn=obj(p.turn);if(turn.status==='completed')done(undefined,texts.join('\n').trim());else done(Error('Codex 生成未完成：'+String(turn.status)));
          }
          if(method==='error')done(Error('Codex 生成失败'));
        };
        rpc!.listeners.add(listener);signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted){abort();return;}
        void rpc!.request('turn/start',{threadId,input:[{type:'text',text:messages}],...(typeof options.model==='string'&&options.model!=='host-default'?{model:options.model}:{})}).catch(error=>done(error instanceof Error?error:Error(String(error))));
      });
      if(!text)throw Error('宿主未返回桌宠回复');yield {type:'text',text};
    }finally{if(rpc)this.close(rpc);release();}
  }
  dispose():void {this.disposed=true;for(const rpc of this.live)rpc.close();this.live.clear();}
}
