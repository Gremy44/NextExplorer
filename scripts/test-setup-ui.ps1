# Visual smoke test only: never clicks Install, and always closes its own processes.
param([switch]$Isolated)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
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
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint msg, IntPtr wParam, IntPtr lParam);
  public static IntPtr FindNext(IntPtr parent) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(parent, delegate(IntPtr window, IntPtr p) {
      var text = new StringBuilder(1024); GetWindowText(window, text, text.Capacity);
      if (text.ToString().Replace("&", "").StartsWith("Suivant") && IsWindowEnabled(window)) found = window;
      return true;
    }, IntPtr.Zero);
    return found;
  }
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
    & (Join-Path $root '.tools/inno/ISCC.exe') ('/DPackageRoot=' + $payload) ('/DOutputRoot=' + $testRoot) (Join-Path $root 'installer/NextExplorer.iss') | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'UI fixture compilation failed' }
    $setup = Join-Path $testRoot 'NextExplorer-Setup.exe'
}
$started = Get-Date
$launcher = $null
function Get-TestProcesses {
    return @(Get-Process | Where-Object { $_.ProcessName -like 'NextExplorer-Setup*' -and $_.StartTime -ge $started })
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
    foreach ($name in @('setup-welcome.png', 'setup-browser.png', 'setup-connection.png')) {
        Start-Sleep -Milliseconds 250
        Capture-Setup $handle $name
        $next = [SetupWindowCapture]::FindNext($handle)
        if ($next -eq [IntPtr]::Zero) { throw 'Next button not found; Install will never be clicked' }
        [SetupWindowCapture]::PostMessage($next, 0xF5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
        Start-Sleep -Milliseconds 500
    }
    Start-Sleep -Seconds 5
    Capture-Setup $handle 'setup-preview.png'
    $popup = [SetupWindowCapture]::GetLastActivePopup($handle)
    if ($popup -ne $handle) {
        Capture-Setup $popup 'setup-preview-message.png'
        if ($Isolated) { throw 'Isolated preview unexpectedly displayed an error' }
        Write-Output 'Setup UI: welcome, browser and connection reached; preview displayed a message. Install was never clicked.'
    } else {
        Write-Output 'Setup UI: welcome, browser, connection and preview reached; Install was never clicked.'
    }
} finally {
    foreach ($process in Get-TestProcesses) {
        if (!$process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($launcher) { $launcher.Dispose() }
}
