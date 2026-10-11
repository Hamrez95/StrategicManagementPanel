param(
    [string[]] $Refs = @('main', 'HEAD'),
    [int] $FirstPort = 4173,
    [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) 'StrategicManagementPanel-local'
$serverScript = Join-Path $repoRoot 'scripts/serve.mjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue

if (-not $nodeCommand) { throw 'Node.js پیدا نشد. Node.js 22 یا جدیدتر را نصب کنید.' }
if (-not $gitCommand) { throw 'Git پیدا نشد. Git را نصب کنید و دوباره اجرا کنید.' }
if (-not $npmCommand) { throw 'npm پیدا نشد. نصب Node.js را بررسی کنید.' }
if (-not (Test-Path $serverScript)) { throw "فایل سرور پیدا نشد: $serverScript" }
if ($Refs.Count -lt 1) { throw 'حداقل یک ref مانند main یا HEAD وارد کنید.' }
if ($FirstPort -lt 1024 -or $FirstPort + $Refs.Count - 1 -gt 65535) {
    throw 'شماره پورت باید در بازه 1024 تا 65535 باشد.'
}

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$worktrees = [Collections.Generic.List[string]]::new()
$servers = [Collections.Generic.List[Diagnostics.Process]]::new()
$urls = [Collections.Generic.List[string]]::new()

function Invoke-Git {
    param([string[]] $GitArgs)
    $result = & $gitCommand.Source -C $repoRoot @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $($result -join [Environment]::NewLine)" }
    return ($result -join [Environment]::NewLine).Trim()
}

function Quote-ProcessArgument {
    param([string] $Value)
    return '"' + $Value.Replace('"', '\"') + '"'
}

try {
    for ($index = 0; $index -lt $Refs.Count; $index++) {
        $ref = $Refs[$index]
        $commit = Invoke-Git -GitArgs @('rev-parse', '--verify', "$ref^{commit}")
        if (-not $commit) { throw "Git ref پیدا نشد: $ref" }

        $safeName = ($ref -replace '[^A-Za-z0-9._-]', '_')
        $worktreePath = Join-Path $tempRoot ("{0}-{1}-{2}" -f $safeName, $commit.Substring(0, 8), [guid]::NewGuid().ToString('N').Substring(0, 6))
        Invoke-Git -GitArgs @('worktree', 'add', '--detach', $worktreePath, $commit) | Out-Null
        $worktrees.Add($worktreePath)

        Push-Location $worktreePath
        try {
            Write-Host "ساخت نسخه $ref ($($commit.Substring(0, 8)))..."
            & $npmCommand.Source run build
            if ($LASTEXITCODE -ne 0) { throw "ساخت نسخه $ref ناموفق بود." }
        }
        finally { Pop-Location }

        $port = $FirstPort + $index
        $distPath = Join-Path $worktreePath 'dist'
        $arguments = "$(Quote-ProcessArgument $serverScript) $port $(Quote-ProcessArgument $distPath)"
        $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $worktreePath -PassThru -WindowStyle Hidden
        $servers.Add($process)
        $url = "http://localhost:$port"
        $urls.Add($url)
        Write-Host ("{0} ({1}) -> {2}" -f $ref, $commit.Substring(0, 8), $url) -ForegroundColor Cyan
    }

    if (-not $NoBrowser) {
        foreach ($url in $urls) { Start-Process $url }
    }

    Write-Host 'برای بستن سرورها Ctrl+C را بزنید.' -ForegroundColor Green
    while ($true) {
        foreach ($server in $servers) {
            if ($server.HasExited) { throw "سرور محلی متوقف شد (PID $($server.Id))." }
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($server in $servers) {
        if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    }
    foreach ($worktree in $worktrees) {
        & $gitCommand.Source -C $repoRoot worktree remove --force $worktree 2>$null | Out-Null
    }
    & $gitCommand.Source -C $repoRoot worktree prune 2>$null | Out-Null
}
