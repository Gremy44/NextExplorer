# Read-only installation checks. No executable is launched and no path is exported.
function New-HostCheck([string]$Id, [string]$Status, [string]$Message, [string]$Remedy = '') {
    return [pscustomobject]@{ id = $Id; status = $Status; message = $Message; remedy = $Remedy }
}
function Read-HostDiagnosticManifest([string]$Path, [string]$Origin) {
    $manifest = [IO.File]::ReadAllText($Path) | ConvertFrom-Json
    if ($manifest -isnot [pscustomobject] -or $manifest.name -cne 'com.local.file_explorer' -or $manifest.type -cne 'stdio') {
        throw 'Invalid manifest'
    }
    if ($manifest.path -isnot [string] -or $manifest.path -notmatch '^[A-Za-z]:[\\/]' -or $manifest.allowed_origins -isnot [array]) {
        throw 'Invalid manifest fields'
    }
    if ($manifest.allowed_origins -cnotcontains $Origin) { throw 'Extension origin missing' }
    foreach ($allowed in $manifest.allowed_origins) {
        if ($allowed -isnot [string] -or $allowed -cnotmatch '^chrome-extension://[a-p]{32}/$') { throw 'Invalid origin' }
    }
    return $manifest
}

function Get-NextExplorerDiagnosis(
    [string]$InstallRoot,
    [string]$SourceRoot,
    [string]$ExtensionId,
    [ValidateSet('Chrome', 'Edge', 'Chromium', 'All')][string]$Browser = 'Chrome'
) {
    if ($ExtensionId -cnotmatch '^[a-p]{32}$') { throw 'ID Chrome invalide (32 lettres a-p).' }
    $InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
    $manifestPath = Join-Path $InstallRoot 'com.local.file_explorer.json'
    $repair = 'Verifiez -ExtensionId, puis lancez scripts/repair-host.ps1 avec le meme -Browser pour voir les corrections. Ajoutez -Apply pour les appliquer avec sauvegarde. Consultez GUIDE_UTILISATION.md avant de choisir une copie de moteurs.'
    $checks = @()
    $manifest = $null
    $binary = $null
    $origin = 'chrome-extension://' + $ExtensionId + '/'
    try {
        $manifest = Read-HostDiagnosticManifest $manifestPath $origin
        $checks += New-HostCheck 'manifest' 'ok' 'Manifeste stable lisible et origine de l extension autorisee.'
    } catch {
        $checks += New-HostCheck 'manifest' 'error' 'Manifeste stable absent, inaccessible, invalide ou incompatible avec cet identifiant d extension.' $repair
    }
    if ($null -ne $manifest) {
        try {
            $candidate = [IO.Path]::GetFullPath($manifest.path)
            $prefix = (Join-Path $InstallRoot 'versions').TrimEnd('\') + '\'
            if (!$candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
                $candidate.Substring($prefix.Length) -notmatch '^[a-f0-9]{32}\\native-host\.exe$') {
                throw 'Unexpected binary location'
            }
            $binary = $candidate
            if (!(Test-Path -LiteralPath $binary -PathType Leaf) -or (Get-Item -LiteralPath $binary).Length -eq 0) {
                throw 'Missing binary'
            }
            $checks += New-HostCheck 'binary' 'ok' 'Compagnon present dans le dossier stable.'
        } catch {
            $checks += New-HostCheck 'binary' 'error' 'Compagnon absent, inaccessible, vide ou situe hors de l emplacement attendu.' $repair
        }
    }
    if ($binary) {
        $directory = Split-Path $binary -Parent
        try {
            $adjacent = Read-HostDiagnosticManifest (Join-Path $directory 'com.local.file_explorer.json') $origin
            if ([IO.Path]::GetFullPath($adjacent.path) -ine $binary -or
                (@($adjacent.allowed_origins | Sort-Object) -join '|') -cne (@($manifest.allowed_origins | Sort-Object) -join '|')) {
                throw 'Manifests differ'
            }
            $checks += New-HostCheck 'host-manifest' 'ok' 'Les deux manifestes correspondent.'
        } catch {
            $checks += New-HostCheck 'host-manifest' 'error' 'Le manifeste du compagnon est absent, inaccessible ou different du manifeste actif.' $repair
        }
        try {
            $policy = Join-Path $directory 'security/policy.xml'
            if (!(Test-Path -LiteralPath $policy -PathType Leaf) -or (Get-Item -LiteralPath $policy).Length -eq 0) { throw 'Missing policy' }
            $checks += New-HostCheck 'policy' 'ok' 'Fichier de politique de securite present.'
        } catch {
            $checks += New-HostCheck 'policy' 'error' 'Fichier de politique de securite absent, inaccessible ou vide.' $repair
        }
        foreach ($tool in @('ffmpeg', 'ffprobe', 'magick', 'exiftool', '7z', 'yt-dlp')) {
            try {
                $present = Test-Path -LiteralPath (Join-Path $directory ('tools/' + $tool + '.exe')) -PathType Leaf
                if (!$present) { $present = $null -ne (Get-Command ($tool + '.exe') -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1) }
                $message = if ($present) { 'Moteur optionnel detecte : ' + $tool + ' (execution non testee).' } else { 'Moteur optionnel absent : ' + $tool + '. L exploration reste disponible.' }
                $checks += New-HostCheck ('tool-' + $tool) 'info' $message
            } catch {
                $checks += New-HostCheck ('tool-' + $tool) 'warning' ('Detection du moteur optionnel impossible : ' + $tool + '.')
            }
        }
    }
    $browsers = [ordered]@{ Chrome = 'Google\Chrome'; Edge = 'Microsoft\Edge'; Chromium = 'Chromium' }
    $legacy = [IO.Path]::GetFullPath((Join-Path $SourceRoot 'native/com.local.file_explorer.json'))
    foreach ($name in $browsers.Keys) {
        if ($Browser -ne 'All' -and $Browser -ne $name) { continue }
        try {
            $registered = Get-HostRegistration $browsers[$name]
            if ($registered -and $registered -notmatch '^[A-Za-z]:[\\/]') { throw 'Invalid registration path' }
            if (!$registered) {
                $checks += New-HostCheck ('browser-' + $name) 'error' ($name + ' : compagnon non enregistre.') $repair
            } elseif ([IO.Path]::GetFullPath($registered) -ieq $manifestPath) {
                $checks += New-HostCheck ('browser-' + $name) 'ok' ($name + ' : enregistrement vers le manifeste stable.')
            } elseif ([IO.Path]::GetFullPath($registered) -ieq $legacy) {
                $checks += New-HostCheck ('browser-' + $name) 'error' ($name + ' : ancienne installation liee au dossier source.') $repair
            } else {
                $checks += New-HostCheck ('browser-' + $name) 'error' ($name + ' : enregistrement vers une autre installation.') 'Verifiez quelle installation vous souhaitez utiliser avant de relancer son installateur.'
            }
        } catch {
            $checks += New-HostCheck ('browser-' + $name) 'error' ($name + ' : enregistrement illisible ou invalide.') 'Relancez le diagnostic sous le compte Windows utilise par ce navigateur ; verifiez ses droits d acces.'
        }
    }
    $checks += New-HostCheck 'scope' 'info' 'Controle des fichiers et enregistrements uniquement. Verifiez la connexion et le protocole dans l extension ; aucun programme n a ete lance.'
    return [pscustomobject]@{
        schemaVersion = 1
        healthy = @($checks | Where-Object { $_.status -eq 'error' }).Count -eq 0
        browser = $Browser
        checks = $checks
    }
}
