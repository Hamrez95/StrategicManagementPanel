$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $repo 'run-local.ps1'
$before = (& git -C $repo status --porcelain) -join "`n"
$trees = (& git -C $repo worktree list --porcelain) -join "`n"
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18472)
try {
    $listener.Start()
    $failed = $false
    try { & $runner -Refs HEAD -FirstPort 18472 -NoBrowser -SmokeTest }
    catch { $failed = $_.Exception.Message -match '18472.*اشغال' }
    if (-not $failed) { throw 'Occupied port did not fail before install/build.' }
} finally { $listener.Stop() }
$failed = $false
try { & $runner -Refs 'stratino-ref-that-does-not-exist' -NoBrowser -SmokeTest }
catch { $failed = $_.Exception.Message -match 'Git failed' }
if (-not $failed) { throw 'Invalid ref was not rejected.' }
if (((& git -C $repo worktree list --porcelain) -join "`n") -ne $trees) { throw 'Preflight changed registered worktrees.' }
if (((& git -C $repo status --porcelain) -join "`n") -ne $before) { throw 'Preflight changed the working tree.' }
Write-Host 'PASS: occupied port and invalid ref fail without modifying the working tree.'
