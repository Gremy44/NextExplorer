param([switch]$SkipMediaDownloader)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root 'native/tools'
$cache = Join-Path $root '.tools/engines'
New-Item -ItemType Directory -Force -Path $target,$cache | Out-Null
$headers = @{ 'User-Agent' = 'NextExplorer-setup'; 'Accept' = 'application/vnd.github+json' }
function Download([string]$url,[string]$file,[string]$digest) {
 if (!(Test-Path -LiteralPath $file)) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file }
 if ($digest -and $digest.StartsWith('sha256:')) {
  if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() -ne $digest.Substring(7)) { throw ('Somme incorrecte : ' + $file) }
 }
 Write-Output ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash + '  ' + (Split-Path $file -Leaf)) | Add-Content -LiteralPath (Join-Path $target 'DOWNLOADS.sha256')
}
if (!(Test-Path -LiteralPath (Join-Path $target '7z.exe'))) {
 Write-Output 'Installation portable de 7-Zip...'
 $page = (Invoke-WebRequest -UseBasicParsing 'https://www.7-zip.org/download.html').Content
 $asset = [regex]::Match($page,'a/(7z[0-9]+-x64\.exe)').Groups[1].Value
 if (!$asset) { throw 'Lien 7-Zip introuvable' }
 $bootstrap = Join-Path $cache '7zr.exe'
 Download 'https://www.7-zip.org/a/7zr.exe' $bootstrap ''
 $archive = Join-Path $cache $asset
 Download ('https://www.7-zip.org/a/' + $asset) $archive ''
 & $bootstrap x $archive ('-o' + $target) -y | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Extraction 7-Zip echouee' }
}
& (Join-Path $PSScriptRoot 'setup-7zip.ps1')
if (!(Test-Path -LiteralPath (Join-Path $target 'magick.exe'))) {
 Write-Output 'Installation portable ImageMagick...'
 $release = Invoke-RestMethod -Headers $headers 'https://api.github.com/repos/ImageMagick/ImageMagick/releases/latest'
 $asset = $release.assets | Where-Object { $_.name -match 'portable-Q16-x64\.7z$' } | Select-Object -First 1
 if (!$asset) { throw 'Archive ImageMagick introuvable' }
 $archive = Join-Path $cache $asset.name
 Download $asset.browser_download_url $archive $asset.digest
 & (Join-Path $target '7z.exe') x $archive ('-o' + $target) -y | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Extraction ImageMagick echouee' }
}
if (!(Test-Path -LiteralPath (Join-Path $target 'ffmpeg.exe'))) {
 Write-Output 'Installation portable FFmpeg et FFprobe...'
 $release = Invoke-RestMethod -Headers $headers 'https://api.github.com/repos/GyanD/codexffmpeg/releases/latest'
 $asset = $release.assets | Where-Object { $_.name -match 'essentials_build\.zip$' } | Select-Object -First 1
 if (!$asset) { throw 'Archive FFmpeg introuvable' }
 $archive = Join-Path $cache $asset.name
 Download $asset.browser_download_url $archive $asset.digest
 $extract = Join-Path $cache 'ffmpeg'
 Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
 foreach ($name in @('ffmpeg.exe','ffprobe.exe')) {
  $binary = Get-ChildItem -LiteralPath $extract -Filter $name -Recurse | Select-Object -First 1
  if (!$binary) { throw ('Binaire absent : ' + $name) }
  Copy-Item -LiteralPath $binary.FullName -Destination (Join-Path $target $name) -Force
 }
 Get-ChildItem -LiteralPath $extract -Filter 'LICENSE*' -Recurse | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $target ('FFMPEG-' + $_.Name)) -Force }
}
if (!(Test-Path -LiteralPath (Join-Path $target 'exiftool.exe'))) {
 Write-Output 'Installation portable ExifTool...'
 $package = Invoke-RestMethod 'https://registry.npmjs.org/exiftool-vendored.exe/latest'
 $archive = Join-Path $cache ('exiftool-' + $package.version + '.tgz')
 Download $package.dist.tarball $archive ''
 $algorithm,$expected = $package.dist.integrity.Split('-',2)
 if ($algorithm -ne 'sha512') { throw 'Algorithme npm inattendu' }
 $hasher = [Security.Cryptography.SHA512]::Create()
 $stream = [IO.File]::OpenRead($archive)
 try { $actual = [Convert]::ToBase64String($hasher.ComputeHash($stream)) } finally { $stream.Dispose(); $hasher.Dispose() }
 if ($actual -ne $expected) { throw 'Integrite ExifTool incorrecte' }
 $extract = Join-Path $cache 'exiftool'
 New-Item -ItemType Directory -Force -Path $extract | Out-Null
 & tar.exe -xf $archive -C $extract
 if ($LASTEXITCODE -ne 0) { throw 'Extraction ExifTool echouee' }
 $binary = Get-ChildItem -LiteralPath $extract -Filter 'exiftool.exe' -Recurse | Select-Object -First 1
 if (!$binary) { throw 'ExifTool absent du paquet' }
 Copy-Item -LiteralPath $binary.FullName -Destination (Join-Path $target 'exiftool.exe') -Force
 $support = Join-Path $binary.DirectoryName 'exiftool_files'
 if (Test-Path -LiteralPath $support) { Copy-Item -LiteralPath $support -Destination $target -Recurse -Force }
}
if (!$SkipMediaDownloader -and !(Test-Path -LiteralPath (Join-Path $target 'yt-dlp.exe'))) {
 Write-Output 'Installation portable yt-dlp...'
 $release = Invoke-RestMethod -Headers $headers 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest'
 $asset = $release.assets | Where-Object { $_.name -eq 'yt-dlp.exe' } | Select-Object -First 1
 if (!$asset) { throw 'yt-dlp introuvable' }
 Download $asset.browser_download_url (Join-Path $target 'yt-dlp.exe') $asset.digest
}
Write-Output ('Moteurs prets : ' + $target)
