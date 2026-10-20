param([string]$SetupPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$setup = if ($SetupPath) { (Resolve-Path -LiteralPath $SetupPath).Path } else { Join-Path $root 'release/NextExplorer-Setup.exe' }
if (!(Test-Path -LiteralPath $setup -PathType Leaf)) { throw 'Build setup first: npm run setup:build' }
$destination = Join-Path $root 'release/recette-windows'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $setup -Destination (Join-Path $destination 'NextExplorer-Setup.exe')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'check-setup-acceptance.ps1') -Destination $destination
Copy-Item -LiteralPath (Join-Path $root 'RECETTE_INSTALLATEUR.md') -Destination $destination
Copy-Item -LiteralPath (Join-Path $root 'AMELIORATIONS_FINDER.md') -Destination $destination
Copy-Item -LiteralPath (Join-Path $root 'REVUE_ERGONOMIE_OUTILS.md') -Destination $destination
Copy-Item -LiteralPath (Join-Path $root 'APERCUS_100_FORMATS.md') -Destination $destination
Copy-Item -LiteralPath (Join-Path $root 'CONSOLE_INTEGREE.md') -Destination $destination
$hash = (Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $destination 'SHA256.txt') -Value ($hash + '  NextExplorer-Setup.exe') -Encoding ASCII
Write-Output ('Acceptance kit prepared (not executed): ' + $destination)
