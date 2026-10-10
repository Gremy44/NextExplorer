$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path $root ('test-results/acceptance-checker-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$sentinel = Join-Path $fixture 'personal.txt'
Set-Content -LiteralPath $sentinel -Value 'keep'
$install = Join-Path $fixture 'installation'
$evidence = Join-Path $fixture 'evidence'
$checker = Join-Path $PSScriptRoot 'check-setup-acceptance.ps1'
# Only existence of browser registry keys is mocked. Never write the real registry.
function Test-Path {
    param([string]$LiteralPath, [string]$Path, [string]$PathType)
    if ($LiteralPath -like 'HKCU:\Software\*\NativeMessagingHosts\com.local.file_explorer') { return $false }
    return Microsoft.PowerShell.Management\Test-Path @PSBoundParameters
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
Write-Output 'Acceptance checker: baseline, cancellation, changed sentinel, unexpected files, baseline preservation and evidence boundaries OK (registry existence mocked).'
