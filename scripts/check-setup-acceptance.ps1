# Run inside a disposable Windows account/VM. Read-only checks; writes evidence only.
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Baseline','Cancelled','Installed','Reinstalled','RepairPrepared','Repaired','UninstallCancelled','Uninstalled')]
    [string]$Stage,
    [string]$EvidenceRoot = (Join-Path $PSScriptRoot 'evidence'),
    [string]$InstallRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs/NextExplorer'),
    [string]$PersonalFile
)
$ErrorActionPreference = 'Stop'
function Require([bool]$Ok, [string]$Message) { if (!$Ok) { throw $Message } }
function Hash([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
    return $null
}
function Snapshot {
    $registrations = [ordered]@{}
    foreach ($browser in @('Google\Chrome','Microsoft\Edge','Chromium')) {
        $key = 'HKCU:\Software\' + $browser + '\NativeMessagingHosts\com.local.file_explorer'
        $registrations[$browser] = if (Test-Path -LiteralPath $key) { (Get-Item -LiteralPath $key).GetValue('') } else { $null }
    }
    $files = @()
    if (Test-Path -LiteralPath $InstallRoot) {
        $files = @(Get-ChildItem -LiteralPath $InstallRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
            [ordered]@{ path = $_.FullName.Substring($InstallRoot.Length); hash = (Hash $_.FullName) }
        })
    }
    return [ordered]@{ registrations = $registrations; files = $files; personalHash = (Hash $PersonalFile) }
}
function Read-Evidence([string]$Name) {
    $path = Join-Path $EvidenceRoot ($Name + '.json')
    Require (Test-Path -LiteralPath $path) ('Missing prerequisite: ' + $Name)
    return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function Same($Left, $Right) { return (($Left | ConvertTo-Json -Depth 12 -Compress) -ceq ($Right | ConvertTo-Json -Depth 12 -Compress)) }

$InstallRoot = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
Require (!$EvidenceRoot.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase) -and $EvidenceRoot -ne $InstallRoot) 'Evidence must be outside installation'
if ($Stage -eq 'Baseline') {
    Require (!(Test-Path -LiteralPath (Join-Path $EvidenceRoot 'Baseline.json'))) 'Baseline already recorded: use a new evidence directory'
    Require ($PersonalFile -and (Test-Path -LiteralPath $PersonalFile -PathType Leaf)) 'Provide a disposable personal sentinel file with -PersonalFile'
    $PersonalFile = [IO.Path]::GetFullPath($PersonalFile)
    Require (!$PersonalFile.StartsWith($InstallRoot + '\', [StringComparison]::OrdinalIgnoreCase)) 'Sentinel must be outside installation'
    Require (!(Test-Path -LiteralPath $InstallRoot)) 'Baseline requires a clean disposable account; installation already exists'
} else {
    $baseline = Read-Evidence 'Baseline'
    Require ($baseline.installRoot -eq $InstallRoot) 'Installation differs from baseline'
    $PersonalFile = $baseline.personalFile
}
$snapshot = Snapshot
if ($Stage -eq 'Baseline') {
    foreach ($value in $snapshot.registrations.Values) { Require (!$value) 'Baseline requires no existing browser registrations' }
} else {
    Require ($snapshot.personalHash -eq $baseline.snapshot.personalHash) 'Personal sentinel changed or disappeared'
}
$manifestPath = Join-Path $InstallRoot 'com.local.file_explorer.json'
switch ($Stage) {
    'Cancelled' { Require (Same $snapshot $baseline.snapshot) 'Cancellation changed registry or installation files' }
    { $_ -in @('Installed','Reinstalled','Repaired') } {
        if ($Stage -eq 'Reinstalled') { $previous = Read-Evidence 'Installed' }
        if ($Stage -eq 'Repaired') { $null = Read-Evidence 'RepairPrepared' }
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $id = (Get-Content -LiteralPath (Join-Path $InstallRoot 'package/extension-id.txt') -Raw).Trim()
        Require ($manifest.name -eq 'com.local.file_explorer' -and $manifest.type -eq 'stdio') 'Invalid manifest'
        Require ($manifest.allowed_origins.Count -eq 1 -and $manifest.allowed_origins[0] -eq ('chrome-extension://' + $id + '/')) 'Invalid origin'
        $binary = [IO.Path]::GetFullPath($manifest.path)
        Require ($binary.StartsWith((Join-Path $InstallRoot 'versions') + '\', [StringComparison]::OrdinalIgnoreCase)) 'Companion outside versions directory'
        Require (Test-Path -LiteralPath $binary -PathType Leaf) 'Installed companion missing'
        Require ((Hash $binary) -eq (Hash (Join-Path $InstallRoot 'package/native/native-host.exe'))) 'Companion differs from packaged binary'
        Require ($snapshot.registrations['Google\Chrome'] -eq $manifestPath) 'Chrome registration mismatch'
        foreach ($browser in @('Microsoft\Edge','Chromium')) { Require (!$snapshot.registrations[$browser]) 'Unselected browser registration changed' }
        foreach ($file in @('NextExplorer-Maintenance.exe','unins000.exe','package/dist/manifest.json')) {
            Require (Test-Path -LiteralPath (Join-Path $InstallRoot $file) -PathType Leaf) ('Missing installed file: ' + $file)
        }
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $InstallRoot 'package/scripts/diagnose-host.ps1') -Browser Chrome -ExtensionId $id -Json | Out-Null
        Require ($LASTEXITCODE -eq 0) 'Installed diagnostic failed'
        if ($Stage -eq 'Reinstalled') {
            $oldVersions = @($previous.snapshot.files | Where-Object { $_.path -like '\versions\*' })
            $newVersions = @($snapshot.files | Where-Object { $_.path -like '\versions\*' })
            Require (Same $oldVersions $newVersions) 'Healthy reinstall changed runtime versions'
        }
    }
    'RepairPrepared' {
        $null = Read-Evidence 'Installed'
        Require (!(Test-Path -LiteralPath $manifestPath)) 'Repair scenario requires the stable manifest to be renamed first'
        Require (Test-Path -LiteralPath ($manifestPath + '.recipe-backup')) 'Missing repair backup'
    }
    'UninstallCancelled' {
        $repaired = Read-Evidence 'Repaired'
        Require (Same $snapshot $repaired.snapshot) 'Cancelled uninstall changed registry or files'
    }
    'Uninstalled' {
        $repaired = Read-Evidence 'Repaired'
        foreach ($value in $snapshot.registrations.Values) { Require (!$value) 'Browser registration remains' }
        Require (!(Test-Path -LiteralPath (Join-Path $InstallRoot 'package'))) 'Package remains'
        Require (!(Test-Path -LiteralPath (Join-Path $InstallRoot 'NextExplorer-Maintenance.exe'))) 'Maintenance executable remains'
        Require (!(Test-Path -LiteralPath (Join-Path $InstallRoot 'unins000.exe'))) 'Uninstaller remains'
        foreach ($file in $repaired.snapshot.files | Where-Object { $_.path -like '\versions\*' -or $_.path -like '\backups\*' }) {
            Require ((Hash ($InstallRoot + $file.path)) -eq $file.hash) ('Retained data changed: ' + $file.path)
        }
    }
}
New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null
$report = [ordered]@{ stage = $Stage; time = [DateTime]::UtcNow.ToString('o'); installRoot = $InstallRoot; personalFile = $PersonalFile; snapshot = $snapshot; browserConnection = 'Not verified by this checker' }
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $EvidenceRoot ($Stage + '.json')) -Encoding UTF8
Write-Output ($Stage + ': PASS (filesystem/registry only; browser connection requires separate evidence)')
