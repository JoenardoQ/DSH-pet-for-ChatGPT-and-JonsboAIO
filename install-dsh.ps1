param([Parameter(Mandatory=$true)][string]$Desktop, [string]$Profile='desktop')
$ErrorActionPreference='Stop'
$hostExe=Join-Path $Desktop 'DeepSeek Harness.exe'
$cli=Join-Path $Desktop 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
if(!(Test-Path -LiteralPath $hostExe)){throw "DSH desktop not found: $hostExe"}
$oldMode=$env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE='1'
  $argsList=@('--expose-internals', ('"'+$cli+'"'), 'plugin', '--profile', $Profile, 'add', ('"file:'+$PSScriptRoot+'"'))
  $process=Start-Process -FilePath $hostExe -ArgumentList $argsList -WindowStyle Hidden -Wait -PassThru
  if($process.ExitCode -ne 0){throw 'DSH plugin installation failed'}
} finally { $env:ELECTRON_RUN_AS_NODE=$oldMode }
Write-Host 'Restart DeepSeek Harness, then enable desktop or both display.'
