$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$setup = Join-Path $root ('release/NextExplorer-' + $version + '-Setup.exe')
$nativeBinary = Join-Path $root 'release/NextExplorer/native/native-host.exe'
$report = Get-Content -LiteralPath ($setup + '.security.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($report.version -ne $version) { throw 'Rapport de signature perime.' }
foreach ($file in @($setup, $nativeBinary)) {
    $reportName = if ($file -eq $nativeBinary) { 'native/native-host.exe' } else { [IO.Path]::GetFileName($file) }
    $entry = @($report.files | Where-Object { $_.file -eq $reportName })
    if ($entry.Count -ne 1 -or $entry[0].sha256 -ne (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()) { throw 'Empreinte du rapport incorrecte.' }
    if ($entry[0].authenticode -ne [string](Get-AuthenticodeSignature -LiteralPath $file).Status) { throw 'Etat de signature incorrect.' }
}
$beforeSetup = (Get-FileHash -LiteralPath $setup).Hash
$beforeNative = (Get-FileHash -LiteralPath $nativeBinary).Hash
if ((Get-Content -LiteralPath ($setup + '.sha256') -Raw).Split(' ')[0] -ne $beforeSetup.ToLowerInvariant()) { throw 'Fichier SHA256 incorrect.' }
$info = (Get-Item -LiteralPath $setup).VersionInfo
if ($info.CompanyName.Trim() -ne 'Gremy44' -or $info.ProductVersion.Trim() -ne $version -or $info.FileVersion.Trim() -ne $version) { throw 'Informations editeur/version incorrectes.' }
$log = Join-Path $root 'test-results/signing-rejection-1.log'
New-Item -ItemType Directory -Path (Split-Path $log -Parent) -Force | Out-Null
$previousErrorAction = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-setup.ps1') -SigningCertificateThumbprint ('0' * 40) *> $log
    $rejectionCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousErrorAction }
if ($rejectionCode -eq 0) { throw 'Le build a accepte un certificat absent.' }
if ((Get-FileHash -LiteralPath $setup).Hash -ne $beforeSetup -or (Get-FileHash -LiteralPath $nativeBinary).Hash -ne $beforeNative) { throw 'Le rejet du certificat a modifie les executables.' }
Write-Output 'Setup build: publisher/version, signature report, SHA256 and missing-certificate rejection without binary mutation: OK.'
