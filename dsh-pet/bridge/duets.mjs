// One arbiter per bridge. Presence comes from live frames + a live GPT control
// lease, never from installed plugin folders or the number of MCP sessions.
import scenes from '../assets/pets/duo/actions.json' with { type: 'json' };
export const ACTIONS = scenes.map(scene => scene.id);
export class Duets {
  constructor({ now = Date.now, mode = 'auto', persist = () => {} } = {}) {
    this.now = now; this.mode = mode === 'off' || mode === 'auto' || ACTIONS.includes(mode) ? mode : 'auto';
    this.persist = persist; this.startedAt = null;
  }
  set(mode) {
    if (!['auto','off',...ACTIONS].includes(mode)) throw Error('Invalid duet action');
    this.persist(mode); this.mode = mode; this.startedAt = null;
  }
  snapshot(sources, control) {
    sources.current();
    const dsh = sources.frames.get('dsh'), gpt = sources.frames.get('chatgpt');
    const eligible = !!(dsh && gpt && control.visible && control.desktop && dsh.character === 'fish' && gpt.character === 'chatgpt');
    const active = eligible && this.mode !== 'off';
    if (!active) this.startedAt = null;
    else if (this.startedAt === null) this.startedAt = this.now();
    const action = this.mode === 'auto' ? ACTIONS[Math.floor((this.now() - (this.startedAt ?? this.now())) / 16000) % ACTIONS.length] : this.mode;
    return { active, eligible, mode: this.mode, action: active ? action : null, owner: 'chatgpt', startedAt: this.startedAt,
      reason: eligible ? null : '请同时开启 DSH 的大肥鱼和 GPT 的 ChatGPT 娘桌宠' };
  }
}
