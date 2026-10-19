param(
    [string[]] $Refs,
    [ValidateSet('main', 'academy')]
    [string] $Version,
    [switch] $AcademyPreview,
    [string] $EvidencePath,
    [int] $FirstPort = 4173,
    [switch] $NoBrowser,
    [switch] $SmokeTest,
    [switch] $WithBackend,
    [int] $FirstApiPort = 8000,
    [int] $FirstMailPort = 8025
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('Stratino-local-' + [guid]::NewGuid().ToString('N'))
$serverScript = Join-Path $repoRoot 'scripts/serve.mjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm -ErrorAction SilentlyContinue
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$refreshBranch = $null

if ($Version -and $Refs -and $Refs.Count -gt 0) {
    throw 'Choose a version with -Version or provide explicit refs with -Refs, not both.'
}
if ($Version) {
    $Refs = switch ($Version) {
        'main' { @('main') }
        'academy' { @('feat/stratino-academy') }
    }
    $refreshBranch = if ($Version -eq 'main') { 'main' } else { 'feat/stratino-academy' }
}
elseif (-not $Refs -or $Refs.Count -eq 0) {
    Write-Host ''
    Write-Host 'کدام نسخه را برای اجرای محلی می‌خواهید؟' -ForegroundColor Cyan
    Write-Host '  1) main — آخرین نسخه سایت کامل همراه با آموزش'
    Write-Host '  2) academy — شاخه آموزشی feat/stratino-academy'
    $choice = (Read-Host 'شماره نسخه را وارد کنید (1 یا 2)').Trim()
    $Refs = switch ($choice) {
        '1' { @('main') }
        '2' { @('feat/stratino-academy') }
        default { throw 'انتخاب نامعتبر بود؛ اسکریپت بدون تغییر مخزن متوقف شد.' }
    }
    $refreshBranch = if ($choice -eq '1') { 'main' } else { 'feat/stratino-academy' }
}

if ($WithBackend) {
    if (-not $dockerCommand) { throw 'Docker was not found. Install and start Docker Desktop, or omit -WithBackend to run the web app only.' }
    & $dockerCommand.Source info --format '{{.ServerVersion}}' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker is not ready. Start Docker Desktop and try again.' }
    & $dockerCommand.Source compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is required. Update Docker Desktop and try again.' }
}

if (-not $nodeCommand) { throw 'Node.js was not found. Install Node.js 22 or newer.' }
if (-not $gitCommand) { throw 'Git was not found. Install Git and try again.' }
if (-not $npmCommand) { throw 'npm was not found. Check your Node.js installation.' }
$nodeVersion = [version]((& $nodeCommand.Source --version).Trim().TrimStart('v'))
if ($nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12 or newer is required. Update Node.js and try again.' }
if (-not (Test-Path $serverScript)) { throw "The local server script was not found: $serverScript" }
if ($Refs.Count -lt 1) { throw 'Provide at least one Git ref, such as main or HEAD.' }
if ($FirstPort -lt 1024 -or $FirstPort -gt 65535) { throw 'FirstPort must be between 1024 and 65535.' }

$worktrees = [Collections.Generic.List[string]]::new()
$servers = [Collections.Generic.List[object]]::new()
$stacks = [Collections.Generic.List[object]]::new()
$urls = [Collections.Generic.List[string]]::new()
$webPorts = [Collections.Generic.List[int]]::new()
$apiPorts = [Collections.Generic.List[int]]::new()
$mailPorts = [Collections.Generic.List[int]]::new()
$usedPorts = [Collections.Generic.HashSet[int]]::new()
$runEvidence = [Collections.Generic.List[object]]::new()

function Save-RunEvidence {
    param([bool] $Stopped)
    if (-not $EvidencePath) { return }
    $fullEvidencePath = [IO.Path]::GetFullPath($EvidencePath)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($fullEvidencePath))
    $payload = @{ runs = @($runEvidence.ToArray()); stopped = $Stopped;
        remainingWorktrees = @($worktrees | Where-Object { Test-Path -LiteralPath $_ });
        runningServers = @($servers | Where-Object { -not $_.Process.HasExited } | ForEach-Object { $_.Process.Id }) }
    [IO.File]::WriteAllText($fullEvidencePath, ($payload | ConvertTo-Json -Depth 8))
}

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
    $started = $false
    try { $listener.Start(); $started = $true; return $true }
    catch { return $false }
    finally { if ($started) { $listener.Stop() } }
}

function Find-FreePort {
    param([int] $StartAt, [Collections.Generic.HashSet[int]] $ReservedPorts)
    for ($candidate = $StartAt; $candidate -le 65535; $candidate++) {
        if ($ReservedPorts.Contains($candidate)) { continue }
        if (Test-PortAvailable -Port $candidate) {
            [void]$ReservedPorts.Add($candidate)
            return $candidate
        }
    }
    throw "No free localhost port was found at or above $StartAt. Choose a different starting port."
}

function Invoke-Compose {
    param($Stack, [string[]] $ComposeArgs)
    $saved = @{}
    try {
        foreach ($key in $Stack.Env.Keys) {
            $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $Stack.Env[$key], 'Process')
        }
        & $dockerCommand.Source compose --env-file $Stack.EnvFile --project-name $Stack.Name -f $Stack.Compose @ComposeArgs
        if ($LASTEXITCODE -ne 0) { throw 'A local service command failed. Check Docker status, port availability, and the service logs.' }
    } finally {
        foreach ($key in $saved.Keys) {
            if ($null -eq $saved[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
        }
    }
}

function New-LocalStack {
    param([int] $Index, [string] $Commit, [string] $Checkout, [int] $WebPort, [int] $ApiPort, [int] $MailPort)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $repoId = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($repoRoot))).Replace('-', '').Substring(0, 12).ToLowerInvariant() }
    finally { $hash.Dispose() }
    $name = "stratino-$repoId-$Index-$($Commit.Substring(0, 8))"
    $state = Join-Path $repoRoot '.local-dev'
    New-Item -ItemType Directory -Path $state -Force | Out-Null
    $envFile = Join-Path $state "$name.env"
    if (-not (Test-Path -LiteralPath $envFile)) {
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $keyBytes = New-Object byte[] 48
            $passwordBytes = New-Object byte[] 32
            $rng.GetBytes($keyBytes)
            $rng.GetBytes($passwordBytes)
            $key = [BitConverter]::ToString($keyBytes).Replace('-', '').ToLowerInvariant()
            $password = [BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
            [IO.File]::WriteAllLines($envFile, @("DJANGO_SECRET_KEY=$key", "POSTGRES_PASSWORD=$password"))
        } finally { $rng.Dispose() }
    }
    $localEnv = @{}
    foreach ($line in [IO.File]::ReadAllLines($envFile)) {
        $parts = $line.Split(@('='), 2)
        if ($parts.Length -eq 2 -and $parts[0] -in @('DJANGO_SECRET_KEY', 'POSTGRES_PASSWORD')) { $localEnv[$parts[0]] = $parts[1] }
    }
    if (-not $localEnv['DJANGO_SECRET_KEY'] -or -not $localEnv['POSTGRES_PASSWORD']) { throw 'Local environment settings are incomplete. Check this version''s file under .local-dev.' }
    $localEnv['API_PORT'] = [string]$ApiPort
    $localEnv['MAILPIT_PORT'] = [string]$MailPort
    $localEnv['STRATINO_PUBLIC_URL'] = "http://127.0.0.1:$WebPort"
    return [pscustomobject]@{Name=$name; EnvFile=$envFile; Env=$localEnv; Compose=(Join-Path $Checkout 'infra/compose.dev.yml')}
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
    if ($stdout) { $details += ("Server output:" + [Environment]::NewLine + $stdout) }
    if ($stderr) { $details += ("Server errors:" + [Environment]::NewLine + $stderr) }
    if ($Server.ProbeError) { $details += "Connection check: $($Server.ProbeError)" }
    if (-not $details.Count) { $details += "Server logs: $($Server.Stdout) and $($Server.Stderr)" }
    return ("The local server did not stay running at $($Server.Url) (PID $($Server.Process.Id))." + [Environment]::NewLine + ($details -join [Environment]::NewLine))
}

try {
    $sourceRefs = @($Refs)
    if ($refreshBranch) {
        $fetchRefspec = "+refs/heads/$($refreshBranch):refs/remotes/origin/$($refreshBranch)"
        Write-Host "Fetching latest origin/$refreshBranch..."
        $fetchOutput = & $gitCommand.Source -C $repoRoot fetch --quiet --no-tags origin $fetchRefspec 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Could not refresh origin/$refreshBranch. Check GitHub access and try again. $($fetchOutput -join [Environment]::NewLine)"
        }
        $sourceRefs = @("origin/$refreshBranch")
    }

    # Validate refs and reserve distinct available localhost ports before creating worktrees.
    $commits = @()
    for ($index = 0; $index -lt $Refs.Count; $index++) {
        $localRef = $sourceRefs[$index]
        try {
            $commit = Invoke-Git -GitArgs @('rev-parse', '--verify', '--end-of-options', "$localRef^{commit}")
        }
        catch {
            if ($refreshBranch) { throw "Latest remote ref $localRef was not found after fetching." }
            $commit = Invoke-Git -GitArgs @('rev-parse', '--verify', '--end-of-options', "origin/$localRef^{commit}")
        }
        $commits += $commit
        $webPorts.Add((Find-FreePort -StartAt ($FirstPort + $index) -ReservedPorts $usedPorts))
        if ($WithBackend) {
            Invoke-Git -GitArgs @('cat-file', '-e', "$($commits[$index]):infra/compose.dev.yml") | Out-Null
            $apiPorts.Add((Find-FreePort -StartAt ($FirstApiPort + $index) -ReservedPorts $usedPorts))
            $mailPorts.Add((Find-FreePort -StartAt ($FirstMailPort + $index) -ReservedPorts $usedPorts))
        }
    }
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    for ($index = 0; $index -lt $Refs.Count; $index++) {
        $ref = $Refs[$index]
        # Keep the integrated Academy visible on main and the standalone Academy branch.
        $previewEnabled = $AcademyPreview -or ($ref -in @('main', 'origin/main', 'feat/stratino-academy', 'origin/feat/stratino-academy'))
        $commit = $commits[$index]
        if (-not $commit) { throw "Git ref was not found: $ref" }

        $safeName = ($ref -replace '[^A-Za-z0-9._-]', '_')
        $worktreePath = Join-Path $tempRoot ("{0}-{1}-{2}" -f $safeName, $commit.Substring(0, 8), [guid]::NewGuid().ToString('N').Substring(0, 6))
        Invoke-Git -GitArgs @('worktree', 'add', '--detach', $worktreePath, $commit) | Out-Null
        $worktrees.Add($worktreePath)

        if ($WithBackend) {
            $stack = New-LocalStack -Index $index -Commit $commit -Checkout $worktreePath -WebPort $webPorts[$index] -ApiPort $apiPorts[$index] -MailPort $mailPorts[$index]
            $stacks.Add($stack)
            Write-Host "Starting local services for $ref..."
            Invoke-Compose -Stack $stack -ComposeArgs @('build', 'api')
            Invoke-Compose -Stack $stack -ComposeArgs @('up', '-d', '--wait', 'db', 'mailpit')
            Invoke-Compose -Stack $stack -ComposeArgs @('run', '--rm', 'api', 'python', 'manage.py', 'migrate', '--noinput')
            Invoke-Compose -Stack $stack -ComposeArgs @('up', '-d', '--wait', 'api')
        }

        Push-Location $worktreePath
        try {
            Write-Host "Building $ref ($($commit.Substring(0, 8)))..."
            if (-not (Test-Path -LiteralPath (Join-Path $worktreePath 'package-lock.json'))) { throw "$ref does not contain package-lock.json; a reproducible install is not possible." }
            & $npmCommand.Source ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed for $ref. Check registry access and the lockfile." }
            $savedPreview = [Environment]::GetEnvironmentVariable('VITE_ACADEMY_PREVIEW', 'Process')
            try {
                [Environment]::SetEnvironmentVariable('VITE_ACADEMY_PREVIEW', $(if ($previewEnabled) { 'true' } else { 'false' }), 'Process')
                & $npmCommand.Source run build
                if ($LASTEXITCODE -ne 0) { throw "The build failed for $ref." }
            } finally {
                [Environment]::SetEnvironmentVariable('VITE_ACADEMY_PREVIEW', $savedPreview, 'Process')
            }
        }
        finally { Pop-Location }

        $port = $webPorts[$index]
        if (-not (Test-PortAvailable -Port $port)) {
            $port = Find-FreePort -StartAt ($port + 1) -ReservedPorts $usedPorts
            $webPorts[$index] = $port
            if ($WithBackend) {
                $stack = $stacks[$index]
                $stack.Env['STRATINO_PUBLIC_URL'] = "http://127.0.0.1:$port"
                Invoke-Compose -Stack $stack -ComposeArgs @('up', '-d', '--wait', '--force-recreate', 'api')
            }
        }
        $distPath = Join-Path $worktreePath 'dist'
        $academyChunks = @(Get-ChildItem -LiteralPath (Join-Path $distPath 'assets') -Filter 'Academy-*.js')
        if ($previewEnabled -and $academyChunks.Count -eq 0) { throw "$ref did not produce the requested Academy preview." }
        if (-not $previewEnabled -and $academyChunks.Count -ne 0) { throw "$ref unexpectedly enabled Academy in a normal build." }
        $arguments = "$(Quote-ProcessArgument $serverScript) $port $(Quote-ProcessArgument $distPath)"
        if ($WithBackend) { $arguments += " $($apiPorts[$index])" }
        $stdout = Join-Path $tempRoot "$safeName-$port.stdout.log"
        $stderr = Join-Path $tempRoot "$safeName-$port.stderr.log"
        Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
        $processOptions = @{FilePath=$nodeCommand.Source; ArgumentList=$arguments; WorkingDirectory=$worktreePath; PassThru=$true; RedirectStandardOutput=$stdout; RedirectStandardError=$stderr}
        if ($env:OS -eq 'Windows_NT') { $processOptions['WindowStyle'] = 'Hidden' }
        $process = Start-Process @processOptions
        $openPath = if ($ref -in @('feat/stratino-academy', 'origin/feat/stratino-academy')) { '/academy' } else { '/' }
        $url = "http://127.0.0.1:$port$openPath"
        $server = [pscustomobject]@{ Process = $process; Url = $url; Stdout = $stdout; Stderr = $stderr; ProbeError = '' }
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
                    $reader = [IO.StreamReader]::new($response.GetResponseStream())
                    try { $html = $reader.ReadToEnd() } finally { $reader.Dispose() }
                    if ([int]$response.StatusCode -eq 200 -and $html -match '<(?:div id="root"|html)') { $ready = $true }
                }
                finally { $response.Close() }
                if ($ready) { break }
            }
            catch { $server.ProbeError = $_.Exception.Message; Start-Sleep -Milliseconds 250 }
        }
        if (-not $ready) { throw (Get-ServerFailure -Server $server) }
        $academyHealthcheck = 'not-enabled'
        if ($previewEnabled) {
            $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$port/academy")
            $request.Proxy = $null
            $request.Timeout = 5000
            $response = $request.GetResponse()
            try {
                if ([int]$response.StatusCode -ne 200) { throw 'The Academy page is not ready.' }
                $academyHealthcheck = 'HTTP 200'
            }
            finally { $response.Close() }
        }
        if ($WithBackend) {
            $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$port/api/v1/health/ready")
            $request.Proxy = $null
            $request.Timeout = 5000
            $response = $request.GetResponse()
            try { if ([int]$response.StatusCode -ne 200) { throw 'The API is not ready.' } }
            finally { $response.Close() }
            Write-Host "API: http://127.0.0.1:$($apiPorts[$index]) | Local email: http://127.0.0.1:$($mailPorts[$index])"
        }

        $urls.Add($url)
        $runEvidence.Add([pscustomobject]@{ ref = $ref; commit = $commit; url = $url;
            academyPreview = [bool]$previewEnabled; academyChunks = $academyChunks.Count; healthcheck = 'HTTP 200';
            academyHealthcheck = $academyHealthcheck; port = $port })
        Write-Host ("{0} ({1}) -> {2}" -f $ref, $commit.Substring(0, 8), $url) -ForegroundColor Cyan
    }

    Save-RunEvidence -Stopped $false

    if ($SmokeTest) { Write-Host 'Smoke test passed. The local servers will now shut down.' -ForegroundColor Green; return }

    if (-not $NoBrowser) {
        foreach ($url in $urls) { Start-Process $url }
    }

    Write-Host 'Press Ctrl+C to stop the local servers.' -ForegroundColor Green
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
        if (-not $server.Process.HasExited) {
            Stop-Process -Id $server.Process.Id -Force -ErrorAction SilentlyContinue
            [void]$server.Process.WaitForExit(5000)
        }
    }
    foreach ($stack in $stacks) {
        try { Invoke-Compose -Stack $stack -ComposeArgs @('down', '--timeout', '5') }
        catch { Write-Warning "Could not stop local services for $($stack.Name). Check Docker." }
    }
    foreach ($worktree in $worktrees) {
        $resolved = [IO.Path]::GetFullPath($worktree)
        $allowed = [IO.Path]::GetFullPath($tempRoot) + [IO.Path]::DirectorySeparatorChar
        if (-not $resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup resolved outside this run''s temporary directory.' }
        # Unlink npm's workspace junctions without traversing or deleting their targets.
        # Git's recursive removal otherwise reaches a dangling junction on Windows.
        $workspaceLinks = Join-Path $resolved 'node_modules/@stratino'
        foreach ($name in @('web', 'domain', 'ui')) {
            $link = Get-Item -LiteralPath (Join-Path $workspaceLinks $name) -Force -ErrorAction SilentlyContinue
            if ($link -and ($link.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
                [IO.Directory]::Delete($link.FullName)
            }
        }
        $cleanupResult = & $gitCommand.Source -c core.longpaths=true -C $repoRoot worktree remove --force $resolved 2>&1
        $cleanupExit = $LASTEXITCODE
        if ($cleanupExit -ne 0 -and (Test-Path -LiteralPath $resolved)) { Write-Warning "Could not remove the temporary worktree; it was kept for inspection: $resolved ($cleanupResult)" }
    }
    Write-Host "Run logs and temporary files: $tempRoot"
    Save-RunEvidence -Stopped $true
}
