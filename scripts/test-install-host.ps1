$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'test-host-registration.ps1')
. (Join-Path $PSScriptRoot 'host-installation.ps1')
$project = Split-Path $PSScriptRoot -Parent
$fixture = [IO.Path]::GetFullPath((Join-Path $project ('test-results/installer-' + [guid]::NewGuid().ToString('N'))))
# Accented paths without depending on the encoding of this PowerShell 5.1 file.
$source = Join-Path $fixture ('paquet ' + [char]0xE9 + ' test')
$installed = Join-Path $fixture ('companion ' + [char]0xE9 + ' stable')
$id = (Get-Content -LiteralPath (Join-Path $project 'extension-id.txt') -Raw).Trim()
New-Item -ItemType Directory -Path (Join-Path $source 'native/tools/exiftool_files/lib') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'native/native-host.exe') -Destination (Join-Path $source 'native/native-host.exe')
Copy-Item -LiteralPath (Join-Path $project 'native/security') -Destination (Join-Path $source 'native/security') -Recurse
Set-Content -LiteralPath (Join-Path $source 'native/tools/exiftool_files/lib/test.txt') -Value 'original'

# Only registry access is replaced. All copying and native execution are real.
$script:registrations = @{}
$script:failBrowser = ''
function Get-HostRegistration([string]$Browser) { return $script:registrations[$Browser] }
function Set-HostRegistration([string]$Browser, [string]$Manifest) {
    $script:registrations[$Browser] = $Manifest
    if ($Browser -eq $script:failBrowser) {
        $script:failBrowser = ''
        throw 'Simulated registry failure'
    }
}
function Remove-HostRegistration([string]$Browser) { $script:registrations.Remove($Browser) }
function Assert([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    Assert $failed 'Expected an error'
}
function Read-NativeBytes($Stream, [int]$Length) {
    $buffer = New-Object byte[] $Length
    $offset = 0
    while ($offset -lt $Length) {
        $task = $Stream.ReadAsync($buffer, $offset, $Length - $offset)
        if (!$task.Wait(10000)) { throw 'Native response timed out' }
        $read = $task.Result
        if ($read -eq 0) { throw 'Native response truncated' }
        $offset += $read
    }
    return ,$buffer
}
function Test-NativeHello([string]$Binary) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Binary
    $start.Arguments = 'chrome-extension://' + $id + '/'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        $process.Start() | Out-Null
        $request = [Text.Encoding]::UTF8.GetBytes('{"id":"installer-test","action":"HELLO","payload":{"protocolVersion":1}}')
        $length = [BitConverter]::GetBytes([uint32]$request.Length)
        $process.StandardInput.BaseStream.Write($length, 0, 4)
        $process.StandardInput.BaseStream.Write($request, 0, $request.Length)
        $process.StandardInput.BaseStream.Flush()
        $header = Read-NativeBytes $process.StandardOutput.BaseStream 4
        $size = [BitConverter]::ToUInt32($header, 0)
        Assert ($size -gt 0 -and $size -le 1048576) 'Invalid native frame size'
        $response = [Text.Encoding]::UTF8.GetString((Read-NativeBytes $process.StandardOutput.BaseStream $size)) | ConvertFrom-Json
        Assert ($response.status -eq 'SUCCESS' -and $response.data.protocolVersion -eq 1) 'Installed companion handshake failed'
        $process.StandardInput.Close()
        Assert ($process.WaitForExit(10000) -and $process.ExitCode -eq 0) 'Installed companion failed to exit'
    } finally {
        if ($process.Id -and !$process.HasExited) { $process.Kill(); $process.WaitForExit() }
        $process.Dispose()
    }
}

# Input errors must not create an installation or alter registrations.
Expect-Failure { Install-NextExplorerHost $source $installed 'INVALID' }
Expect-Failure { Install-NextExplorerHost (Join-Path $fixture 'missing') $installed $id }
Assert (!(Test-Path -LiteralPath $installed)) 'Invalid input created an installation'
$legacy = Join-Path $source ('native/' + $hostManifestName)
$script:registrations['Google\Chrome'] = $legacy
$manifestPath = Install-NextExplorerHost $source $installed $id
$first = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($browser in $hostBrowsers) { Assert ($script:registrations[$browser] -eq $manifestPath) 'Registration not migrated' }
Assert ($first.path.StartsWith($installed)) 'Binary is not in stable directory'
Assert (Test-Path -LiteralPath (Join-Path (Split-Path $first.path) 'security/policy.xml')) 'Security policy missing'
Assert ($first.allowed_origins[0] -eq ('chrome-extension://' + $id + '/')) 'Wrong origin'

# Move the source package inside the verified test workspace; the copy must still run.
$moved = Join-Path $fixture 'moved-package'
Assert ([IO.Path]::GetFullPath($source).StartsWith($fixture + '\') -and [IO.Path]::GetFullPath($moved).StartsWith($fixture + '\')) 'Move outside test workspace'
Move-Item -LiteralPath $source -Destination $moved
Test-NativeHello $first.path

# A package update merges engines, including nested directories, without touching the old version.
Set-Content -LiteralPath (Join-Path $moved 'native/tools/exiftool_files/lib/test.txt') -Value 'updated'
Install-NextExplorerHost $moved $installed $id | Out-Null
$second = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
Assert ($second.path -ne $first.path -and (Test-Path -LiteralPath $first.path)) 'Previous executable overwritten'
Assert ((Get-Content -LiteralPath (Join-Path (Split-Path $second.path) 'tools/exiftool_files/lib/test.txt')).Trim() -eq 'updated') 'Nested engines not updated'
Assert ((Get-Content -LiteralPath (Join-Path (Split-Path $first.path) 'tools/exiftool_files/lib/test.txt')).Trim() -eq 'original') 'Previous engines modified'

# A light reinstall preserves previously installed engines.
$toolsPath = Join-Path $moved 'native/tools'
Assert ([IO.Path]::GetFullPath($toolsPath).StartsWith($fixture + '\')) 'Rename outside test workspace'
Rename-Item -LiteralPath $toolsPath -NewName 'tools-saved'
Install-NextExplorerHost $moved $installed $id | Out-Null
$third = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
Assert (Test-Path -LiteralPath (Join-Path (Split-Path $third.path) 'tools/exiftool_files/lib/test.txt')) 'Light package lost engines'
Test-NativeHello $third.path

# Failed registration restores the active manifest and all previous registrations.
$before = [IO.File]::ReadAllText($manifestPath)
$script:registrations['Microsoft\Edge'] = 'C:\another-installation\manifest.json'
$script:failBrowser = 'Microsoft\Edge'
Expect-Failure { Install-NextExplorerHost $moved $installed $id }
Assert ([IO.File]::ReadAllText($manifestPath) -eq $before) 'Active manifest not restored'
Assert ($script:registrations['Google\Chrome'] -eq $manifestPath) 'Chrome registration not restored'
Assert ($script:registrations['Microsoft\Edge'] -eq 'C:\another-installation\manifest.json') 'Other registration not restored'
$script:registrations['Chromium'] = Join-Path $moved ('native/' + $hostManifestName)
Unregister-NextExplorerHost $installed $moved
Assert (!$script:registrations.ContainsKey('Google\Chrome') -and !$script:registrations.ContainsKey('Chromium')) 'Owned registrations retained'
Assert ($script:registrations.ContainsKey('Microsoft\Edge')) 'Foreign registration deleted'
Assert (Test-Path -LiteralPath $third.path) 'Unregister deleted installed files'

# First-install failure leaves no active manifest or newly added registration.
$script:registrations = @{}
$script:failBrowser = 'Microsoft\Edge'
$failedRoot = Join-Path $fixture 'failed-install'
Expect-Failure { Install-NextExplorerHost $moved $failedRoot $id }
Assert (!(Test-Path -LiteralPath (Join-Path $failedRoot $hostManifestName))) 'Failed first install left an active manifest'
Assert ($script:registrations.Count -eq 0) 'Failed first install left registrations'
Write-Output 'Installer: stable paths, accents, source move, native HELLO, engine updates/preservation, rollback and unregister ownership: OK (registry simulated).'
