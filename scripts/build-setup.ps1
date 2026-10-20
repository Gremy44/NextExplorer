param([string]$PackageRoot = '', [string]$OutputRoot = '')
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
& $compiler ('/DPackageRoot=' + [IO.Path]::GetFullPath($PackageRoot)) ('/DOutputRoot=' + [IO.Path]::GetFullPath($OutputRoot)) ('/DReleaseVersion=' + $releaseVersion) (Join-Path $root 'installer/NextExplorer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Compilation de l installateur echouee.' }
