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
$servers = [Collections.Generic.List[object]]::new()
$urls = [Collections.Generic.List[string]]::new()
$usedPorts = [Collections.Generic.HashSet[int]]::new()

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

function Test-PortAvailable {
    param([int] $Port)
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start(); return $true }
    catch { return $false }
    finally { $listener.Stop() }
}

function Get-ServerLog {
    param([string] $Path)
    if (Test-Path $Path) { return ((Get-Content -Path $Path -Tail 30 -ErrorAction SilentlyContinue) -join [Environment]::NewLine) }
    return ''
}

function Get-ServerFailure {
    param($Server)
    $details = @()
    $stdout = Get-ServerLog -Path $Server.Stdout
    $stderr = Get-ServerLog -Path $Server.Stderr
    if ($stdout) { $details += ("خروجی سرور:" + [Environment]::NewLine + $stdout) }
    if ($stderr) { $details += ("خطای سرور:" + [Environment]::NewLine + $stderr) }
    if (-not $details.Count) { $details += "گزارش سرور: $($Server.Stdout) و $($Server.Stderr)" }
    return ("سرور محلی روی $($Server.Url) بالا نماند (PID $($Server.Process.Id))." + [Environment]::NewLine + ($details -join [Environment]::NewLine))
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
        while ($usedPorts.Contains($port) -or -not (Test-PortAvailable -Port $port)) {
            $port++
            if ($port -gt 65535) { throw 'پورت آزاد برای اجرای سرور محلی پیدا نشد.' }
        }
        [void]$usedPorts.Add($port)
        $distPath = Join-Path $worktreePath 'dist'
        $arguments = "$(Quote-ProcessArgument $serverScript) $port $(Quote-ProcessArgument $distPath)"
        $stdout = Join-Path $tempRoot "$safeName-$port.stdout.log"
        $stderr = Join-Path $tempRoot "$safeName-$port.stderr.log"
        Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
        $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $arguments -WorkingDirectory $worktreePath -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $url = "http://localhost:$port"
        $server = [pscustomobject]@{ Process = $process; Url = $url; Stdout = $stdout; Stderr = $stderr }
        $servers.Add($server)

        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $process.Refresh()
            if ($process.HasExited) { throw (Get-ServerFailure -Server $server) }
            try {
                $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$port/")
                $request.Proxy = $null
                $request.Timeout = 1000
                $response = $request.GetResponse()
                try {
                    if ([int]$response.StatusCode -eq 200) { $ready = $true }
                }
                finally { $response.Close() }
                if ($ready) { break }
            }
            catch { Start-Sleep -Milliseconds 250 }
        }
        if (-not $ready) { throw (Get-ServerFailure -Server $server) }

        $urls.Add($url)
        Write-Host ("{0} ({1}) -> {2}" -f $ref, $commit.Substring(0, 8), $url) -ForegroundColor Cyan
    }

    if (-not $NoBrowser) {
        foreach ($url in $urls) { Start-Process $url }
    }

    Write-Host 'برای بستن سرورها Ctrl+C را بزنید.' -ForegroundColor Green
    while ($true) {
        foreach ($server in $servers) {
            $server.Process.Refresh()
            if ($server.Process.HasExited) { throw (Get-ServerFailure -Server $server) }
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($server in $servers) {
        $server.Process.Refresh()
        if (-not $server.Process.HasExited) { Stop-Process -Id $server.Process.Id -Force -ErrorAction SilentlyContinue }
    }
    foreach ($worktree in $worktrees) {
        & $gitCommand.Source -C $repoRoot worktree remove --force $worktree 2>$null | Out-Null
    }
    & $gitCommand.Source -C $repoRoot worktree prune 2>$null | Out-Null
}
