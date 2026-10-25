# Disposable CI only. Never remove a developer's retained volumes.
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This destructive synthetic fixture is restricted to GitHub Actions.' }
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runner = Join-Path $repo 'run-local.ps1'
$before = (& git -C $repo worktree list --porcelain) -join "`n"
$states = @()
function Invoke-FixtureCompose {
    param($State, [string[]] $Arguments)
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($State.FullName)) {
        $parts = $line.Split(@('='), 2)
        if ($parts.Length -eq 2) { $values[$parts[0]] = $parts[1] }
    }
    $slot = [Array]::IndexOf($states, $State)
    $values['API_PORT'] = [string](8000 + $slot)
    $values['MAILPIT_PORT'] = [string](8025 + $slot)
    $saved = @{}
    try {
        foreach ($key in $values.Keys) {
            $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
            [Environment]::SetEnvironmentVariable($key, $values[$key], 'Process')
        }
        & docker compose --env-file $State.FullName --project-name $State.BaseName -f (Join-Path $repo 'infra/compose.dev.yml') @Arguments
        if ($LASTEXITCODE -ne 0) { throw 'Synthetic Compose fixture failed.' }
    } finally {
        foreach ($key in $saved.Keys) {
            if ($null -eq $saved[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
        }
    }
}
try {
    & $runner -Refs @('HEAD', 'feat/stratino-academy') -WithBackend -NoBrowser -SmokeTest
    $states = @(Get-ChildItem -LiteralPath (Join-Path $repo '.local-dev') -Filter '*.env' | Sort-Object Name)
    if ($states.Count -ne 2) { throw 'Expected two independent stack identities.' }
    if (((& git -C $repo worktree list --porcelain) -join "`n") -ne $before) { throw 'Runner left registered worktrees.' }
    foreach ($state in $states) {
        $containers = & docker ps -q --filter "label=com.docker.compose.project=$($state.BaseName)"
        if ($containers) { throw 'Runner left live containers.' }
        Invoke-FixtureCompose $state @('up', '-d', '--wait', 'db', 'mailpit')
    }
    $write = "import os,django; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); from modules.accounts.models import User; from django.core.files.storage import default_storage; from django.core.files.base import ContentFile; User.objects.create_user('synthetic-runner@stratino.invalid'); assert default_storage.save('runner.txt',ContentFile(b'synthetic bytes'))=='runner.txt'"
    $absent = "import os,django; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); from modules.accounts.models import User; from django.core.files.storage import default_storage; assert not User.objects.filter(email='synthetic-runner@stratino.invalid').exists(); assert not default_storage.exists('runner.txt')"
    $retained = "import os,django; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings'); django.setup(); from modules.accounts.models import User; from django.core.files.storage import default_storage; assert User.objects.filter(email='synthetic-runner@stratino.invalid').exists(); assert default_storage.open('runner.txt','rb').read()==b'synthetic bytes'"
    Invoke-FixtureCompose $states[0] @('run', '--rm', 'api', 'python', '-c', $write)
    Invoke-FixtureCompose $states[1] @('run', '--rm', 'api', 'python', '-c', $absent)
    foreach ($state in $states) { Invoke-FixtureCompose $state @('down') }
    & $runner -Refs @('HEAD', 'feat/stratino-academy') -WithBackend -NoBrowser -SmokeTest
    foreach ($state in $states) { Invoke-FixtureCompose $state @('up', '-d', '--wait', 'db', 'mailpit') }
    Invoke-FixtureCompose $states[0] @('run', '--rm', 'api', 'python', '-c', $retained)
    Invoke-FixtureCompose $states[1] @('run', '--rm', 'api', 'python', '-c', $absent)
    Write-Host 'PASS: two refs have isolated persistent DB/files; repeated runs stop containers and checkouts.'
} finally {
    foreach ($state in $states) { Invoke-FixtureCompose $state @('down', '--volumes') }
}
