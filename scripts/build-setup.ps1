$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $root '.tools/inno/ISCC.exe'
if (!(Test-Path -LiteralPath $compiler)) { throw 'Preparez le compilateur avec scripts/setup-inno.ps1.' }
& $compiler ('/DPackageRoot=' + (Join-Path $root 'release/NextExplorer')) ('/DOutputRoot=' + (Join-Path $root 'release')) (Join-Path $root 'installer/NextExplorer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Compilation de l installateur echouee.' }
