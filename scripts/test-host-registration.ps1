$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'host-installation.ps1')
# Provider doubles keep this test away from the developer's registry.
$script:exists = $false
$script:value = $null
$script:created = 0
$script:denyWrite = $false
function Test-Path { param([string]$LiteralPath) return $script:exists }
function New-Item {
    param([string]$Path, [switch]$Force)
    if ($script:exists) { throw 'Existing key must retain its ACL and other values.' }
    $script:exists = $true
    $script:created++
}
function Set-Item {
    param([string]$LiteralPath, [string]$Value)
    if ($script:denyWrite) { throw 'Registry write denied' }
    $script:value = $Value
}
Set-HostRegistration 'Microsoft\Edge' 'first.json'
if (!$script:exists -or $script:created -ne 1 -or $script:value -ne 'first.json') { throw 'Fresh registration failed.' }
Set-HostRegistration 'Microsoft\Edge' 'second.json'
if ($script:created -ne 1 -or $script:value -ne 'second.json') { throw 'Existing registration recreated its key.' }
$script:denyWrite = $true
$rejected = $false
try { Set-HostRegistration 'Microsoft\Edge' 'denied.json' } catch {
    if ($_.Exception.Message -ne 'Registry write denied') { throw }
    $rejected = $true
}
if (!$rejected -or !$script:exists -or $script:created -ne 1 -or $script:value -ne 'second.json') { throw 'Denied write changed the existing key.' }
Write-Output 'Registration: create missing key, preserve existing key/ACL, propagate denied write without recreation: OK (provider simulated).'
