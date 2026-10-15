param([ValidateSet('wake','hide','status','stop','state','prepare')][string]$Action='wake',[string]$State='idle',[string]$Message='')
$ErrorActionPreference='Stop'
if($Action -in @('wake','status','stop','prepare')) { & (Join-Path $PSScriptRoot 'scripts/windows-launcher.ps1') -Mode $Action;exit $LASTEXITCODE }
$headers=@{'X-Pet-Client'='1'}
$event=@{source='chatgpt';action=$(if($Action -eq 'hide'){'hide'}else{'update'});state=$State;message=$Message}
Invoke-RestMethod -Uri 'http://127.0.0.1:19390/event' -Method Post -Headers $headers -ContentType 'application/json' -Body ($event|ConvertTo-Json)
