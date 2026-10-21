$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $repo 'run-local.ps1'
$before = (& git -C $repo status --porcelain) -join "`n"
$trees = (& git -C $repo worktree list --porcelain) -join "`n"
$evidenceDir = Join-Path $repo 'test-results/runner'
[void][IO.Directory]::CreateDirectory($evidenceDir)
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 18472)
function Assert-Run {
    param([string] $Name, [string] $Ref, [bool] $Preview, [string] $Path)
    $data = Get-Content -LiteralPath (Join-Path $evidenceDir "$Name.json") -Raw | ConvertFrom-Json
    $expectedCommit = (& git -C $repo rev-parse $Ref).Trim()
    if ($data.runs.Count -ne 1 -or $data.runs[0].commit -ne $expectedCommit) { throw "$Name ran the wrong commit." }
    if ($data.runs[0].academyPreview -ne $Preview) { throw "$Name preview mismatch." }
    if ($data.runs[0].academyChunks -ne [int]$Preview) { throw "$Name bundle mismatch." }
    if ($Preview -and $data.runs[0].academyHealthcheck -ne 'HTTP 200') { throw "$Name Academy route failed healthcheck." }
    if ($data.runs[0].port -eq 18472) { throw "$Name used the occupied port." }
    if ($data.runs[0].healthcheck -ne 'HTTP 200') { throw "$Name failed healthcheck." }
    if (([uri]$data.runs[0].url).AbsolutePath -ne $Path) { throw "$Name opened the wrong route." }
    if (-not $data.stopped -or $data.remainingWorktrees.Count -or $data.runningServers.Count) { throw "$Name cleanup failed." }
    $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, [int]$data.runs[0].port)
    try { $probe.Start() } finally { $probe.Stop() }
}
try {
    $listener.Start()
    foreach ($selection in @(@('menu-main','1','origin/main',$true,'/'), @('menu-academy','2','origin/feat/stratino-academy',$true,'/academy'))) {
        $selection[1] | & (Get-Process -Id $PID).Path -NoProfile -File $runner -FirstPort 18472 -NoBrowser -SmokeTest -EvidencePath (Join-Path $evidenceDir "$($selection[0]).json")
        if ($LASTEXITCODE -ne 0) { throw "$($selection[0]) failed with exit $LASTEXITCODE" }
        Assert-Run -Name $selection[0] -Ref $selection[2] -Preview $selection[3] -Path $selection[4]
    }
    & $runner -Version main -FirstPort 18472 -NoBrowser -SmokeTest -EvidencePath (Join-Path $evidenceDir 'main-version.json')
    Assert-Run -Name 'main-version' -Ref 'origin/main' -Preview $true -Path '/'
} finally { $listener.Stop() }
$failed = $false
try { & $runner -Refs 'stratino-ref-that-does-not-exist' -NoBrowser -SmokeTest }
catch { $failed = $_.Exception.Message -match 'Git failed' }
if (-not $failed) { throw 'Invalid ref was not rejected.' }
$failed = $false
try { & $runner -Version main -Refs HEAD -NoBrowser -SmokeTest }
catch { $failed = $_.Exception.Message -match 'Choose a version with -Version' }
if (-not $failed) { throw 'Conflicting selectors were not rejected.' }
if (((& git -C $repo worktree list --porcelain) -join "`n") -ne $trees) { throw 'The suite changed registered worktrees.' }
if (((& git -C $repo status --porcelain) -join "`n") -ne $before) { throw 'The suite changed working files.' }
Write-Host 'PASS: actual menu selections, latest origin commits, Academy-enabled main, site and Academy route healthchecks, occupied-port fallback, process/worktree cleanup, invalid refs and conflicting selectors.'
