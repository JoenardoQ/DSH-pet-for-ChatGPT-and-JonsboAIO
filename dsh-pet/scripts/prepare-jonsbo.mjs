// Like project 1: generate local MCP manifests with concrete runtime paths.
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { root, nodeCommand, pythonCommand } from '../bridge/runtime.mjs';
const destination = path.resolve(process.argv[2] || path.resolve(root, '..'));
const pkg = path.join(destination, 'dsh-pet');
const runtime = path.join(destination, 'runtime-data');
const local = {
  dataDir: path.join(runtime, 'jonsbo'),
  dshHome: runtime,
  electron: path.join(runtime, 'electron/electron.exe'),
  node: nodeCommand(),
  python: pythonCommand(),
  port: 19390,
};
writeFileSync(path.join(root, 'bridge/local.json'), JSON.stringify(local, null, 2) + '\n');
const manifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: 'dsh-pet-jonsbo',
  version: '0.1.0',
  description: '唤起原版大肥鱼桌宠，并把实时动画同步到本机乔斯伯 USB 屏幕。',
  extensions: {
    'com.openai': {
      interface: {
        displayName: '大肥鱼 · JONSBO',
        shortDescription: 'ChatGPT / DSH 桌宠与乔斯伯屏幕',
        category: 'Productivity',
        brandColor: '#69DACA',
        defaultPrompt: ['唤起大肥鱼，并显示到乔斯伯屏幕'],
      },
    },
  },
};
const mcp = {
  mcpServers: {
    'dsh-pet-jonsbo': {
      type: 'stdio',
      command: local.node,
      args: [path.join(pkg, 'bridge/mcp.mjs')],
      env: { PET_DATA_DIR: local.dataDir, PET_PYTHON: local.python, PET_PORT: String(local.port) },
    },
  },
};
for (const [file, value] of [
  ['plugin.json', manifest],
  ['mcp.json', { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', ...mcp }],
  ['.mcp.json', mcp],
])
  writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
mkdirSync(path.join(root, '.codex-plugin'), { recursive: true });
writeFileSync(
  path.join(root, '.codex-plugin/plugin.json'),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      mcpServers: './.mcp.json',
      interface: manifest.extensions['com.openai'].interface,
    },
    null,
    2,
  ) + '\n',
);
const marketplace = path.resolve(root, '../.agents/plugins');
mkdirSync(marketplace, { recursive: true });
writeFileSync(
  path.join(marketplace, 'marketplace.json'),
  JSON.stringify(
    {
      name: 'dsh-pet-jonsbo-local',
      interface: { displayName: '大肥鱼与乔斯伯' },
      plugins: [
        {
          name: manifest.name,
          source: { source: 'local', path: './dsh-pet' },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    null,
    2,
  ) + '\n',
);
const actualData = path.resolve(root, '../runtime-data/jonsbo');
mkdirSync(actualData, { recursive: true });
if (!existsSync(path.join(actualData, 'config.json')))
  copyFileSync(path.join(root, 'config.jonsbo.example.json'), path.join(actualData, 'config.json'));
console.log(JSON.stringify({ plugin: pkg, marketplace: destination, ...local }, null, 2));
