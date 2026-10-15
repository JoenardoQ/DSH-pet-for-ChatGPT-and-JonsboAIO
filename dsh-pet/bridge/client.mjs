import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { base, root, dataDir, nodeCommand, port } from './runtime.mjs';
import { validateEvent } from './state.mjs';
import { ensureDependencies } from './dependencies.mjs';
import { withStartupLock } from './startup-lock.mjs';
import {prepareWindows} from './bootstrap.mjs';
const protocol = 2;
async function inspect() {
  const r = await fetch(base + '/state', { headers: { Connection: 'close' }, signal: AbortSignal.timeout(1500) });
  const value = await r.json();
  if (!r.ok || value.service !== 'dsh-pet-jonsbo')
    throw new Error('端口被其他服务占用；未对该服务进行操作。');
  return value;
}
export async function status() {
  const value = await inspect();
  if (value.version !== protocol) throw new Error('桌宠桥接版本不兼容，请重新启用新版插件。');
  return value;
}
let starting;
export async function ensureBridge() {
  try {
    let current=await status();
    for(let i=0;current.shuttingDown && i<80;i++){await new Promise(resolve=>setTimeout(resolve,100));current=await status();}
    if(current.shuttingDown)throw Error('桌宠尚未完成退出，请稍后重试。');
    return current;
  }
  catch { /* Recheck under the cross-installation lock before changing anything. */ }
  starting ||= withStartupLock(port, startBridge).finally(() => { starting = undefined; });
  return starting;
}
async function startBridge() {
  let existing;
  try { existing = await inspect(); }
  catch (error) { if (error.cause?.code !== 'ECONNREFUSED') throw error; }
  if(existing?.shuttingDown)throw Error('桌宠尚未完成退出，请稍后重试。');
  if (existing?.version === protocol) return existing;
  if (existing) {
    // Only our known old protocol may be retired. Never shut down an unknown service/version.
    if (existing.version !== 1) throw new Error('桌宠桥接版本不兼容，请更新插件。');
    const stopped = await fetch(base + '/shutdown', {
      method: 'POST', headers: { 'X-Pet-Client': '1', Connection: 'close' }, signal: AbortSignal.timeout(6000),
    });
    if (!stopped.ok) throw new Error('旧版桌宠服务未能退出，请关闭旧版后重试。');
    let gone = false;
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      try { await inspect(); }
      catch (error) {
        if (error.cause?.code === 'ECONNREFUSED') { gone = true; break; }
        throw error;
      }
    }
    if (!gone) throw new Error('旧版桌宠服务仍在退出，请稍后重试。');
  }
  if(process.env.PET_SKIP_RUNTIME_SETUP!=='1')await prepareWindows();
  await ensureDependencies();
  mkdirSync(dataDir, { recursive: true });
  const log = openSync(path.join(dataDir, 'bridge.log'), 'a');
  const child = spawn(nodeCommand(), [path.join(root, 'bridge/server.mjs')], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  closeSync(log);
  let error;
  child.on('error', (e) => {
    error = e;
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (error) throw error;
    try {
      return await status();
    } catch {}
  }
  throw new Error('Bridge did not start; see ' + path.join(dataDir, 'bridge.log'));
}
export async function postEvent(event, { autostart = true } = {}) {
  validateEvent(event);
  if (autostart) await ensureBridge();
  const r = await fetch(base + '/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Pet-Client': '1' },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10000),
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error || 'Event failed');
  return value;
}

export async function shutdownBridge() {
  try { await status(); }
  catch (error) {
    if (error.cause) return { stopped: true, alreadyStopped: true };
    throw error;
  }
  const response = await fetch(base + '/shutdown', {
    method: 'POST', headers: { 'X-Pet-Client': '1', Connection: 'close' }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Shutdown failed: ' + response.status);
  for (let i = 0; i < 60; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    try { await status(); }
    catch (error) {
      if (error.cause) return { stopped: true };
      throw error;
    }
  }
  return { stopped: false, stopping: true };
}

export async function updateHost(id, release = false) {
  const response = await fetch(base + '/host', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pet-Client': '1' },
    body: JSON.stringify({ id, release }), signal: AbortSignal.timeout(3000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Plugin lifecycle connection failed');
  return result;
}
