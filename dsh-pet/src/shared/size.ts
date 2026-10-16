import type { MenuBranch } from './menu';
export type SizeAction = 'size-up' | 'size-down' | 'size-reset';
export function isSizeAction(value: unknown): value is SizeAction {
  return value === 'size-up' || value === 'size-down' || value === 'size-reset';
}
export function nextSizePercent(current: number, action: SizeAction): number {
  if (!isSizeAction(action)) throw Error('无效缩放操作');
  return action === 'size-reset' ? 100 : Math.max(50, Math.min(200, Math.round(current) + (action === 'size-up' ? 10 : -10)));
}
export function sizeMenu(percent = 100): MenuBranch {
  return { label: '桌宠大小 · ' + percent + '%', children: [
    { label: '放大 +10%', action: 'size-up' }, { label: '缩小 −10%', action: 'size-down' },
    { label: '恢复默认 100%', action: 'size-reset' },
  ] };
}
export async function resizePet(base: string, petId: string, action: SizeAction): Promise<void> {
  const response = await fetch(base + '/size', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ petId, action }) });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw Error(result.error || '调整桌宠大小失败');
}
