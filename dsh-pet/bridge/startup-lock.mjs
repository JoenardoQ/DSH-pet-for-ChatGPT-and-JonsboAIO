import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Shared across installations, not tied to a checkout's data directory.
export async function withStartupLock(port, action) {
  const dir = path.join(os.tmpdir(), 'dsh-pet-jonsbo-locks');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, String(port) + '.json');
  const token = randomUUID();
  const end = Date.now() + 120000;
  while (true) {
    try {
      const fd = openSync(file, 'wx');
      try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); }
      finally { closeSync(fd); }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(readFileSync(file, 'utf8'));
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid lock owner');
        try { process.kill(owner.pid, 0); }
        catch (e) { if (e.code === 'ESRCH') unlinkSync(file); }
      } catch {
        // A newly created file may not have its JSON yet. Leave live writers alone.
        try { if (Date.now() - statSync(file).mtimeMs > 120000) unlinkSync(file); } catch {}
      }
      if (Date.now() >= end) throw new Error('桌宠启动仍在进行，请稍后重试。');
      await sleep(100);
    }
  }
  try { return await action(); }
  finally {
    try { if (JSON.parse(readFileSync(file, 'utf8')).token === token) unlinkSync(file); } catch {}
  }
}
