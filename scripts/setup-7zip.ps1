# Updates only the project/package portable engine; never the registered companion.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'native/tools'
$cache = Join-Path $root '.tools/engines'
$version = '26.03'
$digest = '0859c524b8a63551848f0c246abddcb1d0b7b656b0fbfe879f8d85e61a9e6edd'
$url = 'https://github.com/ip7z/7zip/releases/download/26.03/7z2603-x64.exe'
New-Item -ItemType Directory -Force -Path $target,$cache | Out-Null
$archive = Join-Path $cache '7z2603-x64.exe'
if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $digest) { throw '7-Zip: official release SHA256 mismatch' }
$bootstrap = Join-Path $target '7z.exe'
if (!(Test-Path -LiteralPath $bootstrap)) { throw 'A bootstrap 7-Zip is required in native/tools. Install it first with setup-engines.ps1.' }
$stage = Join-Path $cache ('7zip-stage-' + [guid]::NewGuid().ToString('N'))
& $bootstrap x $archive ('-o' + $stage) -y -bso0
if ($LASTEXITCODE -ne 0) { throw 'Cannot unpack verified 7-Zip release' }
$banner = (& (Join-Path $stage '7z.exe') i | Out-String)
if ($LASTEXITCODE -ne 0 -or $banner -notmatch '7-Zip 26\.03 ') { throw 'Unexpected extracted 7-Zip version' }
$backup = Join-Path $stage 'previous'
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($file in @('7z.exe','7z.dll')) {
    if (!(Test-Path -LiteralPath (Join-Path $stage $file))) { throw ('Missing engine file: ' + $file) }
    if (Test-Path -LiteralPath (Join-Path $target $file)) { Copy-Item -LiteralPath (Join-Path $target $file) -Destination $backup }
}
try {
    foreach ($file in @('7z.exe','7z.dll')) {
        Copy-Item -LiteralPath (Join-Path $stage $file) -Destination (Join-Path $target $file) -Force
        if ((Get-FileHash -LiteralPath (Join-Path $stage $file)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target $file)).Hash) { throw ('Engine copy mismatch: ' + $file) }
    }
    $banner = (& $bootstrap i | Out-String)
    if ($LASTEXITCODE -ne 0 -or $banner -notmatch '7-Zip 26\.03 ') { throw 'Updated 7-Zip could not start' }
} catch {
    foreach ($file in @('7z.exe','7z.dll')) {
        if (Test-Path -LiteralPath (Join-Path $backup $file)) { Copy-Item -LiteralPath (Join-Path $backup $file) -Destination (Join-Path $target $file) -Force }
    }
    throw
}
$notice = Join-Path $target '7zip-notices'
New-Item -ItemType Directory -Path $notice -Force | Out-Null
foreach ($file in @('License.txt','readme.txt','History.txt')) {
    if (Test-Path -LiteralPath (Join-Path $stage $file)) { Copy-Item -LiteralPath (Join-Path $stage $file) -Destination $notice -Force }
}
@{version=$version;source=$url;sha256=$digest;exeSha256=(Get-FileHash -LiteralPath $bootstrap).Hash;dllSha256=(Get-FileHash -LiteralPath (Join-Path $target '7z.dll')).Hash} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $notice 'release.json') -Encoding UTF8
Write-Output ('Portable 7-Zip ' + $version + ' verified and updated. Previous engine: ' + $backup)
