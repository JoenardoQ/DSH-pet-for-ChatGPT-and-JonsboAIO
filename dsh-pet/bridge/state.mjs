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
  if (Object.keys(v).some((k) => !['source', 'action', 'state', 'message', 'desktop', 'screen'].includes(k)))
    throw new Error('Unknown field');
  if (v.source !== undefined && v.source !== 'chatgpt') throw new Error('Invalid source');
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
    this.preferred = 'chatgpt';
  }
  put(source, frame) {
    if (!['chatgpt', 'dsh'].includes(source)) throw new Error('Invalid frame source');
    this.frames.set(source, { ...frame, at: this.now(), source });
  }
  current(excluded = []) {
    for (const [key, frame] of this.frames) if (this.now() - frame.at > 3000) this.frames.delete(key);
    const available = [...this.frames.values()].filter((f) => !excluded.includes(f.source));
    return available.find((f) => f.source === this.preferred) || available.sort((a, b) => b.at - a.at)[0];
  }
}
