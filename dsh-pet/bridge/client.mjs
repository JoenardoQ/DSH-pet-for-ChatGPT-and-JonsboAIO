import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { base, root, dataDir, nodeCommand } from './runtime.mjs';
import { validateEvent } from './state.mjs';
import { ensureDependencies } from './dependencies.mjs';
export async function status() {
  const r = await fetch(base + '/state', { signal: AbortSignal.timeout(1500) });
  const value = await r.json();
  if (!r.ok || value.service !== 'dsh-pet-jonsbo' || value.version !== 1)
    throw new Error('Port occupied by another service');
  return value;
}
export async function ensureBridge() {
  try {
    return await status();
  } catch (e) {
    if (!e.cause && e.name !== 'TimeoutError') throw e;
  }
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
    method: 'POST', headers: { 'X-Pet-Client': '1' }, signal: AbortSignal.timeout(5000),
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
