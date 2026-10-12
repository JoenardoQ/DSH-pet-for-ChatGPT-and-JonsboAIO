import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
const localFile = path.join(root, 'bridge/local.json');
const local = existsSync(localFile) ? JSON.parse(readFileSync(localFile, 'utf8')) : {};
const userData = path.join(process.env.LOCALAPPDATA || os.homedir(), 'DshPetJonsbo');
export const dataDir = process.env.PET_DATA_DIR || local.dataDir || path.join(userData, 'jonsbo');
export const port = Number(process.env.PET_PORT || local.port || 19390);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PET_PORT');
export const base = `http://127.0.0.1:${port}`;
export function config() {
  const file = path.join(dataDir, 'config.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : {};
}
export function nodeCommand() {
  const portable = path.join(root, 'runtime/node/node.exe');
  if (existsSync(portable)) return portable;
  return process.env.PET_NODE || local.node || process.execPath;
}
export function pythonCommand() {
  const bundled = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  return process.env.PET_PYTHON || config().python || local.python || (existsSync(bundled) ? bundled : 'python');
}
export const dshHome = local.dshHome || path.join(userData, 'dsh');
export const electronPath =
  process.env.DSH_PET_ELECTRON_PATH || local.electron || path.join(dshHome, 'electron/electron.exe');
