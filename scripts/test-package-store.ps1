$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$testRoot = Join-Path $root ('test-results/store-package-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $testRoot 'source'
$output = Join-Path $testRoot 'output'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination $source -Recurse
$packager = Join-Path $PSScriptRoot 'package-store.ps1'
function Require($condition, $message) { if (!$condition) { throw $message } }
function Refuses($action, $message) {
    try { & $action; throw 'EXPECTED_FAILURE_MISSING' } catch {
        if ($_.Exception.Message -eq 'EXPECTED_FAILURE_MISSING' -or $_.Exception.Message -notmatch $message) { throw }
    }
}
$originalManifest = [IO.File]::ReadAllBytes((Join-Path $source 'manifest.json'))
Refuses { & $packager -Source ($source + '\') -Destination (Join-Path $source 'output') } 'destination doit etre distincte'
& $packager -Source $source -Destination $output
$zip = Get-ChildItem -LiteralPath $output -Filter '*.zip' -Recurse | Select-Object -ExpandProperty FullName
Require ($zip.Count -eq 1) 'Expected one Store ZIP'
$firstHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zip)
try {
    $manifestEntry = $archive.Entries | Where-Object { $_.FullName -eq 'manifest.json' }
    Require ($null -ne $manifestEntry) 'Manifest must be at ZIP root'
    $reader = New-Object IO.StreamReader($manifestEntry.Open())
    try { $manifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    Require (!$manifest.key) 'Development key leaked into Store manifest'
    Require ($manifest.version -eq (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version) 'Wrong release version'
    Require (!@($archive.Entries | Where-Object { $_.FullName -match '\.(exe|ps1|map|env)$' }).Count) 'Development files or binaries in Store ZIP'
    Require (@($archive.Entries | Where-Object { $_.FullName.Replace('\','/') -eq 'fonts/UbuntuMono-Regular.ttf' }).Count -eq 1) 'Local fonts missing'
} finally { $archive.Dispose() }
& $packager -Source $source -Destination $output
Require ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -eq $firstHash) 'Identical package was replaced'
Require ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $source 'manifest.json'))) -eq [Convert]::ToBase64String($originalManifest)) 'Source manifest changed'
$background = Join-Path $source 'background.js'
$originalScript = [IO.File]::ReadAllBytes($background)
try {
    [IO.File]::AppendAllText($background, "`n// changed release")
    Refuses { & $packager -Source $source -Destination $output } 'paquet different'
} finally { [IO.File]::WriteAllBytes($background, $originalScript) }
foreach ($unexpected in @('.env','native-host.exe','credentials.json')) {
    $injected = Join-Path $source $unexpected
    try {
        [IO.File]::WriteAllText($injected, 'SYNTHETIC TEST DATA')
        Refuses { & $packager -Source $source -Destination $output } 'Fichier inattendu'
    } finally { Remove-Item -LiteralPath $injected }
}
$icon = Join-Path $source 'icon128.png'
$originalIcon = [IO.File]::ReadAllBytes($icon)
try {
    Remove-Item -LiteralPath $icon
    Refuses { & $packager -Source $source -Destination $output } 'Ressource manquante'
} finally { [IO.File]::WriteAllBytes($icon, $originalIcon) }
try {
    $invalid = [Text.Encoding]::UTF8.GetString($originalManifest) | ConvertFrom-Json
    $invalid.key = 'SYNTHETIC-STALE-KEY'
    [IO.File]::WriteAllText((Join-Path $source 'manifest.json'), ($invalid | ConvertTo-Json -Depth 30))
    Refuses { & $packager -Source $source -Destination $output } 'Identite du build perimee'
} finally { [IO.File]::WriteAllBytes((Join-Path $source 'manifest.json'), $originalManifest) }
try {
    $invalid = [Text.Encoding]::UTF8.GetString($originalManifest) | ConvertFrom-Json
    $invalid.version = '999.0.0'
    [IO.File]::WriteAllText((Join-Path $source 'manifest.json'), ($invalid | ConvertTo-Json -Depth 30))
    Refuses { & $packager -Source $source -Destination $output } 'Build absent ou perime'
} finally { [IO.File]::WriteAllBytes((Join-Path $source 'manifest.json'), $originalManifest) }
Require ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -eq $firstHash) 'Failed build changed existing release'
Require (!@(Get-ChildItem -LiteralPath $output -Recurse -Force | Where-Object { $_.Name -like '.build-*' }).Count) 'Staging left behind'
Write-Output ('Store package tests passed: root manifest, local resources, key/maps removed, privacy/binary rejection, required files, stale build and immutable version. ' + $testRoot)
