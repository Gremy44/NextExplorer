param(
    [ValidateSet('Preview', 'Apply')][string]$Operation,
    [string]$SourceRoot, [string]$OutputFile, [string]$StateFile,
    [string]$ExtensionId,
    [ValidateSet('Chrome', 'Edge', 'Chromium', 'All')][string]$Browser = 'Chrome',
    [string]$RecoveryVersion
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
. (Join-Path $PSScriptRoot 'host-diagnostics.ps1')
. (Join-Path $PSScriptRoot 'host-repair.ps1')
. (Join-Path $PSScriptRoot 'setup-workflow.ps1')
$resultCode = 0
try {
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    if (!$localData) { throw 'Compte Windows inaccessible.' }
    $installRoot = Join-Path $localData 'Programs/NextExplorer'
    if ($Operation -eq 'Preview') {
        $preview = Get-NextExplorerSetupPreview $installRoot $SourceRoot $ExtensionId $Browser $RecoveryVersion
        $text = $preview.text
        if ($preview.plan.blocked) { $resultCode = 2 }
        else { $preview.plan | Export-Clixml -LiteralPath $StateFile -Depth 10 }
    } else {
        $backup = Invoke-NextExplorerSetupPlan $StateFile $installRoot $SourceRoot
        $text = 'Compagnon installe ou deja coherent. Desactivez puis reactivez l extension pour verifier la connexion.'
        if ($backup) { $text += [Environment]::NewLine + 'Sauvegarde locale : ' + $backup }
    }
} catch {
    $text = 'Operation non terminee : ' + $_.Exception.Message
    $resultCode = 1
}
[IO.File]::WriteAllText($OutputFile, $text, (New-Object Text.UTF8Encoding $false))
exit $resultCode
