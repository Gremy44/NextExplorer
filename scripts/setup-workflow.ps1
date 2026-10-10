function Get-NextExplorerSetupPreview(
    [string]$InstallRoot, [string]$SourceRoot, [string]$ExtensionId,
    [string]$Browser, [string]$RecoveryVersion
) {
    $plan = Get-NextExplorerRepairPlan $InstallRoot $SourceRoot $ExtensionId $Browser $RecoveryVersion
    $lines = @('Navigateur : ' + $Browser, '')
    foreach ($check in $plan.errors) { $lines += '- ' + $check.message }
    foreach ($name in $plan.preserved) { $lines += '- ' + $name + ' : autre installation conservee.' }
    if ($plan.blocked) { $lines += ''; $lines += $plan.blocked }
    elseif ($plan.needsRepair) {
        $lines += @('', 'Corrections prevues :', '- Sauvegarder le manifeste et les enregistrements.', '- Installer une nouvelle copie du compagnon depuis ce paquet.')
        if ($plan.engineDirectory) { $lines += '- Recuperer les moteurs de la copie ' + (Split-Path $plan.engineDirectory -Leaf) + '.' }
        $lines += '- Ajouter les moteurs presents dans le paquet.'
        $lines += '- Enregistrer le compagnon pour : ' + ($plan.targets -join ', ') + '.'
    } else { $lines += 'Le compagnon est deja coherent : il sera conserve.' }
    $lines += @('', 'Le paquet de l extension sera copie dans le dossier de votre compte Windows.', 'Aucune installation silencieuse de l extension dans le navigateur.', 'Aucun moteur supplementaire ne sera telecharge.')
    return [pscustomobject]@{ plan = $plan; text = $lines -join [Environment]::NewLine }
}

function Invoke-NextExplorerSetupPlan([string]$StateFile, [string]$InstallRoot, [string]$SourceRoot) {
    $plan = Import-Clixml -LiteralPath $StateFile
    if ([IO.Path]::GetFullPath($plan.installRoot) -ine [IO.Path]::GetFullPath($InstallRoot) -or
        [IO.Path]::GetFullPath($plan.sourceRoot) -ine [IO.Path]::GetFullPath($SourceRoot)) {
        throw 'Le plan ne correspond pas au paquet ou a ce compte Windows. Relancez l apercu.'
    }
    return Invoke-NextExplorerRepair $plan
}
