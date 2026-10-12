// Git marketplace installs do not run npm lifecycle scripts.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { root } from './runtime.mjs';
const require = createRequire(import.meta.url);
let pending;
function available() {
  try {
    require.resolve('@electron/get');
    require.resolve('@electron-internal/extract-zip');
    return true;
  } catch { return false; }
}
export async function ensureDependencies() {
  if (available()) return;
  pending ||= new Promise((resolve, reject) => {
    console.error('[dsh-pet] Installing runtime dependencies for this Git checkout...');
    const args = ['install', '--omit=dev', '--omit=peer', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund'];
    const win = process.platform === 'win32';
    const child = spawn(win ? 'cmd.exe' : 'npm', win ? ['/d', '/c', 'npm', ...args] : args, {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(process.stderr, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    child.once('error', reject);
    child.once('exit', code => code === 0 && available() ? resolve() : reject(new Error('Dependency install failed. Check Node/npm and network, then retry wake_pet.')));
  }).finally(() => { pending = undefined; });
  await pending;
}
