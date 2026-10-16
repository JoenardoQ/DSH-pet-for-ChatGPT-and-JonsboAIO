// Thin output adapter. All animation, physics and menus remain upstream dsh-pet.
const { app, ipcMain, BrowserWindow, Notification, shell } = require('electron');
const path = require('node:path');
const { mkdirSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const source = process.env.DSH_PET_JONSBO_SOURCE === 'chatgpt' ? 'chatgpt' : 'dsh';
const {resolveDataDir}=require('../../bridge/user-paths.cjs');
const dataDir=resolveDataDir();
const profile = path.join(dataDir, 'electron-' + source);
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
let client,
  runtime,
  retryAt = 0;
let checkedAt = 0,
  lastNotice = '';
async function connect() {
  runtime ||= await import(pathToFileURL(path.join(root, 'bridge/runtime.mjs')).href);
  client ||= await import(pathToFileURL(path.join(root, 'bridge/client.mjs')).href);
  await client.ensureBridge();
}
ipcMain.handle('jonsbo:frame', async (event, payload) => {
  if(process.env.DSH_PET_JONSBO_ENABLED==='0')return {source};
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !event.sender.getURL().startsWith('file:')) return { error: 'Invalid sender' };
  if (typeof payload?.png !== 'string' || payload.png.length > 1900000) return { error: 'Invalid frame' };
  try {
    if (Date.now() < retryAt) return { source };
    if (!runtime) await connect();
    const r = await fetch(runtime.base + '/frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pet-Client': '1' },
      body: JSON.stringify({ ...payload, source }),
      signal: AbortSignal.timeout(1800),
    });
    if (!r.ok) throw new Error('Frame HTTP ' + r.status);
    if (Date.now() - checkedAt > 3000) {
      checkedAt = Date.now();
      const status = await client.status();
      const usb = status.output.usb;
      if (['missing-sdk', 'missing-driver', 'busy', 'permission-required', 'error'].includes(usb) && usb !== lastNotice) {
        lastNotice = usb;
        const notice = new Notification({
          title: ({fish:'大肥鱼',whale:'鲸鱼娘',chatgpt:'ChatGPT 娘'}[payload.character]||'桌宠')+' · 乔斯伯屏幕',
          body: status.output.error || '屏幕需要设置；点击查看连接状态。',
        });
        notice.on('click', () => shell.openExternal(runtime.base + '/?source=' + source));
        notice.show();
      } else if (usb === 'streaming') lastNotice = '';
    }
    const { duet } = await r.json();
    let control;
    if (source === 'chatgpt') control = await (await fetch(runtime.base + '/control', { signal: AbortSignal.timeout(1500) })).json();
    if ((source === 'chatgpt' && control?.desktop === false) || (duet?.active && duet.owner !== source)) win.hide();
    else if (!win.isVisible()) win.showInactive();
    return { source, control, duet };
  } catch (e) {
    retryAt = Date.now() + 3000;
    runtime = undefined;
    console.error('[JONSBO]', e.message);
    return { source, error: e.message };
  }
});

function validSender(event) {
  return BrowserWindow.fromWebContents(event.sender) && event.sender.getURL().startsWith('file:');
}
ipcMain.handle('jonsbo:screen', async (event, enabled) => {
  if (!validSender(event) || typeof enabled !== 'boolean') return { error: 'Invalid request' };
  try {
    await connect();
    const response = await fetch(runtime.base + '/device/connection', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pet-Client': '1' },
      body: JSON.stringify({ source, enabled }), signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Screen connection failed');
    if (!enabled) return { message: '已停止当前桌宠投屏；没有其他桌宠输出时，屏幕将在几秒内释放。' };
    await new Promise(resolve => setTimeout(resolve, 2000));
    const { output } = await client.status();
    if (output.usb === 'streaming') return { message: '已连接乔思伯屏幕。' };
    if (output.usb === 'busy') return { message: '屏幕被占用，请从右键“屏幕连接状态”中选择接管。' };
    if (output.error) return { message: '屏幕暂未连接：' + output.error };
    return { message: '正在连接乔思伯屏幕；可从右键菜单查看连接状态。' };
  } catch (error) { return { error: error.message }; }
});
ipcMain.handle('jonsbo:status', async (event) => {
  if (!validSender(event)) return { error: 'Invalid sender' };
  try { await connect(); await shell.openExternal(runtime.base + '/?source=' + source); return { ok: true }; }
  catch (error) { return { error: error.message }; }
});
ipcMain.handle('jonsbo:shutdown', async (event) => {
  if (!validSender(event) || source !== 'chatgpt') return { error: 'Please close the pet in DSH settings.' };
  try {
    client ||= await import(pathToFileURL(path.join(root, 'bridge/client.mjs')).href);
    return await client.shutdownBridge();
  } catch (error) { return { error: error.message }; }
});

ipcMain.handle('jonsbo:duet', async (event, mode) => {
  if (!validSender(event) || typeof mode !== 'string') return { error: 'Invalid request' };
  try {
    await connect();
    const response = await fetch(runtime.base + '/duet', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pet-Client': '1' },
      body: JSON.stringify({ mode }), signal: AbortSignal.timeout(3000),
    });
    return await response.json();
  } catch (error) { return { error: error.message }; }
});
