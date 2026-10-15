import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
test('ZIP, GitHub and Release sources use valid host commands without installation, downloads or pet windows',{skip:process.platform!=='win32',timeout:20000},()=>{
 const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test/installer-check.ps1'),'-Root',root],{encoding:'utf8',windowsHide:true,timeout:18000});assert.equal(r.status,0,r.stdout+'\n'+r.stderr);assert.match(r.stdout,/INSTALL_CHECKS=\d+/);
});
test('published package declares independent host and plugin identities with portable entry points',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),market=JSON.parse(fs.readFileSync(path.join(root,'.agents/plugins/marketplace.json'))),plugin=JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json')));
 assert.equal(market.plugins.length,1);assert.equal(market.plugins[0].name,plugin.name);assert.equal(market.plugins[0].source.path,'./');assert.equal(plugin.requires_local_executor,true);assert.ok(fs.existsSync(path.join(root,pkg.main)));assert.ok(fs.existsSync(path.join(root,pkg.dsh.bundle.patch)));for(const name of ['scripts/install-plugins.ps1','install-plugins.cmd','docs/installation.md'])assert.ok(pkg.files.includes(name));
});
