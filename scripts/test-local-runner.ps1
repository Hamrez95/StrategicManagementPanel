$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $repo 'run-local.ps1'
$before = (& git -C $repo status --porcelain) -join "`n"
$trees = (& git -C $repo worktree list --porcelain) -join "`n"
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18472)
try {
    $listener.Start()
    $failed = $false
    try { & $runner -Version main -FirstPort 18472 -NoBrowser -SmokeTest }
    catch { $failed = $_.Exception.Message -match 'No free localhost port was found at or above 18472' }
    if (-not $failed) { throw 'The main selection did not resolve or the occupied port did not fail before install/build.' }
    $failed = $false
    try { & $runner -Version academy -FirstPort 18472 -NoBrowser -SmokeTest }
    catch { $failed = $_.Exception.Message -match 'No free localhost port was found at or above 18472' }
    if (-not $failed) { throw 'The academy selection did not resolve or the occupied port did not fail before install/build.' }
} finally { $listener.Stop() }
$failed = $false
try { & $runner -Refs 'stratino-ref-that-does-not-exist' -NoBrowser -SmokeTest }
catch { $failed = $_.Exception.Message -match 'Git failed' }
if (-not $failed) { throw 'Invalid ref was not rejected.' }
$failed = $false
try { & $runner -Version main -Refs HEAD -FirstPort 18472 -NoBrowser -SmokeTest }
catch { $failed = $_.Exception.Message -match 'Choose a version with -Version' }
if (-not $failed) { throw 'Conflicting version and ref selectors were not rejected.' }
if (((& git -C $repo worktree list --porcelain) -join "`n") -ne $trees) { throw 'Preflight changed registered worktrees.' }
if (((& git -C $repo status --porcelain) -join "`n") -ne $before) { throw 'Preflight changed the working tree.' }
Write-Host 'PASS: occupied port and invalid ref fail without modifying the working tree.'
