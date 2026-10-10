# Preview first; only Invoke-NextExplorerRepair writes files or registrations.
function Get-NextExplorerRepairPlan(
    [string]$InstallRoot, [string]$SourceRoot, [string]$ExtensionId,
    [ValidateSet('Chrome', 'Edge', 'Chromium', 'All')][string]$Browser = 'Chrome',
    [string]$RecoveryVersion
) {
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
    foreach ($file in @('native/native-host.exe', 'native/security/policy.xml')) {
        if (!(Test-Path -LiteralPath (Join-Path $SourceRoot $file) -PathType Leaf)) { throw 'Paquet incomplet : compagnon ou politique de securite absent.' }
    }
    $diagnosis = Get-NextExplorerDiagnosis $InstallRoot $SourceRoot $ExtensionId $Browser
    $stable = Join-Path $InstallRoot 'com.local.file_explorer.json'
    $legacy = [IO.Path]::GetFullPath((Join-Path $SourceRoot 'native/com.local.file_explorer.json'))
    $mappings = [ordered]@{ Chrome = 'Google\Chrome'; Edge = 'Microsoft\Edge'; Chromium = 'Chromium' }
    $registrations = @{}
    $targets = @()
    $preserved = @()
    foreach ($name in $mappings.Keys) {
        if ($Browser -ne 'All' -and $Browser -ne $name) { continue }
        $key = $mappings[$name]
        $value = Get-HostRegistration $key
        $registrations[$key] = $value
        $owned = !$value
        if ($value -match '^[A-Za-z]:[\\/]') {
            $path = [IO.Path]::GetFullPath($value)
            $owned = $path -ieq $stable -or $path -ieq $legacy
        }
        if ($owned) { $targets += $key } else { $preserved += $name }
    }
    $errors = @($diagnosis.checks | Where-Object {
        $_.status -eq 'error' -and $_.id -notin @($preserved | ForEach-Object { 'browser-' + $_ })
    })
    $manifestHash = if (Test-Path -LiteralPath $stable) { (Get-FileHash -LiteralPath $stable).Hash } else { '' }
    $engineDirectory = ''
    $choices = @()
    $versions = Join-Path $InstallRoot 'versions'
    $block = ''
    if (!$targets.Count) { $block = 'Le navigateur choisi pointe vers une autre installation. Son enregistrement sera conserve.' }
    if ($errors.Count) {
        if (Test-Path -LiteralPath $versions -PathType Container) {
            if ((Get-Item -LiteralPath $versions).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Le dossier versions est un lien : reparation automatique refusee.' }
            $choices = @(Get-ChildItem -LiteralPath $versions -Directory | Where-Object {
                $_.Name -match '^[a-f0-9]{32}$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
                (Test-Path -LiteralPath (Join-Path $_.FullName 'tools') -PathType Container)
            })
        }
        if ($RecoveryVersion) {
            $chosen = @($choices | Where-Object { $_.Name -ceq $RecoveryVersion })
            if ($chosen.Count -ne 1) { throw 'RecoveryVersion doit identifier une copie existante contenant des moteurs.' }
            $engineDirectory = $chosen[0].FullName
        } else {
            # Even a manifest with invalid origins may still identify its engine directory.
            try {
                $old = [IO.File]::ReadAllText($stable) | ConvertFrom-Json
                if ($old.path -match '^[A-Za-z]:[\\/]') {
                    $oldDirectory = Split-Path ([IO.Path]::GetFullPath($old.path)) -Parent
                    $active = @($choices | Where-Object { $_.FullName -ieq $oldDirectory })
                    if ($active.Count -eq 1) { $engineDirectory = $active[0].FullName }
                }
            } catch { }
            if (!$engineDirectory -and $choices.Count -eq 1) { $engineDirectory = $choices[0].FullName }
            if (!$engineDirectory -and $choices.Count -gt 1) {
                $block = 'Plusieurs copies contiennent des moteurs. Choisissez -RecoveryVersion parmi : ' + (($choices | ForEach-Object Name) -join ', ')
            }
        }
    }
    return [pscustomobject]@{
        installRoot = $InstallRoot; sourceRoot = $SourceRoot; extensionId = $ExtensionId
        browser = $Browser; recoveryVersion = $RecoveryVersion
        needsRepair = $errors.Count -gt 0; blocked = $block; targets = $targets
        preserved = $preserved; registrations = $registrations; manifestHash = $manifestHash
        engineDirectory = $engineDirectory; errors = $errors
    }
}

function Invoke-NextExplorerRepair($Plan) {
    # Recompute before writing: a stale preview must not overwrite another installation.
    $fresh = Get-NextExplorerRepairPlan $Plan.installRoot $Plan.sourceRoot $Plan.extensionId $Plan.browser $Plan.recoveryVersion
    if ($fresh.blocked) { throw $fresh.blocked }
    if ($fresh.manifestHash -cne $Plan.manifestHash -or $fresh.engineDirectory -ine $Plan.engineDirectory -or
        ($fresh.targets -join '|') -cne ($Plan.targets -join '|')) { throw 'Installation modifiee depuis l apercu. Relancez la commande.' }
    foreach ($key in $Plan.registrations.Keys) {
        if ($fresh.registrations[$key] -cne $Plan.registrations[$key]) { throw 'Enregistrement modifie depuis l apercu. Relancez la commande.' }
    }
    if (!$fresh.needsRepair) { return $null }
    $stable = Join-Path $Plan.installRoot 'com.local.file_explorer.json'
    $backup = Join-Path $Plan.installRoot ('backups/' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    if (Test-Path -LiteralPath $stable) { Copy-Item -LiteralPath $stable -Destination (Join-Path $backup 'com.local.file_explorer.json') }
    [IO.File]::WriteAllText((Join-Path $backup 'registrations.json'), ($Plan.registrations | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    Install-NextExplorerHost -SourceRoot $Plan.sourceRoot -InstallRoot $Plan.installRoot -ExtensionId $Plan.extensionId -Browsers $fresh.targets -Repair -RecoveryDirectory $fresh.engineDirectory -ExpectedRegistrations $fresh.registrations | Out-Null
    return $backup
}
