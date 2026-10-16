// One arbiter per bridge. Presence comes from independent heartbeats and a live GPT control
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
    const online = sources.connected();
    const dsh = online.get('dsh'), gpt = online.get('chatgpt');
    const eligible = !!(dsh && gpt && control.visible && control.desktop && dsh.desktop !== false && gpt.desktop !== false && dsh.character === 'fish' && gpt.character === 'chatgpt');
    const active = eligible && this.mode !== 'off';
    if (!active) this.startedAt = null;
    else if (this.startedAt === null) this.startedAt = this.now();
    const action = this.mode === 'auto' ? ACTIONS[Math.floor((this.now() - (this.startedAt ?? this.now())) / 9000) % ACTIONS.length] : this.mode;
    return { participants: {dsh: dsh ? {character:dsh.character,build:dsh.build||null,desktop:dsh.desktop!==false,error:dsh.error||null}:null,chatgpt:gpt?{character:gpt.character,build:gpt.build||null,desktop:gpt.desktop!==false,error:gpt.error||null}:null}, active, eligible, mode: this.mode, action: active ? action : null, owner: 'chatgpt', startedAt: this.startedAt,
      reason: eligible ? null : !dsh ? 'DSH 桌宠尚未连接。请在 DSH 插件列表安装同版插件，并开启桌面显示。' : !gpt ? 'GPT 桌宠尚未连接，请在 ChatGPT / Codex 中开启桌宠。' : dsh.character !== 'fish' ? '请将 DSH 桌宠切换为大肥鱼。' : gpt.character !== 'chatgpt' ? '请将 GPT 桌宠切换为 ChatGPT 娘。' : dsh.desktop === false ? '请在 DSH 中开启桌面显示。' : '请在 GPT 宿主中开启桌面显示。' };
  }
}
