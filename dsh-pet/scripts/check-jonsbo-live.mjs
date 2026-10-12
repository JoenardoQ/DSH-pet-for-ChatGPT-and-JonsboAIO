import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { base, root } from '../bridge/runtime.mjs';
import { postEvent, status } from '../bridge/client.mjs';
const out = path.resolve(root, '../qa');
mkdirSync(out, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
await postEvent({ action: 'wake', source: 'chatgpt' });
let initial;
for (let i = 0; i < 40; i++) {
  initial = await status();
  if (initial.frameAt) break;
  await pause(250);
}
assert.ok(initial.frameAt, 'No live animation frame received');
const a = Buffer.from(await (await fetch(base + '/frame.png')).arrayBuffer());
await pause(800);
const b = Buffer.from(await (await fetch(base + '/frame.png')).arrayBuffer());
assert.notEqual(
  createHash('sha256').update(a).digest('hex'),
  createHash('sha256').update(b).digest('hex'),
  'Animation must advance',
);
writeFileSync(path.join(out, 'idle.png'), b);
await postEvent({ action: 'update', source: 'chatgpt', state: 'working', message: '陪你一起工作' });
const config = await (await fetch(`http://127.0.0.1:${new URL(base).port * 1 + 1}/dsh-pet-7340/config`)).json();
const pool = [config.main.animations.events.workStatus[1]].flat();
let working;
// User interaction and upstream one-shot actions may finish before resuming work.
for(let i=0;i<40;i++){await pause(250);working=await status();if(pool.includes(working.animation))break;}
assert.ok(pool.includes(working.animation), 'Expected an upstream working animation; got ' + working.animation);
writeFileSync(path.join(out, 'working.png'), Buffer.from(await (await fetch(base + '/frame.png')).arrayBuffer()));
await postEvent({ action: 'update', source: 'chatgpt', state: 'idle', message: '' });
const final = await status();
writeFileSync(
  path.join(out, 'live-report.json'),
  JSON.stringify({ animationAdvances: true, workingAnimation: working.animation, usb: final.output }, null, 2),
);
console.log(
  JSON.stringify({ animationAdvances: true, workingAnimation: working.animation, usb: final.output }, null, 2),
);
