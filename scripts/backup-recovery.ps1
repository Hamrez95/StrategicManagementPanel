[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$DbContainer,
  [Parameter(Mandatory)][string]$ApiContainer,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [string]$Database = 'stratino',
  [string]$DbUser = 'stratino',
  [switch]$StopApiForSnapshot,
  [switch]$TestRestore
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $StopApiForSnapshot) { throw 'Pass -StopApiForSnapshot after arranging a write-maintenance window; all external writers must also be stopped.' }
foreach ($name in @($DbContainer, $ApiContainer, $Database, $DbUser)) {
  if ($name -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') { throw 'Invalid container/database identifier' }
}
if ($DbContainer -eq $ApiContainer) { throw 'Database and API containers must be distinct' }
function Invoke-CheckedDocker {
  $result = & docker @args
  if ($LASTEXITCODE -ne 0) { throw 'Docker backup/recovery operation failed; source data must be retained.' }
  return $result
}
function Wait-ApiReady {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $health = Invoke-CheckedDocker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' $ApiContainer
    if ($health -eq 'healthy') { return }
    if ($health -in @('missing', 'unhealthy')) { throw 'API restart health is not confirmed; inspect the owned service.' }
    Start-Sleep -Seconds 1
  }
  throw 'API did not become healthy after the snapshot window.'
}
$dbProject = Invoke-CheckedDocker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $DbContainer
$apiProject = Invoke-CheckedDocker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $ApiContainer
if (-not $dbProject -or $dbProject -ne $apiProject) { throw 'Containers must belong to the same explicit Compose project' }
$apiImage = Invoke-CheckedDocker inspect --format '{{.Image}}' $ApiContainer
$apiWasRunning = (Invoke-CheckedDocker inspect --format '{{.State.Running}}' $ApiContainer) -eq 'true'
$privateTool = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../apps/api/scripts/private_file_snapshot.py'))
if (-not (Test-Path -LiteralPath $privateTool -PathType Leaf)) { throw 'Private-file snapshot tool missing' }
$outputCandidate = if ([IO.Path]::IsPathRooted($OutputDirectory)) { $OutputDirectory } else { Join-Path (Get-Location).Path $OutputDirectory }
$backupDirectory = [IO.Path]::GetFullPath($outputCandidate)
if (Test-Path -LiteralPath $backupDirectory) { throw 'Backup destination must not already exist' }
New-Item -ItemType Directory -Path $backupDirectory | Out-Null
if ([Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT) {
  $ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $folderSecurity = New-Object Security.AccessControl.DirectorySecurity
  $folderSecurity.SetOwner($ownerSid)
  $folderSecurity.SetAccessRuleProtection($true, $false)
  foreach ($sid in @($ownerSid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $folderSecurity.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $backupDirectory -AclObject $folderSecurity
} else {
  [IO.File]::SetUnixFileMode($backupDirectory, [IO.UnixFileMode]'UserRead,UserWrite,UserExecute')
}
$runId = [Guid]::NewGuid().ToString('N')
$dumpPath = '/tmp/stratino-backup-' + $runId + '.dump'
$restoreDatabase = 'stratino_restore_drill_' + $runId.Substring(0, 8)
if ($restoreDatabase -eq $Database -or $restoreDatabase -notmatch '^stratino_restore_drill_[a-f0-9]{8}$') { throw 'Unsafe recovery target' }
$identitySql = "SELECT json_build_object('users', (SELECT count(*) FROM accounts_user), 'user_ids', (SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM accounts_user), 'workspaces', (SELECT count(*) FROM workspaces_workspace), 'workspace_ids', (SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM workspaces_workspace), 'academy_subscriptions', (SELECT count(*) FROM academy_academysubscription), 'subscription_ids', (SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM academy_academysubscription), 'audit_events', (SELECT count(*) FROM operations_operatoractionevent), 'audit_ids', (SELECT md5(string_agg(id::text, ',' ORDER BY id::text)) FROM operations_operatoractionevent));"
$restartRequired = $false
$scratchCreated = $false
$receipt = @{ schema_version = 1; captured_at = [DateTimeOffset]::UtcNow.ToString('o'); consistent_writer_stop = $false; restore_verified = $false }
try {
  try {
    if ($apiWasRunning) {
      $restartRequired = $true
      Invoke-CheckedDocker stop --time 30 $ApiContainer | Out-Null
    }
    $receipt.consistent_writer_stop = $true
    $sourceIdentity = Invoke-CheckedDocker exec $DbContainer psql -U $DbUser -d $Database -Atc $identitySql
    Invoke-CheckedDocker exec $DbContainer sh -c 'umask 077; exec pg_dump "$@"' sh -U $DbUser -d $Database -Fc -f $dumpPath | Out-Null
    Invoke-CheckedDocker cp "${DbContainer}:$dumpPath" (Join-Path $backupDirectory 'database.dump') | Out-Null
    # Docker can copy a stopped container's mounted volume without resuming writers.
    Invoke-CheckedDocker cp "${ApiContainer}:/private-files" (Join-Path $backupDirectory 'files') | Out-Null
  } finally {
    if ($restartRequired) {
      Invoke-CheckedDocker start $ApiContainer | Out-Null
      $restartRequired = $false
      Wait-ApiReady
    }
  }
  $fileToolArgs = @('run', '--rm', '--network', 'none', '--user', '0', '--mount', "type=bind,source=$backupDirectory,target=/snapshot", '--mount', "type=bind,source=$privateTool,target=/snapshot-tool.py,readonly", '--entrypoint', 'python', $apiImage, '/snapshot-tool.py')
  $capture = Invoke-CheckedDocker @fileToolArgs create --root /snapshot/files --output /snapshot/private-files.tar.gz --quiesced
  $receipt.files = ($capture -join "`n") | ConvertFrom-Json
  $receipt.database_sha256 = (Get-FileHash -LiteralPath (Join-Path $backupDirectory 'database.dump') -Algorithm SHA256).Hash.ToLowerInvariant()
  $receipt.files_sha256 = (Get-FileHash -LiteralPath (Join-Path $backupDirectory 'private-files.tar.gz') -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($TestRestore) {
    if (-not $apiWasRunning) { throw 'Restore audit needs the source API container running; snapshot was captured safely.' }
    Invoke-CheckedDocker exec $DbContainer createdb -U $DbUser $restoreDatabase | Out-Null
    $scratchCreated = $true
    Invoke-CheckedDocker exec $DbContainer pg_restore -U $DbUser -d $restoreDatabase --exit-on-error --no-owner --no-privileges $dumpPath | Out-Null
    $restoredIdentity = Invoke-CheckedDocker exec $DbContainer psql -U $DbUser -d $restoreDatabase -Atc $identitySql
    if ($restoredIdentity -ne $sourceIdentity) { throw 'Restored key record counts/IDs do not match the snapshot' }
    Invoke-CheckedDocker exec -e "POSTGRES_DB=$restoreDatabase" $ApiContainer python manage.py migrate --noinput | Out-Null
    $audit = Invoke-CheckedDocker exec -e "POSTGRES_DB=$restoreDatabase" $ApiContainer python manage.py audit_model_integrity --summary
    $receipt.model_audit = ($audit -join "`n") | ConvertFrom-Json
    if ($receipt.model_audit.violations -ne 0 -or $receipt.model_audit.database_guards.missing.Count -ne 0) { throw 'Restored database integrity audit failed' }
    $restoredFiles = Invoke-CheckedDocker @fileToolArgs restore --archive /snapshot/private-files.tar.gz --destination /snapshot/restored-files
    $receipt.restored_files = ($restoredFiles -join "`n") | ConvertFrom-Json
    $receipt.restore_verified = $true
    $receipt.identity_counts_equal = $true
  }
  $receipt.completed_at = [DateTimeOffset]::UtcNow.ToString('o')
  $receipt | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $backupDirectory 'receipt.json') -Encoding utf8
  Write-Output 'PASS: backup captured; inspect the private receipt for the exact restore evidence and file count.'
} finally {
  if ($restartRequired) { Invoke-CheckedDocker start $ApiContainer | Out-Null }
  if ($scratchCreated) { Invoke-CheckedDocker exec $DbContainer dropdb -U $DbUser $restoreDatabase | Out-Null }
  Invoke-CheckedDocker exec $DbContainer rm -f -- $dumpPath | Out-Null
}
