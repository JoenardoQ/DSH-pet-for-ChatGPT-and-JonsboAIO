// Runtime-only portable package. Building needs Node; running the package does not.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));const profile=JSON.parse(fs.readFileSync(path.join(root,'scripts/windows-launcher.json')));
const reviewFile=path.join(root,'dsh-pet/assets/pets/animation-quality-review.json');
if(fs.existsSync(reviewFile)){
 const review=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 const authorizedPreview=process.argv.includes('--allow-unreviewed-animation') && review.publicationAuthorization?.version===version && review.publicationAuthorization?.channel==='prerelease';
 if(review.releaseBlocked&&!authorizedPreview)throw Error('Animation quality review rejected this version; do not package or publish until replacement playback is approved, or this exact preview release is explicitly authorized.');
 if(review.releaseBlocked)console.warn('Preview release: animation quality remains rejected. See animation-quality-review.json.');
}
const common=['scripts/windows-launcher.ps1','scripts/windows-launcher.json','start-pet.cmd','stop-pet.cmd','package.json','plugin.json','mcp.json','.mcp.json','.codex-plugin','.agents/plugins/marketplace.json','LICENSE','THIRD_PARTY_NOTICES.md','README.md','docs/windows-startup.md','docs/characters.md','docs/installation.md','docs/source-audit.md','docs/dragon-princess-animation-spec.md','docs/character-action-descriptions.md','docs/releases/v1.1.2.md','install-plugins.cmd','scripts/install-plugins.ps1'];
const names=[...common,'dsh-pet/lib','dsh-pet/assets/pets','dsh-pet/assets/screen-backgrounds','dsh-pet/assets/fonts','dsh-pet/assets/pic','dsh-pet/assets/config.jsonc','dsh-pet/assets/logo.png','dsh-pet/bridge','dsh-pet/desktop','dsh-pet/runtime/electron-helper','dsh-pet/package.json','dsh-pet/config.jonsbo.example.json','dsh-pet/cordis.patch.yml','dsh-pet/scripts/start-mcp.cmd','dsh-pet/scripts/ensure-electron.mjs'];
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});const stage=fs.mkdtempSync(path.join(dist,'lite-stage-'));const folder=path.join(stage,'pet-trio');fs.mkdirSync(folder);
const allowed=p=>{const rel=path.relative(root,p).replaceAll('\\','/');return !/(^|\/)(node_modules|__pycache__|\.git|\.qa)(\/|$)/.test(rel)&&!/(^|\/)bridge\/local\.json$/.test(rel)&&!/(^|\/)desktop\/bin\/[^/]+\.exe$/.test(rel)&&!/(^|\/)(\.env|.*\.log|.*\.pyc)$/.test(rel);};
for(const name of names){const source=path.join(root,name);if(!fs.existsSync(source))throw Error('Missing runtime file: '+name);fs.cpSync(source,path.join(folder,name),{recursive:true,filter:allowed});}
const inventory=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else inventory.push({path:path.relative(folder,p).replaceAll('\\','/'),bytes:fs.statSync(p).size});}}walk(folder);
if(inventory.some(f=>/(^|\/)local\.json$|runtime\/node\/|electron-win-x64\.zip|desktop\/bin\/[^/]+\.exe$/.test(f.path)))throw Error('Machine-local or bundled runtime entered the lite package');
const zip=path.join(dist,profile.artifact);if(fs.existsSync(zip))fs.unlinkSync(zip);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const code='Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('+quote(stage)+','+quote(zip)+',[IO.Compression.CompressionLevel]::Optimal,$false)';
const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:120000});if(result.status!==0)throw Error(result.stderr || 'ZIP build failed');
const hash=crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');fs.writeFileSync(zip+'.sha256',hash+'  '+profile.artifact+'\n');fs.writeFileSync(zip+'.files.json',JSON.stringify(inventory,null,2)+'\n');
const tarball=path.join(dist,profile.artifact.replace(/\.zip$/,'.tgz'));
const packageFolder=path.join(stage,'package');fs.renameSync(folder,packageFolder);
const packed=spawnSync('tar',['-czf',tarball,'-C',stage,'package'],{windowsHide:true,encoding:'utf8',timeout:120000});
if(packed.status!==0)throw Error(packed.stderr || 'DSH tarball build failed');
const tarHash=crypto.createHash('sha256').update(fs.readFileSync(tarball)).digest('hex');fs.writeFileSync(tarball+'.sha256',tarHash+'  '+path.basename(tarball)+'\n');fs.writeFileSync(tarball+'.files.json',JSON.stringify(inventory,null,2)+'\n');
if(!path.resolve(stage).startsWith(path.resolve(dist)+path.sep+'lite-stage-'))throw Error('Unexpected build scratch path');
fs.rmSync(stage,{recursive:true});
console.log(JSON.stringify({artifact:zip,dshTarball:tarball,sha256:hash,tarSha256:tarHash,files:inventory.length,sizeMiB:+(fs.statSync(zip).size/1048576).toFixed(1)},null,2));
