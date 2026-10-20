$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'test-repair-host.ps1')
. (Join-Path $PSScriptRoot 'setup-workflow.ps1')
$guiRoot = Join-Path $fixture 'gui-installation'
$stateFile = Join-Path $fixture 'gui-plan.xml'
$script:registrations.Remove('Google\Chrome')
$registryBefore = $script:registrations | ConvertTo-Json -Compress
$before = Snapshot-Repair
$preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
Assert ($preview.plan.needsRepair -and !$preview.plan.blocked) 'GUI preview rejected valid installation'
Assert ($preview.text.Contains('Corrections prevues')) 'GUI preview missing changes'
Assert (!(Test-Path -LiteralPath $guiRoot)) 'GUI preview created installation'
Assert ((Snapshot-Repair) -ceq $before) 'GUI preview modified fixture'
Assert (($script:registrations | ConvertTo-Json -Compress) -ceq $registryBefore) 'GUI preview changed registration'
$preview.plan | Export-Clixml -LiteralPath $stateFile -Depth 10
$backup = Invoke-NextExplorerSetupPlan $stateFile $guiRoot $moved
Assert (Test-Path -LiteralPath $backup) 'GUI apply did not create backup'
Assert (Get-NextExplorerDiagnosis $guiRoot $moved $id 'Chrome').healthy 'GUI apply produced invalid installation'
$manifest = [IO.File]::ReadAllText((Join-Path $guiRoot $hostManifestName)) | ConvertFrom-Json
Test-NativeHello $manifest.path
Assert ($script:registrations['Microsoft\Edge'] -eq $foreign) 'GUI apply changed unselected browser'

$preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
Assert (!$preview.plan.needsRepair) 'Healthy GUI preview schedules reinstall'
$preview.plan | Export-Clixml -LiteralPath $stateFile -Depth 10
$before = Snapshot-Repair
Invoke-NextExplorerSetupPlan $stateFile $guiRoot $moved | Out-Null
Assert ((Snapshot-Repair) -ceq $before) 'Healthy GUI apply changed files'
Expect-Failure { Invoke-NextExplorerSetupPlan $stateFile $installed $moved }
Expect-Failure { Invoke-NextExplorerSetupPlan $stateFile $guiRoot $fixture }

# A coherent installation must still upgrade a different companion from the EXE.
$oldBinary = $manifest.path
$oldTools = Join-Path (Split-Path $oldBinary) 'tools/private-settings/nested.txt'
New-Item -ItemType Directory -Path (Split-Path $oldTools) -Force | Out-Null
[IO.File]::WriteAllText($oldTools, 'preserve installed engines')
$stream = [IO.File]::Open($oldBinary, [IO.FileMode]::Append)
try { $stream.WriteByte(0) } finally { $stream.Dispose() }
Assert (Get-NextExplorerDiagnosis $guiRoot $moved $id 'Chrome').healthy 'Upgrade fixture is structurally invalid'
Assert (!(Get-NextExplorerRepairPlan $guiRoot $moved $id 'Chrome').needsRepair) 'Plain repair unexpectedly schedules an upgrade'
$before = Snapshot-Repair
$preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
Assert ($preview.plan.needsRepair -and $preview.plan.needsUpdate) 'Healthy installation with older companion not scheduled for upgrade'
Assert ($preview.text.Contains('Mise a jour')) 'GUI does not explain the companion upgrade'
Assert ((Snapshot-Repair) -ceq $before) 'Upgrade preview modified files'
$preview.plan | Export-Clixml -LiteralPath $stateFile -Depth 10
$originalManifest = [IO.File]::ReadAllText((Join-Path $guiRoot $hostManifestName))
$script:failBrowser = 'Google\Chrome'
Expect-Failure { Invoke-NextExplorerSetupPlan $stateFile $guiRoot $moved }
Assert ([IO.File]::ReadAllText((Join-Path $guiRoot $hostManifestName)) -ceq $originalManifest) 'Failed update changed active companion'
Assert ($script:registrations['Google\Chrome'] -eq (Join-Path $guiRoot $hostManifestName)) 'Failed update changed registration'
Invoke-NextExplorerSetupPlan $stateFile $guiRoot $moved | Out-Null
$updated = [IO.File]::ReadAllText((Join-Path $guiRoot $hostManifestName)) | ConvertFrom-Json
Assert ($updated.path -ne $oldBinary -and (Test-Path -LiteralPath $oldBinary)) 'Update overwrote the previous companion'
Assert ((Get-FileHash -LiteralPath $updated.path).Hash -ceq (Get-FileHash -LiteralPath (Join-Path $moved 'native/native-host.exe')).Hash) 'Update did not activate the packaged companion'
Assert ([IO.File]::ReadAllText((Join-Path (Split-Path $updated.path) 'tools/private-settings/nested.txt')) -ceq 'preserve installed engines') 'Update lost installed engines'
Test-NativeHello $updated.path
Assert (!(Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' '').plan.needsRepair) 'Up-to-date companion schedules another update'

# Policy changes also update; a package changed after preview is rejected.
$policyFile = Join-Path $moved 'native/security/policy.xml'
$policyBytes = [IO.File]::ReadAllBytes($policyFile)
try {
    [IO.File]::AppendAllText($policyFile, "`r`n")
    $preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
    Assert $preview.plan.needsUpdate 'Changed security policy not scheduled for update'
    $preview.plan | Export-Clixml -LiteralPath $stateFile -Depth 10
    [IO.File]::AppendAllText($policyFile, "`r`n")
    $before = Snapshot-Repair
    Expect-Failure { Invoke-NextExplorerSetupPlan $stateFile $guiRoot $moved }
    Assert ((Snapshot-Repair) -ceq $before) 'Stale update preview wrote files'
} finally { [IO.File]::WriteAllBytes($policyFile, $policyBytes) }

$script:registrations['Google\Chrome'] = $foreign
$preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
Assert ([bool]$preview.plan.blocked) 'GUI did not block a foreign registration'
Assert ($preview.text.Contains('autre installation')) 'GUI did not explain foreign registration'
Write-Output 'Setup workflow: read-only preview, serialized plan, native HELLO, binary/policy update, engine preservation, rollback, stale-package rejection, no-op, mismatched roots and foreign registration: OK (registry simulated).'
