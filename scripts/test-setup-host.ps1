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

$script:registrations['Google\Chrome'] = $foreign
$preview = Get-NextExplorerSetupPreview $guiRoot $moved $id 'Chrome' ''
Assert ([bool]$preview.plan.blocked) 'GUI did not block a foreign registration'
Assert ($preview.text.Contains('autre installation')) 'GUI did not explain foreign registration'
Write-Output 'Setup workflow: preview without changes, serialized plan, native HELLO, no-op, mismatched roots and foreign registration: OK (registry simulated).'
