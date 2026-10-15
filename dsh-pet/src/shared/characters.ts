import type { MenuNode, MenuLeaf } from './menu';
export type CharacterId = 'fish' | 'whale' | 'chatgpt';
export const CHARACTERS: ReadonlyArray<{ id: CharacterId; label: string }> = [
  { id: 'whale', label: '鲸鱼娘' },
  { id: 'fish', label: '大肥鱼' },
  { id: 'chatgpt', label: 'ChatGPT 娘' },
];
export function readCharacter(storage: Pick<Storage, 'getItem'>, petId: string): CharacterId {
  try {
    const id = storage.getItem('dsh-pet:character:' + petId);
    return CHARACTERS.some((c) => c.id === id) ? (id as CharacterId) : 'fish';
  } catch {
    return 'fish';
  }
}
export function characterState(name: string): string {
  if (/叹气|皱眉|生气|败|袋空|分文|失败|error|failure/i.test(name)) return 'error';
  if (/小憩|沉眠|睡|瞌睡|sleep/i.test(name)) return 'sleeping';
  if (/思考|张望|think/i.test(name)) return 'thinking';
  if (/写代码|忙碌|归档|记录|点按|敲击|work|tool/i.test(name)) return 'working';
  if (/庆祝|开心|雀跃|成功|success/i.test(name)) return 'success';
  if (/挥手|回应|互动|拖拽|wave/i.test(name)) return 'wave';
  return 'idle';
}
export function characterAnimation(character: CharacterId, name: string): string {
  return character === 'fish' ? name : '__skin-' + character + '-' + characterState(name);
}
export function characterMenu(selected: CharacterId): MenuNode {
  return {
    label: '切换桌宠',
    children: CHARACTERS.map((c) => ({
      label: (c.id === selected ? '✓ ' : '') + c.label,
      action: ('skin-' + c.id) as MenuLeaf['action'],
    })),
  };
}
export function characterAction(action: unknown): CharacterId | undefined {
  return CHARACTERS.find((c) => action === 'skin-' + c.id)?.id;
}

export function characterLabel(id: CharacterId): string {
  return CHARACTERS.find((c) => c.id === id)?.label || '大肥鱼';
}
