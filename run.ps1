param(
  [ValidateSet('wake','hide','status','stop','state','prepare')][string]$Action='wake',
  [string]$State='idle',
  [string]$Message=''
)
$ErrorActionPreference='Stop'
$petRoot=Join-Path $PSScriptRoot 'dsh-pet'
$bundled=Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$portable=Join-Path $petRoot 'runtime\node\node.exe'
$petNode=if(Test-Path -LiteralPath $portable){$portable}elseif(Test-Path -LiteralPath $bundled){$bundled}else{(Get-Command node -ErrorAction Stop).Source}
if($Action -eq 'prepare') { & $petNode (Join-Path $petRoot 'scripts\prepare-jonsbo.mjs') $PSScriptRoot }
elseif($Action -eq 'state') { & $petNode (Join-Path $petRoot 'bridge\cli.mjs') state $State $Message }
else { & $petNode (Join-Path $petRoot 'bridge\cli.mjs') $Action }
exit $LASTEXITCODE
