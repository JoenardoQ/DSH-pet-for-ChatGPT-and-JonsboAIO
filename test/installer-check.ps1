param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
. (Join-Path $Root 'scripts/install-plugins.ps1') -Library
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temp=Join-Path ([IO.Path]::GetTempPath()) ('pet-install-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
$oldLocal=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $temp 'app data'
$checks=0
function Check($Value,[string]$Message){if(!$Value){throw $Message};$script:checks++}
function Reject([scriptblock]$Code,[string]$Message){$failed=$false;try{& $Code | Out-Null}catch{$failed=$true};Check $failed $Message}
try{
 $repo=$script:repository
 foreach($link in @($repo,($repo+'.git'),($repo+'/releases/latest'),($repo+'/releases/tag/v1.0.0'),($repo+'/archive/refs/heads/main.zip'),($repo+'/releases/download/v1.0.0/test.zip'))){Check ([bool](Source-Plan $link)) $link}
 foreach($bad in @('https://evil.example/test.zip',($repo+'-different.git'),($repo+'/blob/main/package.json'),'http://github.com/example/repo',($repo+'?redirect=other'))){Reject {Source-Plan $bad} ('accepted unsafe source '+$bad)}
 $fixtureParent=Join-Path $temp 'fixture';$fixture=Join-Path $fixtureParent ('GitHub-repository-source-'+('a'*40));New-Item -ItemType Directory -Path $fixture -Force | Out-Null
 $pkg=$script:manifest
 foreach($rel in @('package.json',$pkg.main,$pkg.dsh.bundle.patch,'.agents/plugins/marketplace.json','.codex-plugin/plugin.json','mcp.json','scripts/windows-launcher.ps1')){
  $dest=Join-Path $fixture $rel;New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
  if($rel -in @('package.json','.agents/plugins/marketplace.json','.codex-plugin/plugin.json','mcp.json')){Copy-Item -LiteralPath (Join-Path $Root $rel) -Destination $dest}else{[IO.File]::WriteAllText($dest,'fixture')}
 }
 $nested=Join-Path $fixture 'implementation';New-Item -ItemType Directory -Path $nested | Out-Null;[IO.File]::WriteAllText((Join-Path $nested 'package.json'),'{"name":"nested-runtime"}')
 $zip=Join-Path $temp 'package.zip';[IO.Compression.ZipFile]::CreateFromDirectory($fixtureParent,$zip)
 $resolved=Resolve-Package (Source-Plan $zip);Check ((Read-Package $resolved).name -eq $pkg.name) 'zip root not resolved'
 $badZip=Join-Path $temp 'bad.zip';$archive=[IO.Compression.ZipFile]::Open($badZip,'Create');$entry=$archive.CreateEntry('../escaped.txt');$archive.Dispose()
 Reject {Resolve-Package (Source-Plan $badZip)} 'zip slip accepted'
 $broken=Join-Path $temp 'broken';New-Item -ItemType Directory -Path $broken | Out-Null;Copy-Item -LiteralPath (Join-Path $Root 'package.json') -Destination $broken
 Reject {Read-Package $broken} 'incomplete archive accepted'
 $script:commands=New-Object Collections.ArrayList
 function Run-Command([string]$Exe,[string[]]$Arguments){[void]$script:commands.Add(@{exe=$Exe;arguments=$Arguments})}
 function Get-Command {param([string]$Name) return @{Source='C:\fixture host\codex.exe'}}
 $script:DshDesktop=Join-Path $temp 'DSH program';New-Item -ItemType Directory -Path $script:DshDesktop | Out-Null;[IO.File]::WriteAllText((Join-Path $script:DshDesktop 'DeepSeek Harness.exe'),'fixture')
 Install-Package 'DSH' $resolved
 Install-Package 'Codex' $resolved
 Check ($commands.Count -eq 2) 'unexpected host commands'
 Check (($commands[0].arguments -join '|') -eq ('--expose-internals|'+(Join-Path $DshDesktop 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js')+'|plugin|--profile|desktop|add|'+$resolved)) 'wrong DSH installation command'
 Check (($commands[1].arguments -join '|') -eq ('plugin|marketplace|add|'+$resolved)) 'wrong Codex registration command'
 Check ($commands[1].arguments -notcontains 'add-plugin') 'installer should only register source'
 # Remote paths exercise release selection, checksum and commit resolution using local fixtures.
 $script:downloads=0;$script:fixtureZip=$zip
 function Download([string]$Url,[string]$File){$script:downloads++;if($Url.EndsWith('.sha256')){[IO.File]::WriteAllText($File,(File-Sha256 $script:fixtureZip)+'  test.zip')}else{Copy-Item -LiteralPath $script:fixtureZip -Destination $File}}
 function Read-Remote([string]$Url){if($Url.Contains('/commits/')){return @{sha=('a'*40)}}else{return @{assets=@(@{name=$script:launcher.artifact;browser_download_url=$repo+'/releases/download/v1/'+$script:launcher.artifact})}}}
 Check ((Read-Package (Resolve-Package (Source-Plan ($repo+'/releases/latest')))).name -eq $pkg.name) 'release install failed'
 Check ($downloads -eq 2) 'release skipped checksum'
 Check ((Read-Package (Resolve-Package (Source-Plan $repo))).name -eq $pkg.name) 'github commit archive install failed'
 Check ($downloads -eq 3) 'github archive downloaded unexpected files'
 [IO.File]::WriteAllText((Join-Path $fixture 'package.json'),'{"name":"different-pet"}')
 Reject {Read-Package $fixture} 'wrong pet package accepted'
 Write-Output ('INSTALL_CHECKS='+$checks)
}finally{
 $env:LOCALAPPDATA=$oldLocal
 $resolvedTemp=[IO.Path]::GetFullPath($temp);if($resolvedTemp.StartsWith([IO.Path]::GetTempPath(),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $resolvedTemp -Recurse -Force}
}
