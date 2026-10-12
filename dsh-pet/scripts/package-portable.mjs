// Self-contained Windows package: no developer drive letters or Python prerequisite.
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { root } from '../bridge/runtime.mjs';
const output = path.resolve(process.argv[2] || path.join(root, '../dist/portable/package'));
if (existsSync(output)) throw new Error('Use a fresh packaging output directory');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
mkdirSync(output, { recursive: true });
for (const name of [...pkg.files, 'package.json', 'LICENSE', 'node_modules']) {
  const source = path.join(root, name);
  if (!existsSync(source)) continue;
  cpSync(source, path.join(output, name), {
    recursive: true,
    filter: (p) => !p.endsWith(path.join('bridge', 'local.json')) && !p.includes('__pycache__'),
  });
}
const mcp = {
  mcpServers: {
    'dsh-pet-jonsbo': { type: 'stdio', command: 'cmd.exe', args: ['/d', '/c', 'scripts\\start-mcp.cmd'], cwd: '.' },
  },
};
writeFileSync(
  path.join(output, 'mcp.json'),
  JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', ...mcp }, null, 2),
);
writeFileSync(path.join(output, '.mcp.json'), JSON.stringify(mcp, null, 2));
pkg.bundledDependencies = ['@electron/get', '@electron-internal/extract-zip'];
writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkg, null, 2));
if (
  !existsSync(path.join(output, 'desktop/bin/dsh-pet-usb.exe')) ||
  !existsSync(path.join(output, 'runtime/node/node.exe'))
)
  throw new Error('Build the Windows worker and include Node before packaging');
console.log(output);
