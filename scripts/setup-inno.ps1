$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root '.tools/inno'
$download = Join-Path $root '.tools/innosetup-6.7.3.exe'
if (!(Test-Path -LiteralPath $download)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-6.7.3.exe' -OutFile $download
}
$signature = Get-AuthenticodeSignature -LiteralPath $download
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Pyrsys B\.V\.') {
    throw 'Signature du compilateur Inno Setup invalide ou editeur inattendu.'
}
$process = Start-Process -FilePath $download -ArgumentList @('/PORTABLE=1', '/CURRENTUSER', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/DIR="' + $target + '"')) -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0 -or !(Test-Path -LiteralPath (Join-Path $target 'ISCC.exe'))) { throw 'Preparation du compilateur echouee.' }
Write-Output ('Inno Setup 6.7.3 portable pret dans ' + $target)
