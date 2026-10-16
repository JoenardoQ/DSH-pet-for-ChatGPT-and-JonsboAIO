param(
  [ValidateSet('DSH','Codex')][string]$Target,
  [string]$Source='',
  [string]$DshDesktop='',
  [string]$Profile='desktop',
  [switch]$Plan,
  [switch]$Headless,
  [switch]$Library
)
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$script:origin=Split-Path $PSScriptRoot -Parent
$script:manifest=Get-Content -LiteralPath (Join-Path $origin 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:launcher=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-launcher.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:repository=($manifest.repository.url -replace '^git\+','' -replace '\.git$','')
$script:form=$null;$script:busy=$false
function Report([string]$Text){
  if($script:form){$script:status.Text=$Text;$script:log.AppendText($Text+"`r`n");[Windows.Forms.Application]::DoEvents()}
  else{Write-Host $Text}
}
function Read-Package([string]$Root){
  $p=Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if($p.name -ne $script:manifest.name){throw '这个安装入口只接受本项目的安装包；另一个项目请使用它自己的安装入口。'}
  foreach($name in @($p.main,$p.dsh.bundle.patch,'.agents/plugins/marketplace.json','.codex-plugin/plugin.json','mcp.json','scripts/windows-launcher.ps1')){
    $full=[IO.Path]::GetFullPath((Join-Path $Root $name))
    if(!$full.StartsWith([IO.Path]::GetFullPath($Root)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $full -PathType Leaf)){throw "安装包缺少或越界：$name"}
  }
  return $p
}
function Source-Plan([string]$Value){
  if(!$Value){$Value=$script:origin}
  $uri=$null
  if([Uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$uri) -and $uri.Scheme -in @('http','https')){
    if($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment){throw '请使用本项目的 HTTPS GitHub 仓库、Release 页面或 ZIP 链接。'}
    $base=[Uri]$script:repository
    if(!($uri.AbsolutePath -eq $base.AbsolutePath -or $uri.AbsolutePath -eq ($base.AbsolutePath+'.git') -or $uri.AbsolutePath.StartsWith($base.AbsolutePath+'/',[StringComparison]::OrdinalIgnoreCase))){throw '链接不属于此桌宠仓库。'}
    $tail=$uri.AbsolutePath.Substring($base.AbsolutePath.Length)
    if($tail -in @('','.git','/')){return @{kind='github';url=$script:repository;ref='main'}}
    if($tail -eq '/releases' -or $tail -eq '/releases/latest'){return @{kind='release';url=$script:repository;tag='latest'}}
    if($tail -match '^/releases/tag/([^/]+)$'){return @{kind='release';url=$script:repository;tag=[Uri]::UnescapeDataString($Matches[1])}}
    if($tail -match '^/releases/(?:download/[^/]+|latest/download)/[^/]+\.zip$'){return @{kind='zip-url';url=$Value;checksum=$true}}
    if($tail -match '^/(?:archive/.+\.zip|zipball/[^/]+)$'){return @{kind='zip-url';url=$Value;checksum=$false}}
    if($tail -match '^/tree/([^/]+)$'){return @{kind='github';url=$script:repository;ref=[Uri]::UnescapeDataString($Matches[1])}}
    throw '链接应为仓库主页、tree/分支、Release 页面或 ZIP 文件。'
  }
  $full=[IO.Path]::GetFullPath($Value)
  if(Test-Path -LiteralPath $full -PathType Container){[void](Read-Package $full);return @{kind='folder';path=$full}}
  if((Test-Path -LiteralPath $full -PathType Leaf) -and [IO.Path]::GetExtension($full) -eq '.zip'){return @{kind='zip';path=$full}}
  throw '请选择解压后的目录、本地 ZIP，或粘贴本项目的 GitHub / Release 链接。'
}
function Download-Once([string]$Url,[string]$File,[int]$StallSeconds=45,[int]$TotalSeconds=600){
  if($StallSeconds -lt 1 -or $TotalSeconds -lt 1){throw 'Invalid download timeout'}
  $client=New-Object Net.WebClient
  $client.Headers['User-Agent']='DesktopPetInstaller'
  $started=[DateTime]::UtcNow;$active=$started;$lastBytes=-1L;$reported=$started
  try{
    $task=$client.DownloadFileTaskAsync([Uri]$Url,$File)
    while(!$task.IsCompleted){
      $now=[DateTime]::UtcNow
      $bytes=if([IO.File]::Exists($File)){(New-Object IO.FileInfo($File)).Length}else{0L}
      if($bytes -ne $lastBytes){$active=$now;$lastBytes=$bytes}
      if(($now-$active).TotalSeconds -gt $StallSeconds -or ($now-$started).TotalSeconds -gt $TotalSeconds){
        $client.CancelAsync();throw [TimeoutException]::new('下载超过等待上限，连接可能已中断。')
      }
      if(($now-$reported).TotalSeconds -ge 1){Report ('已下载 '+[Math]::Round($bytes/1MB,1)+' MiB');$reported=$now}
      if($script:form){[Windows.Forms.Application]::DoEvents()}
      Start-Sleep -Milliseconds 80
    }
    $task.GetAwaiter().GetResult() | Out-Null
  }finally{$client.Dispose()}
}
function Pause-DownloadRetry([int]$Attempt){Start-Sleep -Seconds ([Math]::Min(3,$Attempt))}
function Download([string]$Url,[string]$File){
  $partial=$File+'.'+[Guid]::NewGuid().ToString('N').Substring(0,12)+'.part'
  try{
    for($attempt=1;$attempt -le 3;$attempt++){
      try{
        Report ('正在下载所选安装包（'+$attempt+'/3）…')
        if([IO.File]::Exists($partial)){[IO.File]::Delete($partial)}
        Download-Once $Url $partial
        if([IO.File]::Exists($File)){[IO.File]::Replace($partial,$File,$null)}else{[IO.File]::Move($partial,$File)}
        return
      }catch{
        if($attempt -eq 3){throw ('下载失败：'+$_.Exception.Message+' 可选择已下载的本地 ZIP；DSH 也可使用 Release 中的 .tgz 链接，绕过 GitHub 源码下载。')}
        Report '下载连接中断，正在重试…'
        Pause-DownloadRetry $attempt
      }
    }
  }finally{if([IO.File]::Exists($partial)){[IO.File]::Delete($partial)}}
}

function File-Sha256([string]$File){
  $stream=[IO.File]::OpenRead($File);$hash=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}
}
function Read-Remote([string]$Url){
  return Invoke-RestMethod -Uri $Url -Headers @{'User-Agent'='DesktopPetInstaller'} -TimeoutSec 45
}
function Resolve-Package($Spec){
  if($Spec.kind -eq 'folder'){return $Spec.path}
  $cache=Join-Path $env:LOCALAPPDATA ('DesktopPetPackages\'+[Guid]::NewGuid().ToString('N').Substring(0,12))
  New-Item -ItemType Directory -Path $cache -Force | Out-Null
  $zip=Join-Path $cache 'download.zip'
  if($Spec.kind -eq 'zip'){Copy-Item -LiteralPath $Spec.path -Destination $zip}
  else{
    $url=$Spec.url;$checksum=[bool]$Spec.checksum
    if($Spec.kind -eq 'release'){
      # Release assets have stable names; avoid a second dependency on the GitHub API.
      $releasePath=if($Spec.tag -eq 'latest'){'/releases/latest/download/'}else{'/releases/download/'+[Uri]::EscapeDataString($Spec.tag)+'/'}
      $url=$repository+$releasePath+$launcher.artifact;$checksum=$true
    }elseif($Spec.kind -eq 'github'){
      $repo=([Uri]$repository).AbsolutePath.Trim('/')
      $commit=Read-Remote ('https://api.github.com/repos/'+$repo+'/commits/'+[Uri]::EscapeDataString($Spec.ref))
      if($commit.sha -notmatch '^[a-f0-9]{40}$'){throw '无法解析仓库版本。'}
      $url=$repository+'/archive/'+$commit.sha+'.zip'
    }
    Download $url $zip
    if($checksum){
      $sum=Join-Path $cache 'download.sha256';Download ($url+'.sha256') $sum
      $expected=((Get-Content -LiteralPath $sum -Raw) -split '\s+')[0]
      if($expected -notmatch '^[a-fA-F0-9]{64}$' -or (File-Sha256 $zip) -ne $expected){throw '安装包 SHA256 校验失败。'}
    }
  }
  Report '正在检查并解压安装包…'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  $unpack=Join-Path $cache 'source';New-Item -ItemType Directory -Path $unpack | Out-Null
  try{
    $total=0L
    if($archive.Entries.Count -gt 20000){throw 'ZIP 文件数量异常。'}
    foreach($entry in $archive.Entries){
      $dest=[IO.Path]::GetFullPath((Join-Path $unpack $entry.FullName))
      if(!$dest.StartsWith($unpack+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $entry.FullName.Contains(':')){throw 'ZIP 含有越界路径。'}
      if((($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000){throw 'ZIP 不应包含符号链接。'}
      $total+=$entry.Length;if($total -gt 2147483648){throw 'ZIP 解压体积异常。'}
    }
    $rootEntries=@($archive.Entries | Where-Object {$_.FullName.Replace('\','/') -eq 'package.json'})
    $prefix=''
    if(!$rootEntries.Count){
      $rootEntries=@($archive.Entries | Where-Object {$_.FullName.Replace('\','/') -match '^[^/]+/package\.json$'})
      if($rootEntries.Count -ne 1){throw 'ZIP 必须包含唯一插件根目录。'}
      $prefix=$rootEntries[0].FullName.Replace('\','/').Substring(0,$rootEntries[0].FullName.Length-'package.json'.Length)
    }
    # Strip the GitHub commit directory before extraction; classic Windows ZIP APIs otherwise exceed MAX_PATH.
    foreach($entry in $archive.Entries){
      $entryName=$entry.FullName.Replace('\','/')
      if(!$entryName.StartsWith($prefix,[StringComparison]::Ordinal)){continue}
      $relative=$entryName.Substring($prefix.Length)
      if(!$relative){continue}
      $dest=[IO.Path]::GetFullPath((Join-Path $unpack $relative))
      if(!$dest.StartsWith($unpack+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'ZIP 含有越界路径。'}
      if($entryName.EndsWith('/')){[IO.Directory]::CreateDirectory($dest)|Out-Null;continue}
      [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
      $inputStream=$entry.Open();$outputStream=[IO.File]::Create($dest)
      try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
    }
  }finally{$archive.Dispose()}
  [void](Read-Package $unpack);return $unpack
}
function Run-Command([string]$Exe,[string[]]$Arguments,[switch]$Capture){
  # ArgumentList is available in PowerShell 7; this Windows PowerShell entry uses proper Win32 quoting.
  $quoted=@($Arguments | ForEach-Object {'"'+([regex]::Replace([regex]::Replace($_,'(\\*)"','$1$1\"'),'(\\+)$','$1$1'))+'"'}) -join ' '
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$Exe;$info.Arguments=$quoted;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $proc=New-Object Diagnostics.Process;$proc.StartInfo=$info
  try{
    [void]$proc.Start();$out=$proc.StandardOutput.ReadToEndAsync();$err=$proc.StandardError.ReadToEndAsync()
    while(!$proc.WaitForExit(100)){if($script:form){[Windows.Forms.Application]::DoEvents()}}
    $stdout=$out.GetAwaiter().GetResult();$stderr=$err.GetAwaiter().GetResult()
    if($stdout -and !$Capture){Report $stdout.Trim()};if($stderr){Report $stderr.Trim()}
    if($proc.ExitCode -ne 0){throw "宿主安装命令失败（$($proc.ExitCode)）。上方日志可用于重试。"}
    if($Capture){return $stdout}
  }finally{$proc.Dispose()}
}
function Install-Package([string]$ChosenTarget,[string]$Value){
  $spec=Source-Plan $Value
  if($Plan){return @{target=$ChosenTarget;source=$spec;package=$manifest.name;installs=$false;startsPet=$false}|ConvertTo-Json -Depth 6}
  if($ChosenTarget -eq 'Codex'){
    $cli=Get-Command codex.exe -ErrorAction SilentlyContinue
    if(!$cli){$cli=Get-Command codex -ErrorAction SilentlyContinue}
    if(!$cli){$bundled=Join-Path $env:USERPROFILE '.codex\plugins\.plugin-appserver\codex.exe';if(Test-Path -LiteralPath $bundled){$cli=Get-Item -LiteralPath $bundled | Select-Object @{n='Source';e={$_.FullName}}}}
    if(!$cli -or $cli.Source -match '\.(cmd|ps1)$'){throw '未找到 Codex 可执行 CLI。请在宿主插件目录中添加本仓库源，或将 codex.exe 所在目录加入 PATH 后重试。'}
  }else{
    if(!$DshDesktop){foreach($folder in @((Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness'),(Join-Path $env:LOCALAPPDATA 'DeepSeek Harness'))){if(Test-Path -LiteralPath (Join-Path $folder 'DeepSeek Harness.exe')){$DshDesktop=$folder;break}}}
    if(!$DshDesktop -or !(Test-Path -LiteralPath (Join-Path $DshDesktop 'DeepSeek Harness.exe'))){throw '请先用“选择 DSH 程序目录”选中 DeepSeek Harness.exe 所在目录。'}
  }
  $root=Resolve-Package $spec;$pkg=Read-Package $root
  if($ChosenTarget -eq 'Codex'){
    $market=Get-Content -LiteralPath (Join-Path $root '.agents/plugins/marketplace.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    Report '正在注册到 GPT / Codex 本地插件列表…'
    # Source folders may contain authoring archives/node_modules; publish only declared package files.
    $installRoot=Join-Path $env:LOCALAPPDATA ('DesktopPetPackages\installed-'+$pkg.version)
    if([IO.Path]::GetFullPath($root) -ne [IO.Path]::GetFullPath($installRoot)){
      New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
      foreach($entry in @('package.json')+@($pkg.files)){
        foreach($file in @(Get-Item -Path (Join-Path $root $entry) -Force -ErrorAction SilentlyContinue)){
          $relative=$file.FullName.Substring($root.TrimEnd('\','/').Length).TrimStart('\','/')
          $dest=[IO.Path]::GetFullPath((Join-Path $installRoot $relative))
          if(!$dest.StartsWith([IO.Path]::GetFullPath($installRoot)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw '安装文件越界。'}
          [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null
          if($file.PSIsContainer){Copy-Item -LiteralPath $file.FullName -Destination ([IO.Path]::GetDirectoryName($dest)) -Recurse -Force}else{Copy-Item -LiteralPath $file.FullName -Destination $dest -Force}
        }
      }
    }
    $configured=(Run-Command $cli.Source @('plugin','marketplace','list','--json') -Capture | ConvertFrom-Json).marketplaces | Where-Object name -eq $market.name
    if($configured -and [IO.Path]::GetFullPath($configured.root) -ne [IO.Path]::GetFullPath($installRoot)){
      Run-Command $cli.Source @('plugin','marketplace','remove',$market.name)
    }
    Run-Command $cli.Source @('plugin','marketplace','add',$installRoot)
    Run-Command $cli.Source @('plugin','add',($market.plugins[0].name+'@'+$market.name))
    # Discovery only. Enabling in the host is the user's explicit next action, and never spawns a pet here.
    Report ('已更新插件 '+$pkg.version+'。宿主重新加载后使用新版；旧缓存不再作为入口。')
  }else{
    Report '正在安装到 DSH 插件列表…'
    $previous=$env:ELECTRON_RUN_AS_NODE
    try{
      $env:ELECTRON_RUN_AS_NODE='1'
      $hostCli=Join-Path $DshDesktop 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
      Run-Command (Join-Path $DshDesktop 'DeepSeek Harness.exe') @('--expose-internals',$hostCli,'plugin','--profile',$Profile,'add',('file:'+$root))
    }finally{$env:ELECTRON_RUN_AS_NODE=$previous}
    Report '已加入 DSH 插件列表；在 DSH 中启用插件。默认仅显示一只桌面宠物。'
  }
}
if($Library){return}
if($Target){Install-Package $Target $Source;exit}
if($Headless -or $Plan){throw '请通过 -Target DSH 或 -Target Codex 指定宿主。'}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$script:form=New-Object Windows.Forms.Form
$form.Text=$launcher.name+' · 安装到插件列表';$form.Size=New-Object Drawing.Size(700,480);$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
$label=New-Object Windows.Forms.Label;$label.Text='来源：本地目录、ZIP 文件、GitHub 或 Release 链接';$label.SetBounds(18,16,650,26);$form.Controls.Add($label)
$input=New-Object Windows.Forms.TextBox;$input.Text=$origin;$input.SetBounds(18,48,550,28);$form.Controls.Add($input)
$browse=New-Object Windows.Forms.Button;$browse.Text='选择 ZIP';$browse.SetBounds(578,46,90,30);$browse.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='ZIP 安装包|*.zip';if($dialog.ShowDialog() -eq 'OK'){$input.Text=$dialog.FileName};$dialog.Dispose()});$form.Controls.Add($browse)
$dshPath=New-Object Windows.Forms.Button;$dshPath.Text='选择 DSH 程序目录';$dshPath.SetBounds(18,90,210,34);$dshPath.Add_Click({$dialog=New-Object Windows.Forms.OpenFileDialog;$dialog.Filter='DeepSeek Harness|DeepSeek Harness.exe';if($dialog.ShowDialog() -eq 'OK'){$script:DshDesktop=Split-Path $dialog.FileName;$dshPath.Text='DSH 目录已选择'};$dialog.Dispose()});$form.Controls.Add($dshPath)
foreach($name in @('DSH','Codex')){
 $button=New-Object Windows.Forms.Button;$button.Text=if($name -eq 'DSH'){'添加到 DSH'}else{'添加到 GPT / Codex'};$button.Tag=$name;$button.SetBounds($(if($name -eq 'DSH'){240}else{446}),90,196,34)
 $button.Add_Click({if($script:busy){return};$script:busy=$true;try{Install-Package $this.Tag $input.Text}catch{Report $_.Exception.Message}finally{$script:busy=$false}});$form.Controls.Add($button)
}
$script:status=New-Object Windows.Forms.Label;$status.Text='安装入口不启动桌宠；无需 agent，也不需要预装 Node / Python。';$status.SetBounds(18,138,650,50);$form.Controls.Add($status)
$script:log=New-Object Windows.Forms.TextBox;$log.Multiline=$true;$log.ReadOnly=$true;$log.ScrollBars='Vertical';$log.SetBounds(18,194,650,225);$form.Controls.Add($log)
$form.Add_FormClosing({if($script:busy){$_.Cancel=$true}})
[void]$form.ShowDialog();$form.Dispose()
