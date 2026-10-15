// Shared by the bridge and Electron: a moved checkout never revives
// obsolete bridge/local.json paths. Explicit paths fall back if unavailable.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
function resolveDataDir(
  override = process.env.PET_DATA_DIR,
  {
    mkdir = fs.mkdirSync,
    appData = process.env.LOCALAPPDATA || os.homedir(),
    temp = os.tmpdir(),
    warn = (message) => console.error(message),
  } = {},
) {
  const preferred = path.join(appData, 'DshPetJonsbo', 'jonsbo');
  const candidates = [...new Set([override, preferred, path.join(temp, 'DshPetJonsbo', 'jonsbo')].filter(Boolean))];
  let last;
  for (const candidate of candidates) {
    try {
      mkdir(candidate, { recursive: true });
      if (last) warn('[JONSBO] 数据目录不可用，改用 ' + candidate);
      return candidate;
    } catch (error) {
      last = error;
    }
  }
  throw new Error('无法创建桌宠数据目录：' + last.message);
}
module.exports = { resolveDataDir };
