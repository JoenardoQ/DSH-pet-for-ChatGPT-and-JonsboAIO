param(
  [ValidateSet('wake','prepare','mcp','status','stop','check')][string]$Mode='wake',
  [switch]$Headless,
  [string]$DataDir='',
  [int]$Port=0
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
[Console]::InputEncoding=New-Object Text.UTF8Encoding($false)
$OutputEncoding=New-Object Text.UTF8Encoding($false)
$script:appRoot=Split-Path $PSScriptRoot -Parent
$script:launcherProfile=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'windows-launcher.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:packageRoot=[IO.Path]::GetFullPath((Join-Path $appRoot $launcherProfile.package))
if(!$DataDir){
  if($launcherProfile.kind -eq 'whale' -and $env:WHALE_DATA_DIR){$DataDir=$env:WHALE_DATA_DIR}
  elseif($launcherProfile.kind -eq 'pet' -and $env:PET_DATA_DIR){$DataDir=$env:PET_DATA_DIR}
  else{$DataDir=Join-Path $env:LOCALAPPDATA $launcherProfile.folder;if($launcherProfile.kind -eq 'pet'){$DataDir=Join-Path $DataDir 'jonsbo'}}
}
$script:data=[IO.Path]::GetFullPath($DataDir)
if(!$Port){$Port=if($launcherProfile.kind -eq 'whale' -and $env:WHALE_PORT){[int]$env:WHALE_PORT}elseif($launcherProfile.kind -eq 'pet' -and $env:PET_PORT){[int]$env:PET_PORT}else{[int]$launcherProfile.port}}
if($Port -lt 1024 -or $Port -gt 65534){throw 'Invalid local port'}
$script:base='http://127.0.0.1:'+$Port
$script:cancelled=$false;$script:form=$null;$script:busy=$false;$script:retry=$false
$script:stageFile=Join-Path $data 'launcher-state.json'
$script:engine='';$script:usbWorker='';$script:python=''
function Pump {
  if($script:form){[Windows.Forms.Application]::DoEvents()}
  if($script:cancelled){throw '准备已取消，重新打开即可重试。'}
}
function Write-AtomicText([string]$File,[string]$Value) {
  $temp=$File+'.'+$PID+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  try{
    [IO.File]::WriteAllText($temp,$Value,(New-Object Text.UTF8Encoding($false)))
    for($attempt=0;$attempt -lt 8;$attempt++){
      try{
        if([IO.File]::Exists($File)){[IO.File]::Replace($temp,$File,($temp+'.previous'))}else{[IO.File]::Move($temp,$File)}
        return
      }catch [IO.IOException]{if($attempt -eq 7){throw};Start-Sleep -Milliseconds 25}
    }
  }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)};if([IO.File]::Exists($temp+'.previous')){[IO.File]::Delete($temp+'.previous')}}
}
function Stage([string]$Name,[string]$Detail='') {
  if($script:form){$script:titleLabel.Text=$Name;$script:detailLabel.Text=$Detail;[Windows.Forms.Application]::DoEvents()}
  New-Item -ItemType Directory -Path $data -Force | Out-Null
  $value=@{stage=$Name;message=$Detail;updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();pid=$PID;uiVisible=[bool]($script:form -and $script:form.Visible)}
  if($script:form -and $env:DESKTOP_PET_CAPTURE_UI -eq '1'){
    $image=New-Object Drawing.Bitmap($form.Width,$form.Height)
    try{$form.DrawToBitmap($image,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$image.Save((Join-Path $data 'startup-window.png'),[Drawing.Imaging.ImageFormat]::Png)}finally{$image.Dispose()}
  }
  Write-AtomicText $script:stageFile ($value|ConvertTo-Json -Compress)
}
function Show-Setup {
  if($Headless -or $script:form){return}
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [Windows.Forms.Application]::EnableVisualStyles()
  $script:form=New-Object Windows.Forms.Form
  $form.Text=$launcherProfile.name+' · 启动';$form.Size=New-Object Drawing.Size(520,260)
  $form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
  $form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
  $script:titleLabel=New-Object Windows.Forms.Label
  $titleLabel.Location=New-Object Drawing.Point(24,22);$titleLabel.Size=New-Object Drawing.Size(460,32)
  $script:detailLabel=New-Object Windows.Forms.Label
  $detailLabel.Location=New-Object Drawing.Point(24,62);$detailLabel.Size=New-Object Drawing.Size(460,54)
  $script:bar=New-Object Windows.Forms.ProgressBar
  $bar.Location=New-Object Drawing.Point(24,124);$bar.Size=New-Object Drawing.Size(460,15);$bar.Style='Marquee'
  $script:retryButton=New-Object Windows.Forms.Button
  $retryButton.Text='重试';$retryButton.Location=New-Object Drawing.Point(24,164);$retryButton.Enabled=$false
  $retryButton.Add_Click({$script:retry=$true})
  $settingsButton=New-Object Windows.Forms.Button
  $settingsButton.Text='连接设置';$settingsButton.Location=New-Object Drawing.Point(116,164);$settingsButton.Width=100
  $settingsButton.Add_Click({
    if($script:launcherProfile.kind -eq 'whale' -and $script:engine){Start-Process -FilePath $script:engine -ArgumentList @((Quote (Join-Path $script:packageRoot 'bridge\cli.mjs')),'settings') -WindowStyle Hidden}
    else{Start-Process ($script:base+'/')}
  })
  $logButton=New-Object Windows.Forms.Button
  $logButton.Text='查看日志';$logButton.Location=New-Object Drawing.Point(230,164);$logButton.Width=100
  $logButton.Add_Click({Start-Process -FilePath 'explorer.exe' -ArgumentList ('"'+$script:data+'"')})
  $closeButton=New-Object Windows.Forms.Button
  $closeButton.Text='关闭';$closeButton.Location=New-Object Drawing.Point(380,164);$closeButton.Width=100
  $closeButton.Add_Click({$script:form.Close()})
  $form.Add_FormClosing({if($script:busy){$script:cancelled=$true}})
  $form.Controls.AddRange(@($titleLabel,$detailLabel,$bar,$retryButton,$settingsButton,$logButton,$closeButton))
  $form.Show();$form.Activate();$form.BringToFront();[Windows.Forms.Application]::DoEvents()
}
function Start-TaskProcess([string]$File,[string]$Arguments) {
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$File;$info.Arguments=$Arguments;$info.WorkingDirectory=$script:packageRoot;$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
  $info.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $p=[Diagnostics.Process]::Start($info)
  $p.StandardInput.Close()
  return @{process=$p;stdout=$p.StandardOutput.ReadToEndAsync();stderr=$p.StandardError.ReadToEndAsync()}
}
function Wait-TaskProcess($Job,[int]$TimeoutMs=30000,[scriptblock]$Poll={}) {
  $watch=[Diagnostics.Stopwatch]::StartNew()
  try{
    while(!$Job.process.WaitForExit(60)){
      Pump;& $Poll
      if($watch.ElapsedMilliseconds -gt $TimeoutMs){throw '此步骤超时，请检查网络后点击重试。'}
    }
    if(!$Job.stdout.Wait(2000) -or !$Job.stderr.Wait(2000)){throw '启动进程没有正常结束输出。'}
    if($Job.process.ExitCode -ne 0){throw ($Job.stderr.Result | Out-String)}
    return $Job.stdout.Result
  }finally{
    if(!$Job.process.HasExited){$Job.process.Kill();[void]$Job.process.WaitForExit(2000)}
    $Job.process.Dispose()
  }
}
function Quote([string]$Value){return '"'+$Value+'"'}
function File-Sha256([string]$File) {
  $stream=[IO.File]::OpenRead($File);$hash=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant()}
  finally{$hash.Dispose();$stream.Dispose()}
}
function Verified-File($Item) {
  if($Item.sha256 -notmatch '^[a-f0-9]{64}$' -or $Item.url -notmatch '^https://'){throw '组件清单无效。'}
  $cache=Join-Path $data ('runtime\downloads\'+$Item.sha256+'-'+$Item.name)
  New-Item -ItemType Directory -Path (Split-Path $cache -Parent) -Force | Out-Null
  if((Test-Path -LiteralPath $cache) -and (File-Sha256 $cache) -eq $Item.sha256){return $cache}
  $local=Join-Path $packageRoot $Item.local
  if((Test-Path -LiteralPath $local) -and (File-Sha256 $local) -eq $Item.sha256){Copy-Item -LiteralPath $local -Destination $cache -Force;return $cache}
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  for($attempt=1;$attempt -le 2;$attempt++){
    $part=$cache+'.part';$client=New-Object Net.WebClient
    try{
      Stage '正在下载组件' ($Item.name+' · 第 '+$attempt+' 次尝试')
      $downloadUrl=$Item.url
      $client.Headers['User-Agent']='DesktopPet-Windows-Launcher'
      if($attempt -gt 1 -and $downloadUrl -match '^https://raw[.]githubusercontent[.]com/([^/]+)/([^/]+)/([a-f0-9]{40})/(.+)$'){
        $downloadUrl='https://api.github.com/repos/'+$Matches[1]+'/'+$Matches[2]+'/contents/'+$Matches[4]+'?ref='+$Matches[3]
        $client.Headers['Accept']='application/vnd.github.raw+json'
        Stage '正在切换官方后备下载' $Item.name
      }
      $task=$client.DownloadFileTaskAsync([Uri]$downloadUrl,$part)
      $watch=[Diagnostics.Stopwatch]::StartNew()
      while(!$task.IsCompleted){
        Pump
        if($watch.Elapsed.TotalSeconds -gt 180){throw '下载超时。'}
        if($script:form -and (Test-Path -LiteralPath $part)){$detailLabel.Text=$Item.name+' · 已下载 '+([Math]::Round((Get-Item -LiteralPath $part).Length/1MB,1))+' MiB'}
        Start-Sleep -Milliseconds 80
      }
      $task.GetAwaiter().GetResult()
      Stage '正在校验组件' $Item.name
      if((File-Sha256 $part) -ne $Item.sha256){throw '组件校验失败，请重试。'}
      Move-Item -LiteralPath $part -Destination $cache -Force
      return $cache
    }catch{if($attempt -eq 2 -or $script:cancelled){throw}}finally{$client.CancelAsync();$client.Dispose()}
  }
}
function Expand-VerifiedArchive([string]$Archive,[string]$Target) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  $full=[IO.Path]::GetFullPath($Target).TrimEnd('\')+'\'
  $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
  try{
    foreach($entry in $zip.Entries){
      Pump
      $dest=[IO.Path]::GetFullPath((Join-Path $Target $entry.FullName))
      if(!$dest.StartsWith($full,[StringComparison]::OrdinalIgnoreCase)){throw '组件压缩包包含无效路径。'}
      if(!$entry.Name){New-Item -ItemType Directory -Path $dest -Force|Out-Null;continue}
      New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force|Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$dest,$true)
    }
  }finally{$zip.Dispose()}
}
function Publish-Directory([string]$Stage,[string]$Target,[string]$Boundary) {
  $root=[IO.Path]::GetFullPath($Boundary).TrimEnd('\')+'\'
  foreach($p in @($Stage,$Target)){if(![IO.Path]::GetFullPath($p).StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw '组件目录超出安装范围。'}}
  if(Test-Path -LiteralPath $Target){Move-Item -LiteralPath $Target -Destination ($Target+'.previous-'+[Guid]::NewGuid().ToString('N'))}
  Move-Item -LiteralPath $Stage -Destination $Target
}
function Prepare-Python {
  $runtime=Join-Path $data 'runtime'
  $target=Join-Path $runtime ('python-'+$launcherProfile.pythonVersion)
  $expected=$launcherProfile.python.sha256+':'+$launcherProfile.pillow.sha256
  $marker=Join-Path $target '.ready'
  $ready=(Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $expected -and (Test-Path -LiteralPath (Join-Path $target 'python.exe'))
  if($ready){try{[void](Wait-TaskProcess (Start-TaskProcess (Join-Path $target 'python.exe') '-c "from PIL import Image; import ctypes, json"') 15000)}catch{$ready=$false}}
  if(!$ready){
    $archive=Verified-File $launcherProfile.python
    $pillow=Verified-File $launcherProfile.pillow
    Stage '正在准备屏幕组件' '自动安装官方 Python 与 Pillow，无需手动安装。'
    $stage=Join-Path $runtime ('python-stage-'+[Guid]::NewGuid().ToString('N'))
    Expand-VerifiedArchive $archive $stage
    Expand-VerifiedArchive $pillow (Join-Path $stage 'Lib\site-packages')
    [IO.File]::WriteAllText((Join-Path $stage 'python313._pth'),"python313.zip`n.`nLib/site-packages`nimport site`n",[Text.Encoding]::ASCII)
    [void](Wait-TaskProcess (Start-TaskProcess (Join-Path $stage 'python.exe') '-c "from PIL import Image; import ctypes, json"') 15000)
    [IO.File]::WriteAllText((Join-Path $stage '.ready'),$expected)
    Publish-Directory $stage $target $runtime
  }
  $script:python=Join-Path $target 'python.exe'
  $env:PET_PYTHON=$script:python
}
function Prepare-Runtime {
  $key=[BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($packageRoot.ToLowerInvariant()))).Replace('-','')
  $mutex=New-Object Threading.Mutex($false,('Local\DesktopPetSetup-'+$key));$held=$false
  try{
    $watch=[Diagnostics.Stopwatch]::StartNew();Stage '正在检查运行组件' '已有组件将直接复用。'
    while(!$held){
      Pump
      try{$held=$mutex.WaitOne(100)}catch [Threading.AbandonedMutexException]{$held=$true}
      if($watch.Elapsed.TotalSeconds -gt 30){throw '另一个安装窗口仍在准备组件，请稍后重试。'}
    }
    if($launcherProfile.kind -eq 'whale'){
      $env:WHALE_DATA_DIR=$data;$env:WHALE_PORT=[string]$Port
      $id=[Guid]::NewGuid().ToString('N');$statePath=Join-Path $data ('setup-'+$id+'-state.json')
      $arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File '+(Quote (Join-Path $appRoot 'scripts\bootstrap.ps1'))+' -SetupOnly -SessionId '+$id
      $job=Start-TaskProcess (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') $arguments
      [void](Wait-TaskProcess $job 650000 {
        if(Test-Path -LiteralPath $statePath){
          try{$s=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8|ConvertFrom-Json
            $label=switch -Wildcard($s.stage){'download-*'{'正在下载并校验组件'}'validate-*'{'正在验证运行组件'}'waiting-lock'{'正在等待组件准备'}default{'正在准备桌宠'}}
            if($script:form){$titleLabel.Text=$label;$detailLabel.Text=$s.message}
          }catch{}
        }
      })
      $script:engine=Join-Path $data 'runtime\windows-x64-v1\electron\electron.exe'
      $env:WHALE_ELECTRON=$engine;$env:WHALE_NODE=$engine;$env:WHALE_PYTHON=Join-Path $data 'runtime\windows-x64-v1\python\python.exe'
    }else{
      $runtime=Join-Path $data 'runtime';New-Item -ItemType Directory -Path $runtime -Force|Out-Null
      $target=Join-Path $runtime ('electron-'+$launcherProfile.electronVersion)
      $marker=Join-Path $target '.ready'
      $env:ELECTRON_RUN_AS_NODE='1'
      $engineReady=(Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw).Trim() -eq $launcherProfile.electronSha256 -and (Test-Path -LiteralPath (Join-Path $target 'electron.exe'))
      if($engineReady){try{[void](Wait-TaskProcess (Start-TaskProcess (Join-Path $target 'electron.exe') '-e "if(!process.versions.node)process.exit(1)"') 15000)}catch{$engineReady=$false}}
      if(!$engineReady){
        $archive=Join-Path $runtime 'electron.zip';$stream=[IO.File]::Create($archive)
        try{foreach($item in $launcherProfile.electronParts){$part=Verified-File $item;$archiveInput=[IO.File]::OpenRead($part);try{$archiveInput.CopyTo($stream)}finally{$archiveInput.Dispose()}}}finally{$stream.Dispose()}
        if((File-Sha256 $archive) -ne $launcherProfile.electronSha256){throw 'Electron 组件整体校验失败。'}
        Stage '正在解压运行组件' '只需首次准备，完成后自动启动。'
        $stage=Join-Path $runtime ('electron-stage-'+[Guid]::NewGuid().ToString('N'))
        Expand-VerifiedArchive $archive $stage
        $env:ELECTRON_RUN_AS_NODE='1'
        [void](Wait-TaskProcess (Start-TaskProcess (Join-Path $stage 'electron.exe') '-e "if(!process.versions.node)process.exit(1)"') 15000)
        [IO.File]::WriteAllText((Join-Path $stage '.ready'),$launcherProfile.electronSha256)
        Publish-Directory $stage $target $runtime
      }
      $script:engine=Join-Path $target 'electron.exe'
      if(!(Test-Path -LiteralPath (Join-Path $packageRoot 'node_modules\@electron\get\package.json')) -or !(Test-Path -LiteralPath (Join-Path $packageRoot 'node_modules\@electron-internal\extract-zip\package.json'))){
        $archive=Verified-File $launcherProfile.dependencies
        Stage '正在准备启动依赖' '无需安装 npm 或开发工具。'
        $stage=Join-Path $packageRoot ('dependencies-stage-'+[Guid]::NewGuid().ToString('N'))
        Expand-VerifiedArchive $archive $stage
        if(!(Test-Path -LiteralPath (Join-Path $stage 'node_modules\@electron\get\package.json'))){throw '启动依赖不完整。'}
        Publish-Directory (Join-Path $stage 'node_modules') (Join-Path $packageRoot 'node_modules') $packageRoot
        Remove-Item -LiteralPath $stage
      }
      Prepare-Python
      $env:PET_NODE=$engine;$env:DSH_PET_ELECTRON_PATH=$engine
      Remove-Item Env:PET_USB_WORKER -ErrorAction SilentlyContinue
      $env:PET_DATA_DIR=$data;$env:PET_PORT=[string]$Port
      if(!$env:DSH_HOME){$env:DSH_HOME=Join-Path (Split-Path $data -Parent) 'dsh'}
    }
    $env:ELECTRON_RUN_AS_NODE='1'
    $runtimeState=@{electron=$engine;worker=$usbWorker;python=$script:python;dshHome=$env:DSH_HOME;kind=$launcherProfile.kind}
    $env:PET_RUNTIME_STATE=Join-Path $data 'launcher-runtime.json'
    Write-AtomicText $env:PET_RUNTIME_STATE ($runtimeState|ConvertTo-Json)
    Stage '运行组件已就绪' '正在启动桌宠…'
  }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Read-State {
  $s=Invoke-RestMethod -Uri ($base+'/state') -TimeoutSec 2
  if($s.service -ne $launcherProfile.service){throw '本地端口正由其他程序使用。'}
  return $s
}
function Stop-Pet {
  try{$s=Read-State}catch{if($_.Exception.Message -eq '本地端口正由其他程序使用。'){throw};return}
  $headers=@{};$headers[$launcherProfile.header]='1'
  Invoke-RestMethod -Uri ($base+'/shutdown') -Method Post -Headers $headers -TimeoutSec 5|Out-Null
}
function Start-Pet {
  $cli=Join-Path $packageRoot 'bridge\cli.mjs'
  [void](Wait-TaskProcess (Start-TaskProcess $engine ((Quote $cli)+' wake')) 30000)
  $watch=[Diagnostics.Stopwatch]::StartNew()
  while($watch.Elapsed.TotalSeconds -lt 35){
    Pump
    try{
      $s=Read-State
      $desktop=if($launcherProfile.kind -eq 'whale'){$s.output.desktop -eq 'visible'}else{$s.activeSources -contains 'chatgpt'}
      if($desktop){
        if($s.output.usb -eq 'streaming'){Stage '桌宠与屏幕已启动' '画面正在同步。'}
        else{Stage '桌宠已启动' '可在连接设置中连接屏幕、调整方向或处理占用提示。'}
        return $s
      }
      if($s.output.error){throw $s.output.error}
    }catch{if($_.Exception.Message -eq '本地端口正由其他程序使用。'){throw}}
    Start-Sleep -Milliseconds 160
  }
  throw '桌宠尚未完成启动，请点击重试或查看日志。'
}
function Relay-Mcp {
  if($script:form){$script:form.Close();$script:form=$null}
  if($launcherProfile.kind -eq 'whale'){& (Join-Path $appRoot 'scripts\mcp-launcher.ps1');return}
  Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Threading.Tasks;
public static class DesktopPetStdio {
 static void Pump(System.IO.Stream from,System.IO.Stream to) {
  var bytes=new byte[4096];int count;
  while((count=from.Read(bytes,0,bytes.Length))>0){to.Write(bytes,0,count);to.Flush();}
 }
 public static int Run(string exe,string args) {
  var info=new ProcessStartInfo(exe,args) {UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
  using(var process=Process.Start(info)) {
   var input=Task.Run(()=>{try{Pump(Console.OpenStandardInput(),process.StandardInput.BaseStream);}finally{try{process.StandardInput.Close();}catch{}}});
   var output=Task.Run(()=>Pump(process.StandardOutput.BaseStream,Console.OpenStandardOutput()));
   var error=Task.Run(()=>Pump(process.StandardError.BaseStream,Console.OpenStandardError()));
   process.WaitForExit();Task.WaitAll(new[]{output,error},5000);return process.ExitCode;
  }
 }
}
"@
  $code=[DesktopPetStdio]::Run($engine,((Quote (Join-Path $packageRoot 'bridge\mcp.mjs'))))
  if($code -ne 0){throw '桌宠连接进程已退出。'}
}
function Test-RuntimeReady {
  $runtime=Join-Path $data 'runtime'
  $electron=Join-Path $runtime ('electron-'+$launcherProfile.electronVersion)
  $python=Join-Path $runtime ('python-'+$launcherProfile.pythonVersion)
  foreach($file in @((Join-Path $electron '.ready'),(Join-Path $electron 'electron.exe'),(Join-Path $python '.ready'),(Join-Path $python 'python.exe'),(Join-Path $packageRoot 'node_modules\@electron\get\package.json'),(Join-Path $packageRoot 'node_modules\@electron-internal\extract-zip\package.json'))){if(!(Test-Path -LiteralPath $file -PathType Leaf)){return $false}}
  return $true
}
try{
  if($Mode -eq 'stop'){Stop-Pet;exit 0}
  if($Mode -eq 'status'){Read-State|ConvertTo-Json -Depth 8;exit 0}
  if($Mode -eq 'check'){
    $ready=Test-RuntimeReady
    @{runtimeReady=[bool]$ready;name=$launcherProfile.name}|ConvertTo-Json;exit 0
  }
  $warm=Test-RuntimeReady
  if($Mode -ne 'mcp' -or (!$warm -and $env:DESKTOP_PET_HEADLESS -ne '1')){Show-Setup}
  do{
    $script:retry=$false;$script:cancelled=$false;$script:busy=$true
    if($script:form){$retryButton.Enabled=$false;$bar.Style='Marquee'}
    try{
      Prepare-Runtime
      if($Mode -eq 'mcp'){$script:busy=$false;Relay-Mcp;break}
      if($Mode -eq 'prepare'){$script:busy=$false;break}
      $state=Start-Pet
      if($Headless){$state|ConvertTo-Json -Depth 8;break}
      $script:busy=$false;$bar.Style='Continuous';$bar.Value=100
      Stage $titleLabel.Text $detailLabel.Text
      while($form.Visible -and !$script:retry){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 80}
    }catch{
      $script:busy=$false
      if($Headless -or $script:cancelled){throw}
      Stage '启动未完成' ($_.Exception.Message.Trim())
      $bar.Style='Continuous';$bar.Value=0;$retryButton.Enabled=$true
      while($form.Visible -and !$script:retry){[Windows.Forms.Application]::DoEvents();Start-Sleep -Milliseconds 80}
    }
  }while($script:retry)
  if($script:form){$script:form.Close()}
  exit 0
}catch{
  [Console]::Error.WriteLine($_.Exception.Message)
  if($script:form){$script:form.Close()}
  exit 1
}
