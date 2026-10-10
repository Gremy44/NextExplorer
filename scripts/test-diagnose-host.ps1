$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
. (Join-Path $PSScriptRoot 'host-diagnostics.ps1')
$project = Split-Path $PSScriptRoot -Parent
$fixture = [IO.Path]::GetFullPath((Join-Path $project ('test-results/diagnostic-' + [guid]::NewGuid().ToString('N'))))
$installed = Join-Path $fixture ('installation privee ' + [char]0xE9)
$source = Join-Path $fixture 'source'
$version = Join-Path $installed ('versions/' + [guid]::NewGuid().ToString('N'))
$binary = Join-Path $version 'native-host.exe'
$stable = Join-Path $installed $hostManifestName
$adjacent = Join-Path $version $hostManifestName
$policy = Join-Path $version 'security/policy.xml'
$id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
$script:registered = @{}
$script:denyRegistry = $false
$script:assertions = 0
function Get-HostRegistration([string]$Browser) {
    if ($script:denyRegistry) { throw ('Access denied to ' + $installed) }
    return $script:registered[$Browser]
}
function Set-HostRegistration { throw 'Diagnostic attempted to write registry' }
function Remove-HostRegistration { throw 'Diagnostic attempted to remove registry entry' }
function Assert([bool]$Condition, [string]$Message) {
    $script:assertions++
    if (!$Condition) { throw $Message }
}
function Save-Json([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))
}
function Reset-Fixture {
    New-Item -ItemType Directory -Path (Split-Path $policy) -Force | Out-Null
    # An intentionally non-executable fixture proves the diagnostic never launches it.
    [IO.File]::WriteAllText($binary, 'not an executable')
    [IO.File]::WriteAllText($policy, '<policymap />')
    $script:manifest = @{
        name = 'com.local.file_explorer'; type = 'stdio'; path = $binary
        allowed_origins = @('chrome-extension://' + $id + '/')
    }
    Save-Json $stable $script:manifest
    Save-Json $adjacent $script:manifest
    $script:registered = @{ 'Google\Chrome' = $stable }
    $script:denyRegistry = $false
}
function Snapshot {
    return @(Get-ChildItem -LiteralPath $fixture -Recurse -File | Sort-Object FullName | ForEach-Object {
        $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash
    }) -join '|'
}
function Diagnose([string]$Browser = 'Chrome') {
    $before = Snapshot
    $registryBefore = $script:registered | ConvertTo-Json -Compress
    $report = Get-NextExplorerDiagnosis $installed $source $id $Browser
    Assert ((Snapshot) -ceq $before) 'Diagnostic modified files'
    Assert (($script:registered | ConvertTo-Json -Compress) -ceq $registryBefore) 'Diagnostic modified registry'
    $json = $report | ConvertTo-Json -Depth 6
    Assert (!$json.Contains('installation privee') -and !$json.Contains($fixture.Replace('\', '\\'))) 'Report leaked paths'
    return $report
}
function Assert-Error($Report, [string]$CheckId) {
    Assert (!$Report.healthy) 'Invalid installation marked healthy'
    Assert (@($Report.checks | Where-Object { $_.id -eq $CheckId -and $_.status -eq 'error' }).Count -eq 1) ('Missing error: ' + $CheckId)
}

Reset-Fixture
$report = Diagnose
Assert $report.healthy 'Valid installation rejected'
Assert (@($report.checks | Where-Object { $_.id -like 'tool-*' }).Count -eq 6) 'Optional engine checks missing'
Assert (@($report.checks | Where-Object { $_.id -eq 'browser-Edge' }).Count -eq 0) 'Unselected browser was checked'
Assert-Error (Diagnose 'All') 'browser-Edge'
foreach ($browser in $hostBrowsers) { $script:registered[$browser] = $stable }
Assert (Diagnose 'All').healthy 'All-browser installation rejected'

Remove-Item -LiteralPath $stable
Assert-Error (Diagnose) 'manifest'
[IO.File]::WriteAllText($stable, 'broken json')
Assert-Error (Diagnose) 'manifest'
foreach ($field in @('name', 'type', 'allowed_origins')) {
    Reset-Fixture
    $script:manifest[$field] = 'invalid'
    Save-Json $stable $script:manifest
    Assert-Error (Diagnose) 'manifest'
}
Reset-Fixture
$script:manifest.allowed_origins = @('chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/')
Save-Json $stable $script:manifest
Assert-Error (Diagnose) 'manifest'

Reset-Fixture
$script:manifest.path = Join-Path $fixture 'outside.exe'
Save-Json $stable $script:manifest
$report = Diagnose
Assert-Error $report 'binary'
Assert (@($report.checks | Where-Object { $_.id -eq 'host-manifest' }).Count -eq 0) 'Diagnostic followed an unexpected binary path'
Reset-Fixture
Remove-Item -LiteralPath $binary
Assert-Error (Diagnose) 'binary'
Reset-Fixture
[IO.File]::WriteAllText($binary, '')
Assert-Error (Diagnose) 'binary'
Reset-Fixture
$script:manifest.path = Join-Path $fixture 'different.exe'
Save-Json $adjacent $script:manifest
Assert-Error (Diagnose) 'host-manifest'
Reset-Fixture
Remove-Item -LiteralPath $policy
Assert-Error (Diagnose) 'policy'

Reset-Fixture
$script:registered = @{}
Assert-Error (Diagnose) 'browser-Chrome'
$script:registered['Google\Chrome'] = Join-Path $source 'native/com.local.file_explorer.json'
Assert-Error (Diagnose) 'browser-Chrome'
$script:registered['Google\Chrome'] = 'C:\private-other-installation\host.json'
Assert-Error (Diagnose) 'browser-Chrome'
$script:registered['Google\Chrome'] = 'relative-manifest.json'
Assert-Error (Diagnose) 'browser-Chrome'
$script:denyRegistry = $true
Assert-Error (Diagnose) 'browser-Chrome'

# The public command emits JSON and a failure exit code for invalid input.
$cli = Join-Path $PSScriptRoot 'diagnose-host.ps1'
$output = & powershell -NoProfile -ExecutionPolicy Bypass -File $cli -ExtensionId INVALID -Json
Assert ($LASTEXITCODE -eq 1) 'CLI failure exit code missing'
$result = $output | ConvertFrom-Json
Assert (!$result.healthy -and $result.schemaVersion -eq 1) 'CLI did not return a structured report'
Write-Output ('Diagnostic: ' + $script:assertions + ' assertions OK; real files, simulated registry, no changes or path disclosure.')
