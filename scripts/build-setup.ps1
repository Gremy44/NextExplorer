param(
    [string]$PackageRoot = '',
    [string]$OutputRoot = '',
    [ValidatePattern('^$|^[a-fA-F0-9]{40}$')]
    [string]$SigningCertificateThumbprint = ''
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (!$PackageRoot) { $PackageRoot = Join-Path $root 'release/NextExplorer' }
if (!$OutputRoot) { $OutputRoot = Join-Path $root 'release' }
$releaseVersion = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if ($releaseVersion -notmatch '^\d+(\.\d+){0,3}$') { throw 'Version de publication Chrome invalide dans package.json.' }
$packagedVersion = (Get-Content -LiteralPath (Join-Path $PackageRoot 'dist/manifest.json') -Raw | ConvertFrom-Json).version
if ($packagedVersion -ne $releaseVersion) { throw 'Le paquet Windows est perime : executez npm run package avant de construire l installateur.' }
$compiler = Join-Path $root '.tools/inno/ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Preparez le compilateur avec scripts/setup-inno.ps1.' }
$compilerArgs = @(
    ('/DPackageRoot=' + [IO.Path]::GetFullPath($PackageRoot))
    ('/DOutputRoot=' + [IO.Path]::GetFullPath($OutputRoot))
    ('/DReleaseVersion=' + $releaseVersion)
)
$nativeBinary = Join-Path $PackageRoot 'native/native-host.exe'
if ($SigningCertificateThumbprint) {
    $certificate = Get-Item -LiteralPath ('Cert:\CurrentUser\My\' + $SigningCertificateThumbprint)
    $usages = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
    if (!$certificate.HasPrivateKey -or $certificate.Subject -eq $certificate.Issuer -or !$certificate.Verify() -or '1.3.6.1.5.5.7.3.3' -notin $usages) {
        throw 'Un certificat de signature de code valide et approuve, avec sa cle privee, est requis. Un certificat autosigne ne convient pas.'
    }
    $signToolCommand = Get-Command signtool.exe -ErrorAction SilentlyContinue
    $signTool = if ($signToolCommand) { $signToolCommand.Source } else {
        Get-ChildItem -Path (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin/*/x64/signtool.exe') -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (!$signTool) { throw 'SignTool du SDK Windows est requis pour signer.' }
    & $signTool sign /sha1 $SigningCertificateThumbprint /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $nativeBinary
    if ($LASTEXITCODE -ne 0) { throw 'Signature du compagnon echouee.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $nativeBinary
    if ($signature.Status -ne 'Valid' -or !$signature.TimeStamperCertificate) { throw 'La signature horodatee du compagnon est invalide.' }
    $compilerArgs += '/DSigningEnabled'
    $compilerArgs += ('/SNextExplorer=$q' + $signTool + '$q sign /sha1 ' + $SigningCertificateThumbprint + ' /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $f')
}
& $compiler @compilerArgs (Join-Path $root 'installer/NextExplorer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Compilation de l installateur echouee.' }
$setupPath = Join-Path $OutputRoot ('NextExplorer-' + $releaseVersion + '-Setup.exe')
$setupSignature = Get-AuthenticodeSignature -LiteralPath $setupPath
if ($SigningCertificateThumbprint -and ($setupSignature.Status -ne 'Valid' -or !$setupSignature.TimeStamperCertificate)) { throw 'La signature horodatee de l installateur est invalide.' }
$hash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($setupPath + '.sha256'), ($hash + '  ' + [IO.Path]::GetFileName($setupPath) + "`n"), [Text.Encoding]::ASCII)
$report = [ordered]@{
    version = $releaseVersion
    files = @(
        [ordered]@{ file = [IO.Path]::GetFileName($setupPath); sha256 = $hash; authenticode = [string]$setupSignature.Status },
        [ordered]@{ file = 'native/native-host.exe'; sha256 = (Get-FileHash -LiteralPath $nativeBinary -Algorithm SHA256).Hash.ToLowerInvariant(); authenticode = [string](Get-AuthenticodeSignature -LiteralPath $nativeBinary).Status }
    )
    note = 'Signature et integrite uniquement : ce rapport ne certifie pas un verdict antivirus ou SmartScreen.'
}
[IO.File]::WriteAllText(($setupPath + '.security.json'), ($report | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
Write-Output ('Installateur : ' + $setupPath + ' ; signature : ' + $setupSignature.Status)
