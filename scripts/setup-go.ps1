$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root '.tools'
New-Item -ItemType Directory -Force -Path $target | Out-Null
$release = (Invoke-RestMethod 'https://go.dev/dl/?mode=json')[0]
$asset = $release.files | Where-Object { $_.os -eq 'windows' -and $_.arch -eq 'amd64' -and $_.kind -eq 'archive' } | Select-Object -First 1
$archive = Join-Path $target $asset.filename
Invoke-WebRequest ('https://go.dev/dl/' + $asset.filename) -OutFile $archive -UseBasicParsing
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $asset.sha256) { throw 'SHA256 du compilateur incorrect' }
Expand-Archive -LiteralPath $archive -DestinationPath $target -Force
Write-Output ('Go installe dans ' + $target)
