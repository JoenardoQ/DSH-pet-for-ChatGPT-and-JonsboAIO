import type { MenuNode, MenuLeaf } from './menu';
import scenes from '../../assets/pets/duo/actions.json' with { type: 'json' };
export const DUET_ACTIONS = scenes.map(({ id, label }) => [id, label] as const);
export function duetMenu(): MenuNode {
  return {
    label: '双人互动',
    children: [
      { label: '自动轮换（双方在线时）', action: 'duet-auto' as MenuLeaf['action'] },
      { label: '关闭双人互动', action: 'duet-off' as MenuLeaf['action'] },
      ...DUET_ACTIONS.map(([id, label]) => ({ label, action: ('duet-' + id) as MenuLeaf['action'] })),
    ],
  };
}
