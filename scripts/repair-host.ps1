param(
    [string]$ExtensionId,
    [ValidateSet('Chrome', 'Edge', 'Chromium', 'All')][string]$Browser = 'Chrome',
    [string]$RecoveryVersion,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
. (Join-Path $PSScriptRoot 'host-diagnostics.ps1')
. (Join-Path $PSScriptRoot 'host-repair.ps1')
try {
    $root = Split-Path $PSScriptRoot -Parent
    if (!$ExtensionId) { $ExtensionId = (Get-Content -LiteralPath (Join-Path $root 'extension-id.txt') -Raw).Trim() }
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    if (!$localData) { throw 'Dossier local utilisateur introuvable.' }
    $plan = Get-NextExplorerRepairPlan (Join-Path $localData 'Programs/NextExplorer') $root $ExtensionId $Browser $RecoveryVersion
    Write-Output ('Apercu de reparation - ' + $Browser)
    foreach ($check in $plan.errors) { Write-Output ('- ' + $check.message) }
    foreach ($name in $plan.preserved) { Write-Output ('- ' + $name + ' : autre installation, enregistrement conserve.') }
    if ($plan.blocked) { throw $plan.blocked }
    if (!$plan.needsRepair) { Write-Output 'Aucune correction necessaire. Aucun fichier modifie.'; exit 0 }
    Write-Output '- Sauvegarder le manifeste actuel et les enregistrements dans le dossier backups de l installation.'
    Write-Output '- Preparer une nouvelle copie du compagnon et de sa politique depuis ce paquet.'
    if ($plan.engineDirectory) { Write-Output ('- Conserver les moteurs de la copie ' + (Split-Path $plan.engineDirectory -Leaf) + ' et ajouter ceux du paquet.') }
    else { Write-Output '- Copier les moteurs presents dans le paquet. Les anciennes copies restent conservees.' }
    Write-Output ('- Retablir les enregistrements : ' + ($plan.targets -join ', ') + '.')
    if (!$Apply) { Write-Output 'Aucune modification. Relancez la meme commande avec -Apply pour appliquer ces corrections.'; exit 0 }
    $backup = Invoke-NextExplorerRepair $plan
    Write-Output ('Reparation appliquee. Sauvegarde locale : ' + $backup)
    Write-Output 'Desactivez puis reactivez l extension pour verifier la connexion et le protocole.'
} catch {
    Write-Error ('Reparation non terminee : ' + $_.Exception.Message) -ErrorAction Continue
    exit 1
}
