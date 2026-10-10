param(
    [string]$ExtensionId,
    [ValidateSet('Chrome', 'Edge', 'Chromium', 'All')][string]$Browser = 'Chrome',
    [switch]$Json
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
. (Join-Path $PSScriptRoot 'host-diagnostics.ps1')
$root = Split-Path $PSScriptRoot -Parent
try {
    if (!$ExtensionId) { $ExtensionId = (Get-Content -LiteralPath (Join-Path $root 'extension-id.txt') -Raw).Trim() }
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    if (!$localData) { throw 'Local data unavailable' }
    $report = Get-NextExplorerDiagnosis (Join-Path $localData 'Programs/NextExplorer') $root $ExtensionId $Browser
} catch {
    # Deliberately omit raw exception messages, which may contain personal paths.
    $report = [pscustomobject]@{
        schemaVersion = 1; healthy = $false; browser = $Browser
        checks = @(New-HostCheck 'diagnostic' 'error' 'Diagnostic impossible : identifiant invalide, paquet incomplet ou compte Windows inaccessible.' 'Verifiez le paquet et le parametre -ExtensionId (32 lettres a-p).')
    }
}
if ($Json) { $report | ConvertTo-Json -Depth 6 }
else {
    Write-Output ('Diagnostic NextExplorer - ' + $Browser)
    foreach ($check in $report.checks) {
        Write-Output ('[' + $check.status.ToUpper() + '] ' + $check.message)
        if ($check.remedy) { Write-Output ('  Action : ' + $check.remedy) }
    }
    if ($report.healthy) { Write-Output 'Structure de l installation coherente. Aucune modification effectuee.' }
    else { Write-Output 'Installation a verifier. Aucune modification effectuee.' }
}
if (!$report.healthy) { exit 1 }
exit 0
