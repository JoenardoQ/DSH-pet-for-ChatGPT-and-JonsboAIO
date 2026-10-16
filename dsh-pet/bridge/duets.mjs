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
      reason: eligible ? null : !dsh ? '尚未收到 DSH 桌宠画面，请在 DSH 的桌宠菜单中检查屏幕同步。' : !gpt ? '尚未收到 GPT 桌宠画面，请在 ChatGPT / Codex 中开启桌宠。' : dsh.character !== 'fish' ? '请将 DSH 桌宠切换为大肥鱼。' : gpt.character !== 'chatgpt' ? '请将 GPT 桌宠切换为 ChatGPT 娘。' : '请在 GPT 宿主中开启桌面显示。' };
  }
}
