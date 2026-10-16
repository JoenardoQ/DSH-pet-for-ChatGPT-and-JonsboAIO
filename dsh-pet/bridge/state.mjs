export const statePoses = Object.freeze({
  idle: null,
  thinking: 'thinking',
  working: 'working',
  success: 'success',
  error: 'error',
  sleeping: null,
});
export function validateEvent(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected object');
  if (Object.keys(v).some((k) => !['source', 'action', 'state', 'message', 'desktop', 'screen', 'sessionId'].includes(k)))
    throw new Error('Unknown field');
  if(v.sessionId !== undefined && !/^[a-f0-9-]{32,36}$/.test(v.sessionId))throw Error('Invalid session');
  if (v.source !== 'chatgpt') throw new Error('请更新或重新打开状态页；桌宠控制必须明确指定 ChatGPT 来源。');
  if (!['wake', 'update', 'hide'].includes(v.action)) throw new Error('Invalid action');
  if (v.state !== undefined && !Object.hasOwn(statePoses, v.state)) throw new Error('Invalid state');
  if (v.message !== undefined && (typeof v.message !== 'string' || v.message.length > 100))
    throw new Error('Invalid message');
  for (const k of ['desktop', 'screen'])
    if (v[k] !== undefined && typeof v[k] !== 'boolean') throw new Error('Invalid ' + k);
  return v;
}
export class Sources {
  constructor(now = Date.now) {
    this.now = now;
    this.frames = new Map();
    this.presence = new Map();
    this.preferred = null;
  }
  touch(source, info) {
    if (!['chatgpt', 'dsh'].includes(source)) throw new Error('Invalid presence source');
    this.presence.set(source, { ...info, source, at: this.now() });
  }
  connected() {
    this.current();
    const result = new Map([...this.frames].map(([key, frame]) => [key, { desktop: true, ...frame }]));
    for (const [key, info] of this.presence) {
      if (this.now() - info.at > 6000) this.presence.delete(key);
      else {const frame=result.get(key);result.set(key,{...frame,...info,character:frame?.at>info.at?frame.character:info.character});}
    }
    return result;
  }
  put(source, frame) {
    if (!['chatgpt', 'dsh'].includes(source)) throw new Error('Invalid frame source');
    this.current();
    if (!this.frames.size) this.preferred = source;
    this.frames.set(source, { ...frame, at: this.now(), source });
  }
  current(excluded = []) {
    for (const [key, frame] of this.frames) if (this.now() - frame.at > 3000) this.frames.delete(key);
    const available = [...this.frames.values()].filter((f) => !excluded.includes(f.source));
    const chosen = available.find((f) => f.source === this.preferred) || available.sort((a, b) => a.at - b.at)[0];
    if (!excluded.length && chosen && !this.frames.has(this.preferred)) this.preferred = chosen.source;
    return chosen;
  }
}

// Each MCP connection owns its controls; idle connections cannot mask active work.
export class Controls {
  constructor(now=Date.now){this.now=now;this.sessions=new Map();this.revision=0;}
  heartbeat(id){const s=this.sessions.get(id);if(s)s.expiresAt=this.now()+10000;}
  release(id){if(this.sessions.delete(id))this.revision++;}
  clearSessions(){for(const [id,s] of this.sessions)if(s.sessionId)this.release(id);}
  apply(event){
    validateEvent(event);const key=event.sessionId || 'manual';const old=this.sessions.get(key);
    if(event.action==='hide'){this.release(key);return this.snapshot();}
    if(event.action==='update' && !old)throw Error('Call wake_pet first');
    const {action,source,...value}=event;
    this.sessions.set(key,{desktop:true,screen:true,state:'idle',message:'',...old,...value,updatedAt:this.now(),expiresAt:event.sessionId?this.now()+10000:Infinity});
    this.revision++;return this.snapshot();
  }
  snapshot(){
    const now=this.now();for(const [id,s] of this.sessions)if(s.expiresAt<=now)this.release(id);
    const all=[...this.sessions.values()].map(s=>now-s.updatedAt>90000 && ['working','thinking','error','success'].includes(s.state)?{...s,state:'idle',message:''}:s);
    const active=s=>['working','thinking','error'].includes(s.state)?1:0;
    all.sort((a,b)=>active(b)-active(a)||b.updatedAt-a.updatedAt);
    const chosen=all[0];
    return {visible:!!chosen,desktop:chosen?all.some(s=>s.desktop):true,screen:chosen?all.some(s=>s.screen):true,state:chosen?.state || 'idle',message:chosen?.message || '',sessionId:chosen?.sessionId,updatedAt:chosen?.updatedAt || now,revision:this.revision,connections:all.map(s=>({sessionId:s.sessionId || 'manual',state:s.state,desktop:s.desktop,screen:s.screen}))};
  }
}
