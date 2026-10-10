# Windows installation logic, also used by isolated tests (PowerShell 5.1).
$hostManifestName = 'com.local.file_explorer.json'
$hostBrowsers = @('Google\Chrome', 'Microsoft\Edge', 'Chromium')

function Get-HostRegistration([string]$Browser) {
    $key = 'HKCU:\Software\' + $Browser + '\NativeMessagingHosts\com.local.file_explorer'
    if (Test-Path -LiteralPath $key) { return (Get-Item -LiteralPath $key).GetValue('') }
    return $null
}
function Set-HostRegistration([string]$Browser, [string]$Manifest) {
    $key = 'HKCU:\Software\' + $Browser + '\NativeMessagingHosts\com.local.file_explorer'
    New-Item -Path $key -Force | Out-Null
    Set-Item -LiteralPath $key -Value $Manifest
}
function Remove-HostRegistration([string]$Browser) {
    $key = 'HKCU:\Software\' + $Browser + '\NativeMessagingHosts\com.local.file_explorer'
    if (Test-Path -LiteralPath $key) { Remove-Item -LiteralPath $key }
}
function Write-HostBytes([string]$Path, [byte[]]$Bytes) {
    $temporary = $Path + '.' + [guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllBytes($temporary, $Bytes)
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
    else { [IO.File]::Move($temporary, $Path) }
}
function Write-HostManifest([string]$Path, [string]$Json) {
    Write-HostBytes $Path ([Text.Encoding]::UTF8.GetBytes($Json))
}

function Install-NextExplorerHost(
    [string]$SourceRoot, [string]$InstallRoot, [string]$ExtensionId,
    [string[]]$Browsers = $hostBrowsers, [switch]$Repair,
    [string]$RecoveryDirectory, [hashtable]$ExpectedRegistrations
) {
    if ($ExtensionId -cnotmatch '^[a-p]{32}$') { throw 'ID Chrome invalide (32 lettres a-p).' }
    $source = Join-Path $SourceRoot 'native'
    $binary = Join-Path $source 'native-host.exe'
    $policy = Join-Path $source 'security/policy.xml'
    if (!(Test-Path -LiteralPath $binary -PathType Leaf)) { throw 'Compagnon absent du paquet. Compilez-le avec npm run native:build.' }
    if (!(Test-Path -LiteralPath $policy -PathType Leaf)) { throw 'Politique de securite absente du paquet (native/security/policy.xml).' }
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
    $manifestPath = Join-Path $InstallRoot $hostManifestName
    $versions = Join-Path $InstallRoot 'versions'
    $previous = $null
    $previousBytes = $null
    $previousDirectory = $null
    if (Test-Path -LiteralPath $manifestPath) {
        $previousBytes = [IO.File]::ReadAllBytes($manifestPath)
        $previous = [IO.File]::ReadAllText($manifestPath)
        if (!$Repair) {
        $old = $previous | ConvertFrom-Json
        $oldBinary = [IO.Path]::GetFullPath($old.path)
        $prefix = $versions.TrimEnd('\') + '\'
        if ($old.name -ne 'com.local.file_explorer' -or !$oldBinary.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Le manifeste existant ne correspond pas a cette installation. Aucun remplacement effectue.'
        }
        $previousDirectory = Split-Path $oldBinary -Parent
        }
    }
    if ($Repair) { $previousDirectory = $RecoveryDirectory }
    # Prepare a new copy without replacing a potentially running executable.
    $destination = Join-Path $versions ([guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -LiteralPath $binary -Destination (Join-Path $destination 'native-host.exe')
    if ((Get-FileHash -LiteralPath $binary).Hash -ne (Get-FileHash -LiteralPath (Join-Path $destination 'native-host.exe')).Hash) {
        throw 'Verification de la copie du compagnon echouee.'
    }
    Copy-Item -LiteralPath (Join-Path $source 'security') -Destination (Join-Path $destination 'security') -Recurse
    # Keep existing engines even when the new package has no engines.
    if ($previousDirectory -and (Test-Path -LiteralPath (Join-Path $previousDirectory 'tools') -PathType Container)) {
        Copy-Item -LiteralPath (Join-Path $previousDirectory 'tools') -Destination (Join-Path $destination 'tools') -Recurse
    }
    $sourceTools = Join-Path $source 'tools'
    if (Test-Path -LiteralPath $sourceTools -PathType Container) {
        $targetTools = Join-Path $destination 'tools'
        New-Item -ItemType Directory -Path $targetTools -Force | Out-Null
        foreach ($item in Get-ChildItem -LiteralPath $sourceTools -Force) {
            Copy-Item -LiteralPath $item.FullName -Destination $targetTools -Recurse -Force
        }
    }
    $manifest = @{
        name = 'com.local.file_explorer'; description = 'NextExplorer Native Host'
        path = (Join-Path $destination 'native-host.exe'); type = 'stdio'
        allowed_origins = @('chrome-extension://' + $ExtensionId + '/')
    } | ConvertTo-Json -Depth 5
    # The native host validates its origin using the adjacent manifest too.
    Write-HostManifest (Join-Path $destination $hostManifestName) $manifest
    $registrations = @{}
    foreach ($browser in $Browsers) {
        $registrations[$browser] = Get-HostRegistration $browser
        if ($ExpectedRegistrations -and $registrations[$browser] -cne $ExpectedRegistrations[$browser]) {
            throw 'Enregistrement modifie pendant la preparation. Relancez l apercu de reparation.'
        }
    }
    $current = if (Test-Path -LiteralPath $manifestPath) { [IO.File]::ReadAllText($manifestPath) } else { $null }
    if ($current -cne $previous) { throw 'Manifeste modifie pendant la preparation. Relancez l apercu.' }
    Write-HostManifest $manifestPath $manifest
    $changed = @()
    try {
        foreach ($browser in $Browsers) {
            $changed += $browser
            Set-HostRegistration $browser $manifestPath
        }
    } catch {
        $failure = $_
        $rollbackErrors = @()
        try {
            if ($null -ne $previousBytes) { Write-HostBytes $manifestPath $previousBytes }
            else { Remove-Item -LiteralPath $manifestPath }
        } catch { $rollbackErrors += 'manifeste' }
        foreach ($browser in $changed) {
            try {
            if ($null -ne $registrations[$browser]) { Set-HostRegistration $browser $registrations[$browser] }
            else { Remove-HostRegistration $browser }
            } catch { $rollbackErrors += $browser }
        }
        if ($rollbackErrors.Count) { throw ('Retour arriere incomplet : ' + ($rollbackErrors -join ', ') + '. Consultez la sauvegarde de reparation. Erreur initiale : ' + $failure.Exception.Message) }
        throw $failure
    }
    return $manifestPath
}

function Unregister-NextExplorerHost([string]$InstallRoot, [string]$SourceRoot) {
    $owned = @((Join-Path $InstallRoot $hostManifestName), (Join-Path $SourceRoot ('native/' + $hostManifestName)))
    foreach ($browser in $hostBrowsers) {
        $current = Get-HostRegistration $browser
        if ($current -and $owned -contains $current) { Remove-HostRegistration $browser }
    }
}
