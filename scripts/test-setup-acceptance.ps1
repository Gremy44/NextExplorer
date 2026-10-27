$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path $root ('test-results/acceptance-checker-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$sentinel = Join-Path $fixture 'personal.txt'
Set-Content -LiteralPath $sentinel -Value 'keep'
$install = Join-Path $fixture 'installation'
$evidence = Join-Path $fixture 'evidence'
$checker = Join-Path $PSScriptRoot 'check-setup-acceptance.ps1'
# Browser registry values are mocked. Never write the real registry.
$mockBrowserRegistrations = @{}
function Test-Path {
    param([string]$LiteralPath, [string]$Path, [string]$PathType)
    if ($LiteralPath -like 'HKCU:\Software\*\NativeMessagingHosts\com.local.file_explorer') { return $mockBrowserRegistrations.ContainsKey($LiteralPath) }
    return Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
}
function Get-Item {
    param([string]$LiteralPath)
    if ($mockBrowserRegistrations.ContainsKey($LiteralPath)) {
        $item = [pscustomobject]@{ Value=$mockBrowserRegistrations[$LiteralPath] }
        $item | Add-Member -MemberType ScriptMethod -Name GetValue -Value { param($Name) return $this.Value }
        return $item
    }
    return Microsoft.PowerShell.Management\Get-Item @PSBoundParameters
}
function Expect-Failure([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action | Out-Null } catch {
        if ($_.Exception.Message -notlike ('*' + $Message + '*')) { throw }
        $failed = $true
    }
    if (!$failed) { throw ('Expected rejection: ' + $Message) }
}
& $checker -Stage Baseline -InstallRoot $install -EvidenceRoot $evidence -PersonalFile $sentinel
& $checker -Stage Cancelled -InstallRoot $install -EvidenceRoot $evidence
Expect-Failure { & $checker -Stage Baseline -InstallRoot $install -EvidenceRoot $evidence -PersonalFile $sentinel } 'already recorded'
Set-Content -LiteralPath $sentinel -Value 'changed'
Expect-Failure { & $checker -Stage Cancelled -InstallRoot $install -EvidenceRoot $evidence } 'sentinel changed'
Set-Content -LiteralPath $sentinel -Value 'keep'
New-Item -ItemType Directory -Path $install | Out-Null
Set-Content -LiteralPath (Join-Path $install 'unexpected.txt') -Value 'unexpected'
Expect-Failure { & $checker -Stage Cancelled -InstallRoot $install -EvidenceRoot $evidence } 'Cancellation changed'
Expect-Failure { & $checker -Stage Baseline -InstallRoot $install -EvidenceRoot (Join-Path $install 'evidence') -PersonalFile $sentinel } 'Evidence must be outside'
Expect-Failure { & $checker -Stage Baseline -InstallRoot $install -EvidenceRoot (Join-Path $fixture 'other-evidence') -PersonalFile $sentinel } 'already exists'
$edgeInstall = Join-Path $fixture 'edge-installation'
$edgeEvidence = Join-Path $fixture 'edge-evidence'
$chromeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.local.file_explorer'
$edgeKey = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.local.file_explorer'
$mockBrowserRegistrations[$chromeKey] = 'C:\ForeignFixture\manifest.json'
& $checker -Stage Baseline -Browser Edge -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence -PersonalFile $sentinel
& $checker -Stage Cancelled -Browser Edge -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence
Expect-Failure { & $checker -Stage Cancelled -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence } 'Browser differs'
$mockBrowserRegistrations[$chromeKey] = 'C:\Changed\manifest.json'
Expect-Failure { & $checker -Stage Cancelled -Browser Edge -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence } 'Unselected browser registration changed'
$mockBrowserRegistrations[$chromeKey] = 'C:\ForeignFixture\manifest.json'
Copy-Item -LiteralPath (Join-Path $edgeEvidence 'Baseline.json') -Destination (Join-Path $edgeEvidence 'Repaired.json')
& $checker -Stage Uninstalled -Browser Edge -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence
$mockBrowserRegistrations[$edgeKey] = 'C:\Unexpected\manifest.json'
Expect-Failure { & $checker -Stage Uninstalled -Browser Edge -InstallRoot $edgeInstall -EvidenceRoot $edgeEvidence } 'Selected browser registration remains'
Write-Output 'Acceptance checker: baseline/cancellation boundaries, Edge selection and foreign Chrome preservation through uninstall OK (registry mocked).'
