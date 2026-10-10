$ErrorActionPreference = 'Stop'
# Reuse real installed fixtures, registry doubles and the native HELLO check.
. (Join-Path $PSScriptRoot 'test-install-host.ps1')
. (Join-Path $PSScriptRoot 'host-diagnostics.ps1')
. (Join-Path $PSScriptRoot 'host-repair.ps1')
function Snapshot-Repair {
    return @(Get-ChildItem -LiteralPath $fixture -Recurse -File | Sort-Object FullName | ForEach-Object {
        $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName).Hash
    }) -join '|'
}
foreach ($browser in $hostBrowsers) { $script:registrations[$browser] = $manifestPath }
$foreign = 'C:\another-installation\manifest.json'
$script:registrations['Microsoft\Edge'] = $foreign
$recovery = Split-Path (Split-Path $third.path -Parent) -Leaf
$corrupt = '{ broken manifest'
[IO.File]::WriteAllText($manifestPath, $corrupt)

$before = Snapshot-Repair
$registryBefore = $script:registrations | ConvertTo-Json -Compress
$ambiguous = Get-NextExplorerRepairPlan $installed $moved $id 'All'
Assert ([bool]$ambiguous.blocked) 'Ambiguous engine recovery was not blocked'
Expect-Failure { Invoke-NextExplorerRepair $ambiguous }
$plan = Get-NextExplorerRepairPlan $installed $moved $id 'All' $recovery
Assert (!$plan.blocked -and $plan.needsRepair) 'Repair plan missing'
Assert ($plan.targets.Count -eq 2 -and $plan.preserved -contains 'Edge') 'Foreign registration not excluded'
Assert ((Snapshot-Repair) -ceq $before) 'Preview wrote files'
Assert (($script:registrations | ConvertTo-Json -Compress) -ceq $registryBefore) 'Preview wrote registry'

$backup = Invoke-NextExplorerRepair $plan
Assert ([IO.File]::ReadAllText((Join-Path $backup 'com.local.file_explorer.json')) -ceq $corrupt) 'Corrupt manifest not backed up'
$saved = [IO.File]::ReadAllText((Join-Path $backup 'registrations.json')) | ConvertFrom-Json
Assert ($saved.'Microsoft\Edge' -eq $foreign) 'Registration backup missing'
$repaired = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
Assert ($script:registrations['Microsoft\Edge'] -eq $foreign) 'Foreign registration overwritten'
Assert ($repaired.path -ne $third.path -and (Test-Path -LiteralPath $third.path)) 'Old copy changed'
Assert (Test-Path -LiteralPath (Join-Path (Split-Path $repaired.path) 'tools/exiftool_files/lib/test.txt')) 'Recovered engines missing'
Assert (Get-NextExplorerDiagnosis $installed $moved $id 'Chrome').healthy 'Repaired structure invalid'
Test-NativeHello $repaired.path

# Repeating repair on a healthy target is a no-op, even with foreign browsers.
$before = Snapshot-Repair
$healthy = Get-NextExplorerRepairPlan $installed $moved $id 'All'
Assert (!$healthy.needsRepair) 'Healthy repair should do nothing'
Assert ($null -eq (Invoke-NextExplorerRepair $healthy)) 'Unexpected repair on healthy installation'
Assert ((Snapshot-Repair) -ceq $before) 'No-op repair wrote files'

# Registration changes after preview must be preserved.
$script:registrations.Remove('Google\Chrome')
$stale = Get-NextExplorerRepairPlan $installed $moved $id 'Chrome'
$script:registrations['Google\Chrome'] = $foreign
$before = Snapshot-Repair
Expect-Failure { Invoke-NextExplorerRepair $stale }
Assert ((Snapshot-Repair) -ceq $before) 'Stale preview wrote files'
Assert ($script:registrations['Google\Chrome'] -eq $foreign) 'Stale preview overwrote foreign registry'
$script:registrations['Google\Chrome'] = $manifestPath

# A registration failure restores even a malformed original manifest.
[IO.File]::WriteAllText($manifestPath, $corrupt)
$rollbackPlan = Get-NextExplorerRepairPlan $installed $moved $id 'All' $recovery
$script:failBrowser = 'Chromium'
Expect-Failure { Invoke-NextExplorerRepair $rollbackPlan }
Assert ([IO.File]::ReadAllText($manifestPath) -ceq $corrupt) 'Failed repair did not restore corrupt original'
Assert ($script:registrations['Google\Chrome'] -eq $manifestPath -and $script:registrations['Chromium'] -eq $manifestPath) 'Failed repair did not restore registrations'
Assert ($script:registrations['Microsoft\Edge'] -eq $foreign) 'Failed repair changed foreign registration'

# Preserve the exact bytes even when the damaged file is not valid UTF-8.
$damagedBytes = [byte[]]@(255, 254, 0, 216, 123)
[IO.File]::WriteAllBytes($manifestPath, $damagedBytes)
$rollbackPlan = Get-NextExplorerRepairPlan $installed $moved $id 'All' $recovery
$script:failBrowser = 'Chromium'
Expect-Failure { Invoke-NextExplorerRepair $rollbackPlan }
Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($manifestPath)) -ceq [Convert]::ToBase64String($damagedBytes)) 'Damaged manifest bytes were not restored exactly'

# Changed manifest invalidates an existing preview before creating a backup.
$stale = Get-NextExplorerRepairPlan $installed $moved $id 'Chrome' $recovery
[IO.File]::WriteAllText($manifestPath, '{ changed externally')
$before = Snapshot-Repair
Expect-Failure { Invoke-NextExplorerRepair $stale }
Assert ((Snapshot-Repair) -ceq $before) 'Changed manifest was overwritten'

# Recover a missing installation with no engines; retain unselected browsers.
$newRoot = Join-Path $fixture 'fresh-repair'
$script:registrations.Remove('Google\Chrome')
$newPlan = Get-NextExplorerRepairPlan $newRoot $moved $id 'Chrome'
Invoke-NextExplorerRepair $newPlan | Out-Null
$newManifest = [IO.File]::ReadAllText((Join-Path $newRoot $hostManifestName)) | ConvertFrom-Json
Test-NativeHello $newManifest.path
Assert ($script:registrations['Microsoft\Edge'] -eq $foreign) 'Unselected browser changed'
Assert (Get-NextExplorerDiagnosis $newRoot $moved $id 'Chrome').healthy 'Fresh repair not functional'

Expect-Failure { Get-NextExplorerRepairPlan $installed $moved $id 'Chrome' '../../outside' }
Write-Output 'Repair: preview/no-op unchanged, corrupt manifest backup, engine recovery, foreign registry preservation, stale preview rejection, rollback and native HELLO: OK (registry simulated).'
