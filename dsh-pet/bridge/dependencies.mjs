// Git marketplace installs do not run npm lifecycle scripts.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { root, dataDir, nodeCommand } from './runtime.mjs';
const require = createRequire(import.meta.url);
let pending;
function available() {
  try {
    require.resolve('@electron/get');
    require.resolve('@electron-internal/extract-zip');
    return true;
  } catch { return false; }
}
function run(command, args, { quiet = false, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    let tail = '';
    const child = spawn(command, args, {
      cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => {
      tail = (tail + bytes.toString()).slice(-1600);
      if (!quiet) process.stderr.write(bytes);
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited ${code}: ${tail.trim()}`)));
  });
}
export async function npmCommand() {
  for (const candidate of [
    path.join(path.dirname(nodeCommand()), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(nodeCommand()), '../lib/node_modules/npm/bin/npm-cli.js'),
  ]) if (existsSync(candidate)) return [nodeCommand(), [candidate]];
  const win = process.platform === 'win32';
  try {
    await run(win ? 'cmd.exe' : 'npm', win ? ['/d', '/c', 'npm', '--version'] : ['--version'], { quiet: true });
    return win ? ['cmd.exe', ['/d', '/c', 'npm']] : ['npm', []];
  } catch {}
  const base = path.join(dataDir, 'bootstrap');
  const target = path.join(base, 'npm-11.6.2');
  const cli = path.join(target, 'package/bin/npm-cli.js');
  if (!existsSync(cli)) {
    console.error('[dsh-pet] npm not found; downloading verified npm 11.6.2...');
    const response = await fetch('https://registry.npmjs.org/npm/-/npm-11.6.2.tgz', { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error('npm bootstrap download failed: HTTP ' + response.status);
    const archive = Buffer.from(await response.arrayBuffer());
    const expected = '7iKzNfy8lWYs3zq4oFPa8EXZz5xt9gQNKJZau3B1ErLBb6bF7sBJ00x09485DOvRT2l5Gerbl3VlZNT57MxJVA==';
    if (createHash('sha512').update(archive).digest('base64') !== expected)
      throw new Error('npm bootstrap integrity check failed');
    mkdirSync(base, { recursive: true });
    const staging = mkdtempSync(path.join(base, 'npm-stage-'));
    try {
      const file = path.join(staging, 'npm.tgz');
      writeFileSync(file, archive);
      const tar = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/tar.exe') : 'tar';
      await run(tar, ['-xzf', file, '-C', staging]);
      if (!existsSync(path.join(staging, 'package/bin/npm-cli.js'))) throw new Error('Invalid npm archive');
      try { renameSync(staging, target); }
      catch (error) { if (!existsSync(cli)) throw error; }
    } finally {
      // Only this uniquely created directory under our bootstrap directory is removable.
      if (path.dirname(staging) === base && existsSync(staging)) rmSync(staging, { recursive: true });
    }
  }
  return [nodeCommand(), [cli]];
}
export async function ensureDependencies() {
  if (available()) return;
  pending ||= (async () => {
    const bundled = path.join(root, 'runtime/dependencies.zip');
    if (process.platform === 'win32' && existsSync(bundled)) {
      const { readFileSync } = await import('node:fs');
      const meta = JSON.parse(readFileSync(path.join(root, 'runtime/windows-bundle.json'), 'utf8'));
      if (createHash('sha256').update(readFileSync(bundled)).digest('hex') !== meta.dependencies.sha256)
        throw new Error('Bundled runtime dependency integrity check failed');
      await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/tar.exe'), ['-xf', bundled, '-C', root]);
      if (!available()) throw new Error('Bundled runtime dependencies failed to extract');
      return;
    }
    const [command, prefix] = await npmCommand();
    console.error('[dsh-pet] Installing runtime dependencies for this Git checkout...');
    await run(command, [...prefix, 'install', '--omit=dev', '--omit=peer', '--ignore-scripts', '--package-lock=false', '--no-audit', '--no-fund']);
    if (!available()) throw new Error('Runtime dependencies remain unavailable after npm install');
  })().catch(error => {
    throw new Error('桌宠运行依赖安装失败：' + error.message + '\n请检查网络后重试“打开桌宠”。');
  }).finally(() => { pending = undefined; });
  await pending;
}
