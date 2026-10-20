param(
    [string]$Source = '',
    [string]$Destination = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
& node (Join-Path $PSScriptRoot 'extension-identity.mjs') $projectRoot | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Identite de l extension incoherente. Corrigez la cle publique et extension-id.txt avant de preparer le paquet.' }
if (!$Source) { $Source = Join-Path $projectRoot 'dist' }
if (!$Destination) { $Destination = Join-Path $projectRoot 'release/store' }
$Source = [IO.Path]::GetFullPath($Source)
$Destination = [IO.Path]::GetFullPath($Destination)
if ($Source -eq [IO.Path]::GetPathRoot($Source) -or $Destination -eq [IO.Path]::GetPathRoot($Destination)) { throw 'Un lecteur entier ne peut pas servir de dossier de paquet.' }
$Source = $Source.TrimEnd([char[]]'\/')
$Destination = $Destination.TrimEnd([char[]]'\/')
if ((Get-Item -LiteralPath $Source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Le dossier source ne doit pas etre un lien.' }
if ($Source -eq $Destination -or $Destination.StartsWith($Source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'La destination doit etre distincte du build source.' }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$' -or @($version.Split('.') | Where-Object { [long]$_ -gt 65535 }).Count -or $version -notmatch '[1-9]') { throw 'Version Chrome invalide dans package.json.' }
$manifest = Get-Content -LiteralPath (Join-Path $Source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or $manifest.version -ne $version) { throw 'Build absent ou perime : executez npm run build.' }
if ($manifest.key -cne (Get-Content -LiteralPath (Join-Path $projectRoot 'public/manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).key) { throw 'Identite du build perimee : executez npm run build.' }
if ($manifest.description.Length -gt 132) { throw 'Description du manifeste trop longue.' }
if ($manifest.update_url) { throw 'update_url ne doit pas remplacer les mises a jour du Store.' }
$manifest.PSObject.Properties.Remove('key')
$releaseRoot = Join-Path $Destination $version
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
$staging = Join-Path $releaseRoot ('.build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
$zipPath = Join-Path $releaseRoot ('NextExplorer-' + $version + '-chrome.zip')
$zipTemporary = $staging + '.zip'
$inventory = @()
try {
    # Enumerate directories too: never follow a junction or symlink into private files.
    $pending = New-Object 'Collections.Generic.Queue[string]'
    $pending.Enqueue($Source)
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Dequeue() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('Lien interdit dans le build : ' + $item.Name) }
            if ($item.PSIsContainer) { $pending.Enqueue($item.FullName); continue }
            $relative = $item.FullName.Substring($Source.Length + 1).Replace('\', '/')
            if ($relative.EndsWith('.map')) { continue }
            $allowed = $relative -match '^(manifest\.json|index\.html|(?:background|collect-background|download-background|organization-background)\.js|icon(?:16|48|128)\.png|assets/[\w.-]+\.(?:js|mjs|css)|fonts/(?:[\w.-]+\.ttf|provenance\.json)|licenses/[\w@.-]+\.txt|pdfjs/cmaps/(?:[\w.-]+\.bcmap|LICENSE)|pdfjs/standard_fonts/(?:[\w.-]+\.(?:ttf|pfb)|LICENSE_FOXIT|LICENSE_LIBERATION))$'
            if (!$allowed) { throw ('Fichier inattendu dans le build : ' + $relative) }
            $target = Join-Path $staging $relative
            New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
            if ($relative -eq 'manifest.json') {
                [IO.File]::WriteAllText($target, ($manifest | ConvertTo-Json -Depth 50), $utf8)
            } elseif ($relative -match '\.(js|mjs|css)$') {
                $text = [IO.File]::ReadAllText($item.FullName)
                $text = [regex]::Replace($text, '(?m)^\s*//# sourceMappingURL=[^\r\n]*|/\*# sourceMappingURL=[\s\S]*?\*/', '')
                [IO.File]::WriteAllText($target, $text, $utf8)
            } else {
                Copy-Item -LiteralPath $item.FullName -Destination $target
            }
            $inventory += [ordered]@{ path = $relative; sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() }
        }
    }
    $inventory = @($inventory | Sort-Object { $_.path })
    foreach ($required in @('manifest.json','index.html','background.js','collect-background.js','download-background.js','organization-background.js','icon128.png','fonts/provenance.json','licenses/@xterm-xterm.txt')) {
        if ($required -notin $inventory.path) { throw ('Ressource manquante : ' + $required) }
    }
    $recordPath = Join-Path $releaseRoot 'release.json'
    if (Test-Path -LiteralPath $zipPath) {
        $previous = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if (($previous.files | ConvertTo-Json -Depth 5 -Compress) -ne ($inventory | ConvertTo-Json -Depth 5 -Compress) -or $previous.sha256 -ne (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
            throw 'Cette version possede deja un paquet different. Augmentez package.json version avant une nouvelle release.'
        }
        Write-Output ('Paquet identique conserve : ' + $zipPath)
        return
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::CreateFromDirectory($staging, $zipTemporary, [IO.Compression.CompressionLevel]::Optimal, $false)
    $archive = [IO.Compression.ZipFile]::OpenRead($zipTemporary)
    try {
        if ($archive.Entries.Count -ne $inventory.Count) { throw 'Archive incomplete.' }
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            $expected = @($inventory | Where-Object { $_.path -ceq $name })
            if ($expected.Count -ne 1) { throw ('Entree ZIP inattendue : ' + $name) }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() } finally { $stream.Dispose(); $sha.Dispose() }
            if ($actual -ne $expected[0].sha256) { throw ('Archive corrompue : ' + $name) }
        }
    } finally { $archive.Dispose() }
    Move-Item -LiteralPath $zipTemporary -Destination $zipPath
    $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $record = [ordered]@{ version = $version; sha256 = $hash; identity = 'pending-store-assignment'; files = $inventory }
    [IO.File]::WriteAllText($recordPath, ($record | ConvertTo-Json -Depth 6), $utf8)
    [IO.File]::WriteAllText(($zipPath + '.sha256'), ($hash + '  ' + [IO.Path]::GetFileName($zipPath) + "`n"), $utf8)
    Write-Output ('Paquet Store prepare : ' + $zipPath)
} finally {
    $resolvedStaging = [IO.Path]::GetFullPath($staging)
    $expectedParent = [IO.Path]::GetFullPath($releaseRoot) + [IO.Path]::DirectorySeparatorChar
    if (!$resolvedStaging.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolvedStaging) -notmatch '^\.build-[0-9a-f]{32}$') { throw 'Nettoyage hors du dossier de preparation refuse.' }
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    if (Test-Path -LiteralPath $zipTemporary) { Remove-Item -LiteralPath $zipTemporary -Force }
}
