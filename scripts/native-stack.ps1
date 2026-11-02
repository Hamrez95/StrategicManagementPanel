# Native development helpers. No Docker commands, Windows Services, or machine PATH changes.
function Resolve-NativePython {
    param([string] $RequestedPython, [string] $Checkout)
    $candidates = @($RequestedPython, (Join-Path $repoRoot '.venv/Scripts/python.exe'))
    $command = Get-Command python -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    # Reuse an existing user-installed interpreter as a last resort, never alter its packages.
    $candidates += (Join-Path $env:APPDATA 'uv/tools/graphifyy/Scripts/python.exe')
    $basePython = $null
    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { continue }
        $versionCheck = & $candidate -c 'import sys; assert sys.version_info >= (3,11); assert sys.maxsize > 2**32; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0) { $basePython = ($versionCheck -join '').Trim(); break }
    }
    if (-not $basePython) { throw 'Python 3.11+ x64 is required. Provide -PythonPath or install Python on your own development machine. No system installation was attempted.' }
    $requirements = Join-Path $Checkout 'apps/api/requirements.txt'
    $content = [IO.File]::ReadAllText($requirements) + $basePython
    $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($content))).Substring(0, 16).ToLowerInvariant()
    $venv = Join-Path $repoRoot ".local-dev/native/python-$digest"
    $python = Join-Path $venv 'Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $python)) {
        Write-Host 'Creating a project-local Python environment...'
        & $basePython -m venv $venv | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the project-local Python environment.' }
    }
    $marker = Join-Path $venv '.requirements-ready'
    if (-not (Test-Path -LiteralPath $marker)) {
        Write-Host 'Installing locked API dependencies (first run only)...'
        & $python -m pip install --disable-pip-version-check --require-hashes -r $requirements | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Native Python dependency installation failed. No partial web-only server will be started.' }
        [IO.File]::WriteAllText($marker, $digest)
    }
    return $python
}

function Start-NativeStack {
    param([int] $Index, [string] $Commit, [string] $Checkout, [int] $WebPort, [int] $ApiPort,
          [int] $MailPort, [int] $SmtpPort, [int] $DbPort)
    $python = Resolve-NativePython -RequestedPython $PythonPath -Checkout $Checkout
    $state = Join-Path $repoRoot ".local-dev/native/data/$Index-$Commit"
    [void][IO.Directory]::CreateDirectory($state)
    if ($env:OS -eq 'Windows_NT') {
        # Protect only this project's generated data/secrets, not a machine-wide folder.
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
        # Change only the DACL; replacing an entire security descriptor can require
        # SeSecurityPrivilege when restarting an already protected directory.
        & (Join-Path $env:SystemRoot 'System32/icacls.exe') $state /inheritance:r /grant:r "*$($identity):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to the project-local data directory. No system-wide permission change was attempted.' }
    }
    $ready = Join-Path $tempRoot "native-$Index.ready.json"
    $stop = Join-Path $tempRoot "native-$Index.stop"
    $stdout = Join-Path $tempRoot "native-$Index.stdout.log"
    $stderr = Join-Path $tempRoot "native-$Index.stderr.log"
    $script = Join-Path $repoRoot 'scripts/native-runtime.py'
    $arguments = @($script, 'run', '--state', $state, '--checkout', $Checkout, '--ready', $ready, '--stop', $stop,
        '--web-port', "$WebPort", '--api-port', "$ApiPort", '--mail-port', "$MailPort", '--smtp-port', "$SmtpPort", '--db-port', "$DbPort", '--parent-pid', "$PID")
    if ($ScannerHost) { $arguments += @('--scanner-host', $ScannerHost, '--scanner-port', "$ScannerPort") }
    $options = @{FilePath=$python; ArgumentList=(($arguments | ForEach-Object { Quote-ProcessArgument $_ }) -join ' ');
        WorkingDirectory=$repoRoot; PassThru=$true; RedirectStandardOutput=$stdout; RedirectStandardError=$stderr}
    if ($env:OS -eq 'Windows_NT') { $options.WindowStyle = 'Hidden' }
    $process = Start-Process @options
    return [pscustomobject]@{Process=$process; Python=$python; State=$state; Ready=$ready; Stop=$stop; Stdout=$stdout; Stderr=$stderr; Checkout=$Checkout}
}

function Wait-NativeStack {
    param($Stack)
    $deadline = [DateTime]::UtcNow.AddMinutes(8)
    while ([DateTime]::UtcNow -lt $deadline) {
        $Stack.Process.Refresh()
        if ($Stack.Process.HasExited) {
            throw "Native services failed. $(Get-ServerLog -Path $Stack.Stderr) Service details: $(Join-Path $Stack.State 'services.log')"
        }
        if (Test-Path -LiteralPath $Stack.Ready) { return (Get-Content -LiteralPath $Stack.Ready -Raw | ConvertFrom-Json) }
        Start-Sleep -Milliseconds 300
    }
    throw "Native services did not become ready. Inspect $($Stack.Stdout) and $($Stack.Stderr)."
}

function Stop-NativeStack {
    param($Stack)
    if (-not $Stack.Process.HasExited) {
        [IO.File]::WriteAllText($Stack.Stop, 'stop')
        if (-not $Stack.Process.WaitForExit(55000)) {
            throw "Native services have not stopped. The checkout is retained. Inspect $($Stack.State)."
        }
    }
    if ($Stack.Process.ExitCode -ne 0) { throw "Native runtime exited with an error. The checkout is retained; inspect $($Stack.Stderr)." }
}
