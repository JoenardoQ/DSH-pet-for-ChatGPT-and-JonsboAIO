// Thin output adapter. All animation, physics and menus remain upstream dsh-pet.
const { app, ipcMain, BrowserWindow, Notification, shell } = require('electron');
const path = require('node:path');
const { mkdirSync, existsSync, readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const source = process.env.DSH_PET_JONSBO_SOURCE === 'chatgpt' ? 'chatgpt' : 'dsh';
const localFile = path.join(root, 'bridge/local.json');
const local = existsSync(localFile) ? JSON.parse(readFileSync(localFile, 'utf8')) : {};
const dataDir =
  process.env.PET_DATA_DIR ||
  local.dataDir ||
  path.join(process.env.LOCALAPPDATA || require('node:os').homedir(), 'DshPetJonsbo/jonsbo');
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
      if (['missing-sdk', 'missing-driver', 'busy', 'error'].includes(usb) && usb !== lastNotice) {
        lastNotice = usb;
        const notice = new Notification({
          title: '大肥鱼 · 乔斯伯屏幕',
          body: status.output.error || '屏幕需要设置；点击查看连接状态。',
        });
        notice.on('click', () => shell.openExternal(runtime.base + '/'));
        notice.show();
      } else if (usb === 'streaming') lastNotice = '';
    }
    if (source !== 'chatgpt') return { source };
    const control = await (await fetch(runtime.base + '/control', { signal: AbortSignal.timeout(1500) })).json();
    if (control.desktop === false) win.hide();
    else if (!win.isVisible()) win.showInactive();
    return { source, control };
  } catch (e) {
    retryAt = Date.now() + 3000;
    runtime = undefined;
    console.error('[JONSBO]', e.message);
    return { source, error: e.message };
  }
});
