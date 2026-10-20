# Visual smoke test only: never clicks Install, and always closes its own processes.
param([switch]$Isolated)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class SetupWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetLastActivePopup(IntPtr window);
  private delegate bool EnumProc(IntPtr window, IntPtr param);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr window, EnumProc callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr SendMessage(IntPtr window, uint msg, IntPtr wParam, StringBuilder text);
  [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] private static extern IntPtr SetWindowTextMessage(IntPtr window, uint msg, IntPtr wParam, string text);
  [DllImport("user32.dll", EntryPoint="SendMessageW")] public static extern IntPtr SendMessageValue(IntPtr window, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr FindButton(IntPtr parent, string prefix) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, delegate(IntPtr window, IntPtr p) {
      var text = new StringBuilder(1024); GetWindowText(window, text, text.Capacity);
      var type = new StringBuilder(128); GetClassName(window, type, type.Capacity);
      if (type.ToString().Contains("Button") || type.ToString().Contains("CheckBox"))
        if (text.ToString().Replace("&", "").StartsWith(prefix) && IsWindowEnabled(window) && IsWindowVisible(window)) found = window;
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string VisibleText(IntPtr parent) {
    var result = new StringBuilder();
    EnumChildWindows(parent, delegate(IntPtr window, IntPtr p) {
      if (IsWindowVisible(window)) {
        var text = new StringBuilder(16384); SendMessage(window, 0xD, (IntPtr)text.Capacity, text);
        result.AppendLine(text.ToString());
      }
      return true;
    }, IntPtr.Zero);
    return result.ToString();
  }
  public static IntPtr[] Edits(IntPtr parent) {
    var edits = new List<IntPtr>();
    EnumChildWindows(parent, delegate(IntPtr window, IntPtr p) {
      var type = new StringBuilder(128); GetClassName(window, type, type.Capacity);
      if (IsWindowVisible(window) && type.ToString().EndsWith("Edit")) edits.Add(window);
      return true;
    }, IntPtr.Zero);
    return edits.ToArray();
  }
  public static string Text(IntPtr window) {
    var text = new StringBuilder(4096); SendMessage(window, 0xD, (IntPtr)text.Capacity, text); return text.ToString();
  }
  public static void SetText(IntPtr window, string text) { SetWindowTextMessage(window, 0xC, IntPtr.Zero, text); }
}
'@
$root = Split-Path $PSScriptRoot -Parent
$outDir = Join-Path $root 'test-results'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$setup = Join-Path $root 'release/NextExplorer-Setup.exe'
if ($Isolated) {
    $testRoot = Join-Path $outDir ('setup-ui-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $payload = Join-Path $testRoot 'payload'
    Copy-Item -LiteralPath (Join-Path $root 'release/NextExplorer') -Destination $payload -Recurse
    $backendPath = Join-Path $payload 'scripts/setup-host.ps1'
    $backend = [IO.File]::ReadAllText($backendPath)
    $anchor = ". (Join-Path `$PSScriptRoot 'setup-workflow.ps1')"
    $backend = $backend.Replace($anchor, ($anchor + @'

function Get-HostRegistration { return $null }
function Set-HostRegistration { throw 'UI fixture must never write registry' }
function Remove-HostRegistration { throw 'UI fixture must never write registry' }
if ($Operation -eq 'Apply') { throw 'UI fixture must never install' }
'@))
    $backend = $backend.Replace("    `$installRoot = Join-Path `$localData 'Programs/NextExplorer'", "    `$installRoot = Join-Path `$PSScriptRoot 'ui-test-installation'")
    [IO.File]::WriteAllText($backendPath, $backend, (New-Object Text.UTF8Encoding $false))
    & (Join-Path $PSScriptRoot 'build-setup.ps1') -PackageRoot $payload -OutputRoot $testRoot | Out-Null
    $setup = Join-Path $testRoot 'NextExplorer-Setup.exe'
}
# A unique executable name also identifies Inno's child process without matching another installation.
$processName = 'NextExplorer-Setup-ui-' + [guid]::NewGuid().ToString('N')
$testExe = Join-Path (Split-Path $setup) ($processName + '.exe')
Copy-Item -LiteralPath $setup -Destination $testExe
$setup = $testExe
$started = Get-Date
$launcher = $null
function Get-TestProcesses {
    return @(Get-Process | Where-Object { $_.ProcessName -like ($processName + '*') -and $_.StartTime -ge $started })
}
function Click-Button([string]$Prefix) {
    $button = [SetupWindowCapture]::FindButton($handle, $Prefix)
    if ($button -eq [IntPtr]::Zero) { throw ('Expected button unavailable: ' + $Prefix + '; Install will never be clicked') }
    [SetupWindowCapture]::PostMessage($button, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
}
function Wait-Page([string]$Text) {
    $deadline = (Get-Date).AddSeconds(20)
    do {
        if ([SetupWindowCapture]::GetLastActivePopup($handle) -ne $handle) {
            Capture-Setup ([SetupWindowCapture]::GetLastActivePopup($handle)) 'setup-preview-message.png'
            throw 'Unexpected installer message'
        }
        if ([SetupWindowCapture]::VisibleText($handle).Contains($Text)) { return }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)
    throw ('Expected installer page not reached: ' + $Text)
}
function Capture-Setup([IntPtr]$Handle, [string]$Name) {
    $rect = New-Object SetupWindowCapture+Rect
    if (![SetupWindowCapture]::GetWindowRect($Handle, [ref]$rect)) { throw 'Window unavailable' }
    $bitmap = New-Object Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $dc = $graphics.GetHdc()
    try {
        if (![SetupWindowCapture]::PrintWindow($Handle, $dc, 2)) { throw 'Window capture failed' }
    } finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
    try { $bitmap.Save((Join-Path $outDir $Name), [Drawing.Imaging.ImageFormat]::Png) }
    finally { $bitmap.Dispose() }
}
try {
    $launcher = Start-Process -FilePath $setup -ArgumentList '/SP-', '/LANG=french' -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(20)
    do {
        $windowProcess = Get-TestProcesses | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
        if (!$windowProcess) { Start-Sleep -Milliseconds 200 }
    } until ($windowProcess -or (Get-Date) -ge $deadline)
    if (!$windowProcess) { throw 'Setup window not found' }
    $handle = $windowProcess.MainWindowHandle
    Capture-Setup $handle 'setup-welcome.png'
    Click-Button 'Suivant'
    Wait-Page 'Votre navigateur'
    Capture-Setup $handle 'setup-browser.png'
    $advanced = [SetupWindowCapture]::FindButton($handle, 'Afficher les')
    if ($advanced -eq [IntPtr]::Zero) { throw 'Advanced settings toggle missing' }
    if ([SetupWindowCapture]::SendMessageValue($advanced, 0xF0, [IntPtr]::Zero, [IntPtr]::Zero) -ne [IntPtr]::Zero) { throw 'Advanced settings enabled by default' }
    Click-Button 'Suivant'
    Wait-Page 'Corrections pr'
    if ([SetupWindowCapture]::Edits($handle).Length -ne 0) { throw 'Normal path exposes technical inputs' }
    Capture-Setup $handle 'setup-preview.png'
    Click-Button 'Pr'
    Wait-Page 'Votre navigateur'
    Click-Button 'Afficher les'
    Click-Button 'Suivant'
    Wait-Page 'Uniquement pour une'
    $edits = [SetupWindowCapture]::Edits($handle)
    if ($edits.Length -ne 2) { throw 'Advanced settings do not expose the two repair inputs' }
    $expectedId = (Get-Content -LiteralPath (Join-Path $root 'extension-id.txt') -Raw).Trim()
    if ([SetupWindowCapture]::Text($edits[0]) -ne $expectedId) { throw 'Packaged identity missing' }
    Capture-Setup $handle 'setup-advanced.png'
    [SetupWindowCapture]::SetText($edits[0], 'invalid-id')
    [SetupWindowCapture]::SetText($edits[1], 'invalid-recovery')
    Click-Button 'Pr'
    Wait-Page 'Votre navigateur'
    Click-Button 'Afficher les'
    Click-Button 'Suivant'
    Wait-Page 'Corrections pr'
    Capture-Setup $handle 'setup-preview-defaults-restored.png'
    Click-Button 'Pr'
    Wait-Page 'Votre navigateur'
    Click-Button 'Afficher les'
    Click-Button 'Suivant'
    Wait-Page 'Uniquement pour une'
    $edits = [SetupWindowCapture]::Edits($handle)
    if ([SetupWindowCapture]::Text($edits[0]) -ne $expectedId -or [SetupWindowCapture]::Text($edits[1]) -ne '') { throw 'Hidden repair overrides were not reset' }
    Click-Button 'Suivant'
    Wait-Page 'Corrections pr'
    if ($Isolated -and (Test-Path -LiteralPath (Join-Path $payload 'scripts/ui-test-installation'))) { throw 'Preview wrote an installation' }
    Write-Output 'Setup UI: normal path skips technical fields; advanced inputs remain available; returning to normal discards hidden overrides; preview reached in both modes. Install never clicked.'
} finally {
    foreach ($process in Get-TestProcesses) {
        if (!$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($launcher) { $launcher.Dispose() }
}
