param([string]$ExtensionId, [switch]$Uninstall)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
$root = Split-Path $PSScriptRoot -Parent
$localData = [Environment]::GetFolderPath('LocalApplicationData')
if (!$localData) { throw 'Le dossier de donnees local de cet utilisateur est introuvable.' }
$installRoot = Join-Path $localData 'Programs/NextExplorer'
if ($Uninstall) {
 Unregister-NextExplorerHost $installRoot $root
 Write-Output 'Enregistrement du compagnon retire. Copies installees, reglages et fichiers conserves.'
 exit
}
if (!$ExtensionId) { $ExtensionId = (Get-Content -Raw -LiteralPath (Join-Path $root 'extension-id.txt')).Trim() }
$manifest = Install-NextExplorerHost $root $installRoot $ExtensionId
Write-Output ('Compagnon installe pour cet utilisateur : ' + $installRoot)
Write-Output ('Manifeste enregistre : ' + $manifest)
Write-Output 'Desactivez puis reactivez l extension si un ancien compagnon est deja connecte.'
Write-Output ('Dans chrome://extensions, chargez le dossier : ' + (Join-Path $root 'dist'))
